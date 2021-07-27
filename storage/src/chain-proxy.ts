import { Contract, ContractReceipt, ContractTransaction } from "@ethersproject/contracts";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ConnectionInfo } from "@ethersproject/web";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, BigNumberish, ethers } from "ethers";
import { RelayContract, RelayContract__factory } from "../src-gen/types";
import { PROXY_INTERFACE } from "../src/config";
import { ProxyContractBuilder } from "./proxy-contract-builder";
import { StorageDiff, StorageDiffer } from "../src/get-diff";
import { logger } from "../src/logger";
import { getAllKeys, toParityQuantity, EVMOpcodes, toBlockNumber } from "../src/utils";
import { encodeBlockHeader, GetProof } from "../src/verify-proof";
import { TransactionResponse } from '@ethersproject/abstract-provider';

const KEY_VALUE_PAIR_PER_BATCH = 100;

export type ContractAddressMap = {
    srcContract?: string;
    relayContract: string;
    logicContract?: string;
    proxyContract?: string;
}

export type DeployingTransation  = TransactionResponse & {
    creates?: string;
}

export type RPCConfig = {
    gasLimit?: BigNumberish;
}

export type GetDiffMethod = 'srcTx' | 'storage';

export class ChainProxy {
    readonly values: Array<number> = [];
    readonly keys: Array<number> = [];
    private proxyContract: Contract;
    readonly proxyContractAddress: string | undefined;
    private srcContractAddress: string;
    private logicContractAddress: string | undefined;
    readonly relayContractAddress: string | undefined;
    readonly srcProvider: JsonRpcProvider;
    readonly srcProviderConnectionInfo: ConnectionInfo;
    readonly targetProviderConnectionInfo: ConnectionInfo;
    readonly targetProvider: JsonRpcProvider;
    readonly targetRPCConfig: RPCConfig;
    private relayContract: RelayContract;
    private deployer: SignerWithAddress;
    private differ: StorageDiffer;
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
        } catch(e) {
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
                
                this.migrationState = await this.relayContract?.getMigrationState(this.proxyContractAddress) ?? false;
            } catch(e) {
                logger.error(e);
                return false;
            }
        }

        // todo batch size in StorageDiffer
        this.differ = new StorageDiffer(this.srcProvider, this.targetProvider, );
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
        if (!this.relayContract) {
            logger.info('No address for relayContract given, deploying new relay contract...');
            const relayFactory = new RelayContract__factory(this.deployer);
            this.relayContract = await relayFactory.deploy();
            logger.info(`Relay contract address: ${this.relayContract.address}`);
        }
        let keys = await getAllKeys(this.srcContractAddress, this.srcProvider);
        srcBlock = toParityQuantity(srcBlock);
        let latestBlock = await this.srcProvider.send('eth_getBlockByNumber', [srcBlock, true]);
        // create a proof of the source contract's storage
        const initialValuesProof = new GetProof(await this.srcProvider.send("eth_getProof", [this.srcContractAddress, keys]));
    
        // update relay
        await this.relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);
    
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
        const logicContractByteCode: string = await this.createDeployingByteCode(this.srcContractAddress, this.srcProvider);
        const logicFactory = new ethers.ContractFactory([], logicContractByteCode, this.deployer);
        try {
            const logicContract = await logicFactory.deploy();
            this.logicContractAddress = logicContract.address;
        } catch(e) {
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
        } catch(e) {
            logger.error(e);
            return false;
        }
        return true;
    }

    private async initialStorageMigration(initialValuesProof: GetProof, stateRoot: string, blockNumber: string): Promise<boolean> {
        // migrate storage
        logger.debug('migrating storage');
        let proxyKeys: Array<String> = [];
        let proxyValues: Array<String> = [];
        for (const storageProof of initialValuesProof.storageProof) {
            proxyKeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
        }
        while (proxyKeys.length > 0) {
            await this.proxyContract.addStorage(proxyKeys.splice(0, KEY_VALUE_PAIR_PER_BATCH), proxyValues.splice(0, KEY_VALUE_PAIR_PER_BATCH));
        }
        logger.debug('done.');
    
        // validate migration
        //  getting account proof from source contract
        const sourceAccountProof = await initialValuesProof.optimizedProof(stateRoot, false);
    
        //  getting account proof from proxy contract
        const latestProxyChainBlock = await this.srcProvider.send('eth_getBlockByNumber', ["latest", false]);
        const proxyChainProof = new GetProof(await this.srcProvider.send("eth_getProof", [this.proxyContract.address, []]));
        const proxyAccountProof = await proxyChainProof.optimizedProof(latestProxyChainBlock.stateRoot, false);
    
        //  getting encoded block header
        const encodedBlockHeader = encodeBlockHeader(latestProxyChainBlock);

        try {
            await this.relayContract.verifyMigrateContract(sourceAccountProof, proxyAccountProof, encodedBlockHeader, this.proxyContract.address, ethers.BigNumber.from(latestProxyChainBlock.number).toNumber(), blockNumber, { gasLimit: this.targetRPCConfig.gasLimit });
        } catch(e) {
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
        } else if (!this.migrationState) {
            logger.error('Proxy contract is not initialized yet.');
            return false;
        } else if (changedKeys.length < 1) {
            logger.info('There are no changes to be synchronized.');
            return true;
        } else if (!this.relayContract) {
            logger.error('No address for relayContract given.');
            return false;
        }

        let latestBlock = await this.srcProvider.send('eth_getBlockByNumber', ["latest", true]);

        // create a proof of the source contract's storage for all the changed keys
        let changedKeysProof = new GetProof(await this.srcProvider.send("eth_getProof", [this.srcContractAddress, changedKeys]));

        // compute the optimized storage proof
        const rlpOptimized = changedKeysProof.optimizedStorageProof();

        // ensure that the old contract state equals the last synced storage hash
        try {
            const validated = await this.proxyContract.verifyOldContractStateProof(rlpOptimized);
            if (!validated) {
                logger.error('Could not verify old contract state proof');
                return false;
            };
        } catch(e) {
            logger.error('something went wrong');
            const regexr = new RegExp(/Reverted 0x(.*)/);
            const checker = regexr.exec(e.data);
            if (checker) {
                logger.error(`'${this.hex_to_ascii(checker[1])}'`);
                logger.fatal(e);
            }
            else logger.fatal(e);
            return false;
        }

        const rlpProof = await changedKeysProof.optimizedProof(latestBlock.stateRoot);
        await this.relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        // update the proxy storage
        let txResponse: ContractTransaction;
        let receipt: ContractReceipt;
        try {
            txResponse = await this.proxyContract.updateStorage(rlpProof, latestBlock.number);
            receipt = await txResponse.wait();
            logger.debug(receipt);
        } catch (e) {
            logger.error('something went wrong');
            const regexr = new RegExp(/Reverted 0x(.*)/);
            const checker = regexr.exec(e.data);
            if (checker) {
                logger.error(`'${this.hex_to_ascii(checker[1])}'`);
                logger.fatal(e);
            }
            else logger.fatal(e);
            return false;
        }

        return true;
    }

    async getDiff(method: GetDiffMethod, parameters: any): Promise<StorageDiff | undefined> {
        if (!this.initialized) {
            logger.error('ChainProxy is not initialized yet.');
            return undefined;
        }

        switch(method) {
            case 'storage':
                if (!this.proxyContractAddress) {
                    logger.error('Proxy address not given.');
                    return undefined;
                } else if (!this.migrationState) {
                    logger.error('Proxy contract is not initialized yet.');
                    return undefined;
                }
                return this.differ.getDiffFromStorage(this.srcContractAddress, this.proxyContractAddress, parameters.srcBlock, parameters.targetBlock);
            // srcTx is default
            default:
                if (this.relayContract && this.proxyContract) {
                    const synchedBlockNr = await this.relayContract.getCurrentBlockNumber(this.proxyContract.address);
                    if (parameters.srcBlock) {
                        const givenSrcBlockNr = await toBlockNumber(parameters.srcBlock, this.srcProvider);
                        if (synchedBlockNr.gte(givenSrcBlockNr)) {
                            logger.info(`Note: The given starting block nr (--src-BlockNr == ${givenSrcBlockNr}) for getting txs from the source contract is lower than the currently synched block nr of the proxyContract (${synchedBlockNr}). Hence, in the following txs may be displayed that are already synched with the proxy contract.`);
                        } 
                    } else {
                        // todo needs testing. What if proxy contract was not yet migrated?
                        parameters.srcBlock = synchedBlockNr.toNumber() + 1;
                    }
                }
                return this.differ.getDiffFromSrcContractTxs(this.srcContractAddress, parameters.targetBlock, parameters.srcBlock);
        }
    }

    async getLatestBlockNumber(): Promise<BigNumber> {
        if (!this.initialized) {
            logger.error('ChainProxy is not initialized yet.');
            return BigNumber.from(-1);
        }  else if (!this.relayContract) {
            logger.error('No address for relayContract given.');
            return BigNumber.from(-1);
        }

        return await this.relayContract.getLatestBlockNumber();
    }

    hex_to_ascii(str1) {
        var hex  = str1.toString();
        var str = '';
        for (var n = 0; n < hex.length; n += 2) {
            str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));
        }
        return str;
    }

    async createDeployingByteCode(srcAddress: string, provider: JsonRpcProvider): Promise<string> {
        let code: string = await provider.getCode(srcAddress);
        code = code.substring(2); // remove 0x

        let deploy_code = EVMOpcodes.contractByteCodeDeploymentPreamble;
        const pushOpCodeInt = parseInt(EVMOpcodes.PUSH1, 16);

        // Create Contract code deployment code
        let code_length: string = (code.length / 2).toString(16); //in hex
        
        code_length = (code_length.length % 2) ? `0${code_length}` : code_length;
        const code_length_length: number = code_length.length / 2;

        deploy_code += (pushOpCodeInt + code_length_length - 1).toString(16);
        deploy_code += code_length;
        deploy_code += EVMOpcodes.DUP1;

        let deploy_code_length: string = ((deploy_code.length / 2) + 9).toString(16);
        deploy_code_length = (deploy_code_length.length % 2) ? `0${deploy_code_length}`: deploy_code_length;
        // Check length of code length and add length accordingly
        deploy_code_length = ((deploy_code_length.length / 2) - 1 + (parseInt(deploy_code_length, 16))).toString(16);
        deploy_code_length = (deploy_code_length.length % 2) ? `0${deploy_code_length}` : deploy_code_length;
        deploy_code += (pushOpCodeInt + deploy_code_length.length / 2 - 1).toString(16);
        deploy_code += deploy_code_length;
        deploy_code += EVMOpcodes.PUSH1;
        deploy_code += '00';
        deploy_code += EVMOpcodes.CODECOPY;
        deploy_code += EVMOpcodes.PUSH1;
        deploy_code += '00';
        deploy_code += EVMOpcodes.RETURN;
        deploy_code += EVMOpcodes.STOP;

        deploy_code += code;

        return deploy_code;
    }
}