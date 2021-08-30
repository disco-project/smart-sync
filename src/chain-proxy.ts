import { Contract, ContractReceipt, ContractTransaction } from '@ethersproject/contracts';
import { JsonRpcProvider } from '@ethersproject/providers';
import { ConnectionInfo } from '@ethersproject/web';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BigNumberish, ethers } from 'ethers';
import { TransactionResponse } from '@ethersproject/abstract-provider';
import * as rlp from 'rlp';
import { RelayContract, RelayContract__factory } from '../src-gen/types';
import { PROXY_INTERFACE } from './config';
import DiffHandler from './diffHandler/DiffHandler';
import { logger } from './utils/logger';
import {
    getAllKeys, toParityQuantity, toBlockNumber, createDeployingByteCode, hex_to_ascii,
} from './utils/utils';
import GetProof from './proofHandler/GetProof';
import { BlockHeader } from './proofHandler/Types';
import ProxyContractBuilder from './utils/proxy-contract-builder';
import StorageDiff from './diffHandler/StorageDiff';

const KEY_VALUE_PAIR_PER_BATCH = 100;

export type ContractAddressMap = {
    srcContract?: string;
    relayContract?: string;
    logicContract?: string;
    proxyContract?: string;
}

export type DeployingTransation = TransactionResponse & {
    creates?: string;
}

export type RPCConfig = {
    gasLimit?: BigNumberish;
}

export type GetDiffMethod = 'srcTx' | 'storage';

export function encodeBlockHeader(blockHeader: BlockHeader): Buffer {
    // needed parameters for block header hash
    // https://ethereum.stackexchange.com/questions/67055/block-header-hash-verification
    const cleanBlockHeader = [
        blockHeader.parentHash,
        blockHeader.sha3Uncles,
        blockHeader.miner,
        blockHeader.stateRoot,
        blockHeader.transactionsRoot,
        blockHeader.receiptsRoot,
        blockHeader.logsBloom,
        ethers.BigNumber.from(blockHeader.difficulty).toHexString(),
        ethers.BigNumber.from(blockHeader.number).toHexString(),
        ethers.BigNumber.from(blockHeader.gasLimit).toHexString(),
        ethers.BigNumber.from(blockHeader.gasUsed).toHexString(),
        ethers.BigNumber.from(blockHeader.timestamp).toHexString(),
        blockHeader.extraData,
    ];
    if (blockHeader.mixHash && blockHeader.nonce) {
        // if chain is PoW
        cleanBlockHeader.push(blockHeader.mixHash);
        cleanBlockHeader.push(blockHeader.nonce);
    } // else chain is PoA
    return Buffer.from(rlp.encode(cleanBlockHeader));
}

export class ChainProxy {
    readonly values: Array<number> = [];

    readonly keys: Array<number> = [];

    private proxyContract: Contract;

    readonly proxyContractAddress: string | undefined;

    private srcContractAddress: string;

    private logicContractAddress: string | undefined;

    private relayContractAddress: string | undefined;

    readonly srcProvider: JsonRpcProvider;

    readonly srcProviderConnectionInfo: ConnectionInfo;

    readonly targetProviderConnectionInfo: ConnectionInfo;

    readonly targetProvider: JsonRpcProvider;

    readonly targetRPCConfig: RPCConfig;

    private relayContract: RelayContract;

    private deployer: SignerWithAddress;

    private differ: DiffHandler;

    public migrationState: Boolean;

    private initialized: Boolean;

    constructor(contractAddresses: ContractAddressMap, srcProviderConnectionInfo: ConnectionInfo, targetProviderConnectionInfo: ConnectionInfo, targetRPCConfig: RPCConfig) {
        if (contractAddresses.srcContract) {
            this.srcContractAddress = contractAddresses.srcContract;
        }
        this.logicContractAddress = contractAddresses.logicContract;
        this.relayContractAddress = contractAddresses.relayContract;
        this.proxyContractAddress = contractAddresses.proxyContract;
        this.srcProviderConnectionInfo = srcProviderConnectionInfo;
        this.srcProvider = new ethers.providers.JsonRpcProvider(this.srcProviderConnectionInfo);
        this.targetProviderConnectionInfo = targetProviderConnectionInfo;
        this.targetProvider = new ethers.providers.JsonRpcProvider(this.targetProviderConnectionInfo);
        this.targetRPCConfig = targetRPCConfig;
        this.initialized = false;
        this.migrationState = false;
    }

    async init(): Promise<Boolean> {
        try {
            this.deployer = await SignerWithAddress.create(this.targetProvider.getSigner());
        } catch (e) {
            logger.error(e);
            return false;
        }

        if (this.relayContractAddress) {
            const relayContractFactory = new RelayContract__factory(this.deployer);
            this.relayContract = relayContractFactory.attach(this.relayContractAddress);
        }

        if (this.proxyContractAddress) {
            try {
                // attach to proxy
                const compiledProxy = await ProxyContractBuilder.compiledAbiAndBytecode(this.relayContract?.address ?? this.proxyContractAddress, this.logicContractAddress ?? this.proxyContractAddress, this.srcContractAddress ?? this.proxyContractAddress);
                const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, this.deployer);
                this.proxyContract = proxyFactory.attach(this.proxyContractAddress);

                // get contract addresses from proxy
                this.srcContractAddress = await this.proxyContract.getSourceAddress();
                logger.debug(`srcContract: ${this.srcContractAddress}`);
                this.logicContractAddress = await this.proxyContract.getLogicAddress();

                this.relayContractAddress = await this.proxyContract.getRelayAddress();
                if (!this.relayContractAddress) {
                    logger.error('Could not get relay contract address.');
                    return false;
                }
                const relayContractFactory = new RelayContract__factory(this.deployer);
                this.relayContract = relayContractFactory.attach(this.relayContractAddress);

                this.migrationState = await this.relayContract.getMigrationState(this.proxyContractAddress);
            } catch (e) {
                logger.error(e);
                return false;
            }
        }

        // todo batch size in DiffHandler
        this.differ = new DiffHandler(this.srcProvider, this.targetProvider);
        this.initialized = true;
        return true;
    }

    /**
     *
     * @param srcBlock block from where to migrate src contract from
     * @returns bool indicating if migration was sucessfull or not
     */
    async migrateSrcContract(srcBlock: BigNumberish = 'latest'): Promise<Boolean> {
        if (!this.initialized) {
            logger.error('ChainProxy is not initialized yet.');
            return false;
        }
        if (!ethers.utils.isAddress(this.srcContractAddress)) {
            logger.error(`Given source contract address not a valid address (${this.srcContractAddress})`);
            return false;
        }
        if ((await this.srcProvider.getCode(this.srcContractAddress)).length < 3) {
            logger.error(`No contract found under src contract address ${this.srcContractAddress}.`);
            return false;
        }
        if (!this.relayContract) {
            logger.info('No address for relayContract given, deploying new relay contract...');
            const relayFactory = new RelayContract__factory(this.deployer);
            this.relayContract = await relayFactory.deploy();
            logger.info(`Relay contract address: ${this.relayContract.address}`);
        }
        const keys = await getAllKeys(this.srcContractAddress, this.srcProvider);
        const srcBlockParity = toParityQuantity(srcBlock);
        const latestBlock = await this.srcProvider.send('eth_getBlockByNumber', [srcBlockParity, true]);
        // create a proof of the source contract's storage
        const initialValuesProof = new GetProof(await this.srcProvider.send('eth_getProof', [this.srcContractAddress, keys]));

        // update relay
        await this.relayContract.addBlock(latestBlock.stateRoot, latestBlock.number);

        // deploy logic contract
        let result = await this.cloneLogic();
        if (!result) return false;

        // deploy empty proxy
        result = await this.deployProxy();
        if (!result) return false;

        // migrate storage
        result = await this.initialStorageMigration(initialValuesProof, latestBlock.stateRoot, latestBlock.number);
        if (!result) return false;

        logger.info(`Address of proxyContract: ${this.proxyContract.address}`);

        // todo write out all the addresses into a file?
        return true;
    }

    /**
     * deploy logic of source contract to target chain
     * @returns address of logic contract or undefined if error
     */
    private async cloneLogic(): Promise<Boolean> {
        logger.debug('cloning logic to target chain...');
        const logicContractByteCode: string = await createDeployingByteCode(this.srcContractAddress, this.srcProvider);
        const logicFactory = new ethers.ContractFactory([], logicContractByteCode, this.deployer);
        try {
            const logicContract = await logicFactory.deploy();
            this.logicContractAddress = logicContract.address;
        } catch (e) {
            logger.error(e);
            return false;
        }
        logger.debug('done.');
        logger.info(`Logic contract address: ${this.logicContractAddress}`);
        return true;
    }

    /**
     * deploy proxy contract to target chain
     * @returns address of proxy contract or undefined if error
     */
    private async deployProxy(): Promise<boolean> {
        if (this.logicContractAddress === undefined) {
            logger.error('Cannot deploy proxy when logic contract is still undefined.');
            return false;
        }
        const compiledProxy = await ProxyContractBuilder.compiledAbiAndBytecode(this.relayContract.address, this.logicContractAddress, this.srcContractAddress);
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, this.deployer);
        try {
            this.proxyContract = await proxyFactory.deploy();
        } catch (e) {
            logger.error(e);
            return false;
        }
        return true;
    }

    private async initialStorageMigration(initialValuesProof: GetProof, stateRoot: string, blockNumber: string): Promise<boolean> {
        // migrate storage
        logger.debug('migrating storage');
        const proxyKeys: Array<String> = [];
        const proxyValues: Array<String> = [];
        initialValuesProof.storageProof.forEach((storageProof) => {
            proxyKeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
        });

        const storageAdds: any = [];
        while (proxyKeys.length > 0) {
            storageAdds.push(this.proxyContract.addStorage(proxyKeys.splice(0, KEY_VALUE_PAIR_PER_BATCH), proxyValues.splice(0, KEY_VALUE_PAIR_PER_BATCH)));
        }
        await Promise.all(storageAdds);
        logger.debug('done.');

        // validate migration
        //  getting account proof from source contract
        const sourceAccountProof = await initialValuesProof.optimizedProof(stateRoot, false);

        //  getting account proof from proxy contract
        const latestProxyChainBlock = await this.srcProvider.send('eth_getBlockByNumber', ['latest', false]);
        const proxyChainProof = new GetProof(await this.srcProvider.send('eth_getProof', [this.proxyContract.address, []]));
        const proxyAccountProof = await proxyChainProof.optimizedProof(latestProxyChainBlock.stateRoot, false);

        //  getting encoded block header
        const encodedBlockHeader = encodeBlockHeader(latestProxyChainBlock);

        try {
            await this.relayContract.verifyMigrateContract(sourceAccountProof, proxyAccountProof, encodedBlockHeader, this.proxyContract.address, ethers.BigNumber.from(latestProxyChainBlock.number).toNumber(), blockNumber, { gasLimit: this.targetRPCConfig.gasLimit });
        } catch (e) {
            logger.error(e);
            return false;
        }

        //  validating
        const migrationValidated = await this.relayContract.getMigrationState(this.proxyContract.address);
        this.migrationState = migrationValidated;
        if (!this.migrationState) {
            logger.error('Could not migrate srcContract.');
            return false;
        }
        return true;
    }

    async migrateChangesToProxy(changedKeys: Array<BigNumberish>): Promise<Boolean> {
        if (!this.initialized) {
            logger.error('ChainProxy is not initialized yet.');
            return false;
        } if (!this.migrationState) {
            logger.error('Proxy contract is not initialized yet.');
            return false;
        } if (changedKeys.length < 1) {
            logger.info('There are no changes to be synchronized.');
            return true;
        } if (!this.relayContract) {
            logger.error('No address for relayContract given.');
            return false;
        }

        const latestBlock = await this.srcProvider.send('eth_getBlockByNumber', ['latest', true]);

        // create a proof of the source contract's storage for all the changed keys
        const changedKeysProof = new GetProof(await this.srcProvider.send('eth_getProof', [this.srcContractAddress, changedKeys]));

        const rlpProof = await changedKeysProof.optimizedProof(latestBlock.stateRoot);
        await this.relayContract.addBlock(latestBlock.stateRoot, latestBlock.number);

        // update the proxy storage
        let txResponse: ContractTransaction;
        let receipt: ContractReceipt;
        try {
            txResponse = await this.proxyContract.updateStorage(rlpProof, latestBlock.number, { gasLimit: this.targetRPCConfig.gasLimit });
            receipt = await txResponse.wait();
            logger.debug(receipt);
        } catch (e) {
            logger.error('something went wrong');
            const regexr = new RegExp(/Reverted 0x(.*)/);
            const checker = regexr.exec(e.data);
            if (checker) {
                logger.error(`'${hex_to_ascii(checker[1])}'`);
                logger.fatal(e);
            } else logger.fatal(e);
            return false;
        }

        return true;
    }

    async getDiff(method: GetDiffMethod, parameters: any): Promise<StorageDiff | undefined> {
        if (!this.initialized) {
            logger.error('ChainProxy is not initialized yet.');
            return undefined;
        }

        let { srcBlock } = parameters;
        switch (method) {
        case 'storage':
            if (!this.proxyContractAddress) {
                logger.error('Proxy address not given.');
                return undefined;
            } if (!this.migrationState) {
                logger.error('Proxy contract is not initialized yet.');
                return undefined;
            }
            return this.differ.getDiffFromStorage(this.srcContractAddress, this.proxyContractAddress, parameters.srcBlock, parameters.targetBlock);
            // srcTx is default
        default:
            if (this.relayContract && this.proxyContract) {
                const synchedBlockNr = await this.relayContract.getCurrentBlockNumber(this.proxyContract.address);
                if (srcBlock) {
                    const givenSrcBlockNr = await toBlockNumber(parameters.srcBlock, this.srcProvider);
                    if (synchedBlockNr.gte(givenSrcBlockNr)) {
                        logger.info(`Note: The given starting block nr (--src-BlockNr == ${givenSrcBlockNr}) for getting txs from the source contract is lower than the currently synched block nr of the proxyContract (${synchedBlockNr}). Hence, in the following txs may be displayed that are already synched with the proxy contract.`);
                    }
                } else {
                    srcBlock = synchedBlockNr.toNumber() + 1;
                }
            }
            return this.differ.getDiffFromSrcContractTxs(this.srcContractAddress, parameters.targetBlock, srcBlock);
        }
    }

    async getLatestBlockNumber(): Promise<BigNumber> {
        if (!this.initialized) {
            logger.error('ChainProxy is not initialized yet.');
            return BigNumber.from(-1);
        } if (!this.relayContract) {
            logger.error('No address for relayContract given.');
            return BigNumber.from(-1);
        }

        return this.relayContract.getLatestBlockNumber();
    }

    async getCurrentBlockNumber(): Promise<BigNumber> {
        if (!this.initialized) {
            logger.error('ChainProxy is not initialized yet.');
            return BigNumber.from(-1);
        } if (!this.relayContract) {
            logger.error('No address for relayContract given.');
            return BigNumber.from(-1);
        }

        return this.relayContract.getCurrentBlockNumber(this.proxyContract.address);
    }
}
