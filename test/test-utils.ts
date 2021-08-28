import { Contract } from '@ethersproject/contracts';
import { JsonRpcProvider } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumberish, ethers } from 'ethers';
import { HttpNetworkConfig } from 'hardhat/types';
import { Trie } from 'merkle-patricia-tree/dist/baseTrie';
import { MappingContract, RelayContract } from '../src-gen/types';
import { PROXY_INTERFACE } from '../src/config';
import ProxyContractBuilder from '../src/utils/proxy-contract-builder';
import DiffHandler from '../src/diffHandler/DiffHandler';
import { logger } from '../src/utils/logger';
import {
    encode, getAllKeys, hexStringToBuffer, hex_to_ascii,
} from '../src/utils/utils';
import GetProof, { encodeAccount, format_proof_nodes } from '../src/proofHandler/GetProof';
import { Account, StorageProof } from '../src/proofHandler/Types';
import { encodeBlockHeader } from '../src/chain-proxy';

const KEY_VALUE_PAIR_PER_BATCH = 100;

export interface InitializationResult {
    migrationState: Boolean;
    proxyContract: Contract;
    values: Array<number>;
    keys: Array<number>;
    max_mpt_depth: number;
    min_mpt_depth: number;
    initialValuesProof: GetProof;
}

export interface MigrationResult {
    migrationResult: Boolean;
    receipt?: {
        gasUsed: ethers.BigNumber;
    };
    max_value_mpt_depth?: number;
}

async function verifyStorageProof(storageProof: StorageProof, root) {
    const storageTrieKey = hexStringToBuffer(ethers.utils.keccak256(ethers.utils.hexZeroPad(storageProof.key, 32)));
    const storageTrieRoot = hexStringToBuffer(root);

    const proofValue = await Trie.verifyProof(storageTrieRoot, storageTrieKey, format_proof_nodes(storageProof.proof));

    if (proofValue === null) {
        throw new Error(`Invalid storage proof: No storage value found for key: ${storageTrieKey.toString('hex')}`);
    }

    const val = storageProof.value === '0x0' ? Buffer.from([]) : hexStringToBuffer(ethers.BigNumber.from(storageProof.value).toHexString());
    const rlpValue = encode(val);

    if (!rlpValue.equals(proofValue)) {
        throw new Error('Invalid storage proof');
    }
    return true;
}

/**
 * Verifies inclusion proofs
 * @param proof, the proof as returned by `eth_getProof`
 * @param root, rootHash for the merkle proof
 * @throws If account or storage proofs are found to be invalid
 * @returns true if merkle proof could be verified, false otherwise
 * @see also [web3.py](https://github.com/ethereum/web3.py/blob/master/docs/web3.eth.rst)
 */
export async function verifyEthGetProof(proof: GetProof, root: string | Buffer): Promise<boolean> {
    if (typeof (root) === 'string') {
        return verifyEthGetProof(proof, hexStringToBuffer(root));
    }

    const acc = <Account>{
        nonce: proof.nonce,
        balance: proof.balance,
        storageHash: proof.storageHash,
        codeHash: proof.codeHash,
    };

    const rlpAccount = encodeAccount(acc);
    const trieKey = hexStringToBuffer(ethers.utils.keccak256(proof.address));

    const proofAcc = await Trie.verifyProof(root, trieKey, format_proof_nodes(proof.accountProof));

    if (proofAcc === null) {
        throw new Error(`Invalid account proof: No account value found for key: ${trieKey.toString('hex')}`);
    }
    if (!rlpAccount.equals(proofAcc)) {
        throw new Error('Invalid account proof: accounts do not match');
    }

    const verifications = await Promise.all(proof.storageProof.map((storageProof) => verifyStorageProof(storageProof, proof.storageHash)));
    const faultyIndex = verifications.findIndex((verifier) => verifier === false);
    return faultyIndex < 0;
}

export class TestChainProxy {
    // todo currently does not change the value when calling changing values functions
    readonly values: Array<number> = [];

    readonly keys: Array<number> = [];

    private proxyContract: Contract;

    readonly srcContract: MappingContract;

    readonly provider: JsonRpcProvider;

    readonly httpConfig: HttpNetworkConfig;

    readonly logicContract: MappingContract;

    readonly relayContract: RelayContract;

    readonly deployer: SignerWithAddress;

    private map_size: number;

    private max_mpt_depth: number;

    private min_mpt_depth: number;

    private initialValuesProof: GetProof;

    readonly differ: DiffHandler;

    private migrationState: Boolean;

    constructor(srcContract: MappingContract, logicContract: MappingContract, httpConfig: HttpNetworkConfig, deployer: SignerWithAddress, relayContract: RelayContract, provider: JsonRpcProvider) {
        this.srcContract = srcContract;
        this.logicContract = logicContract;
        this.relayContract = relayContract;
        this.httpConfig = httpConfig;
        this.deployer = deployer;
        this.provider = provider;
        this.differ = new DiffHandler(this.provider);
        this.migrationState = false;
    }

    async initializeProxyContract(map_size: number, max_value: number): Promise<InitializationResult> {
        this.map_size = map_size;
        // insert some random values
        const srcKeys: Array<number> = [];
        const srcValues: Array<number> = [];
        for (let i = 0; i < map_size; i += 1) {
            const value = Math.floor(Math.random() * max_value);
            srcValues.push(value);
            srcKeys.push(i);
            this.keys.push(i);
            this.values.push(value);
        }

        let storageAdds: any = [];
        while (srcKeys.length > 0) {
            storageAdds.push(this.srcContract.insertMultiple(srcKeys.splice(0, KEY_VALUE_PAIR_PER_BATCH), srcValues.splice(0, KEY_VALUE_PAIR_PER_BATCH)));
        }
        try {
            await Promise.all(storageAdds);
        } catch (e) {
            logger.error('Could not insert multiple values in srcContract');
            logger.error(e);
            process.exit(-1);
        }

        const keys = await getAllKeys(this.srcContract.address, this.provider);
        const latestBlock = await this.provider.send('eth_getBlockByNumber', ['latest', true]);
        // create a proof of the source contract's storage
        this.initialValuesProof = new GetProof(await this.provider.send('eth_getProof', [this.srcContract.address, keys]));

        // getting depth of mpt
        this.max_mpt_depth = 0;
        this.initialValuesProof.storageProof.forEach((storageProof) => {
            if (this.max_mpt_depth < storageProof.proof.length) this.max_mpt_depth = storageProof.proof.length;
        });

        // getting min depth of mpt
        this.min_mpt_depth = this.max_mpt_depth;
        this.initialValuesProof.storageProof.forEach((storageProof) => {
            if (this.min_mpt_depth > storageProof.proof.length) this.min_mpt_depth = storageProof.proof.length;
        });

        await this.relayContract.addBlock(latestBlock.stateRoot, latestBlock.number);

        const compiledProxy = await ProxyContractBuilder.compiledAbiAndBytecode(this.relayContract.address, this.logicContract.address, this.srcContract.address);

        // deploy the proxy with the state of the `srcContract`
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, this.deployer);
        this.proxyContract = await proxyFactory.deploy();

        // migrate storage
        logger.debug('migrating storage');
        const proxykeys: Array<String> = [];
        const proxyValues: Array<String> = [];
        this.initialValuesProof.storageProof.forEach((storageProof) => {
            proxykeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
        });

        storageAdds = [];
        while (proxykeys.length > 0) {
            storageAdds.push(this.proxyContract.addStorage(proxykeys.splice(0, KEY_VALUE_PAIR_PER_BATCH), proxyValues.splice(0, KEY_VALUE_PAIR_PER_BATCH)));
        }
        try {
            await Promise.all(storageAdds);
        } catch (e) {
            logger.error('Could not insert multiple values in srcContract');
            logger.error(e);
            process.exit(-1);
        }
        logger.debug('done.');

        // validate migration
        //  getting account proof from source contract
        const sourceAccountProof = await this.initialValuesProof.optimizedProof(latestBlock.stateRoot, false);

        //  getting account proof from proxy contract
        const latestProxyChainBlock = await this.provider.send('eth_getBlockByNumber', ['latest', false]);
        const proxyChainProof = new GetProof(await this.provider.send('eth_getProof', [this.proxyContract.address, []]));
        const proxyAccountProof = await proxyChainProof.optimizedProof(latestProxyChainBlock.stateRoot, false);

        //  getting encoded block header
        const encodedBlockHeader = encodeBlockHeader(latestProxyChainBlock);

        await this.relayContract.verifyMigrateContract(sourceAccountProof, proxyAccountProof, encodedBlockHeader, this.proxyContract.address, ethers.BigNumber.from(latestProxyChainBlock.number).toNumber(), ethers.BigNumber.from(latestBlock.number).toNumber(), { gasLimit: this.httpConfig.gas });

        //  validating
        const migrationValidated = await this.relayContract.getMigrationState(this.proxyContract.address);
        this.migrationState = migrationValidated;
        return {
            max_mpt_depth: this.max_mpt_depth,
            min_mpt_depth: this.min_mpt_depth,
            proxyContract: this.proxyContract,
            migrationState: migrationValidated,
            keys: this.keys,
            values: this.values,
            initialValuesProof: this.initialValuesProof,
        };
    }

    async changeDeepestValues(valueCount: number, max_value: number): Promise<Boolean> {
        if (valueCount > this.values.length) {
            logger.error('Requested more value changes than values in contract');
            return false;
        } if (!this.migrationState) {
            logger.error('Proxy contract is not initialized yet.');
            return false;
        }

        // always change deepest values first
        let currHeight = this.max_mpt_depth;
        const valueIndices: Array<number> = [];
        const proofIndices: Array<number> = [];
        const srcKeys: Array<number> = [];
        const srcValues: Array<number> = [];
        while (valueIndices.length < valueCount) {
            // get a new value
            // eslint-disable-next-line no-loop-func
            const proofIndex = this.initialValuesProof.storageProof.findIndex((storageProof, index) => (storageProof.proof.length === currHeight && proofIndices.indexOf(index) === -1));
            if (proofIndex === -1) {
                // if all values from currHeight already in our array, go one level closer to root
                currHeight -= 1;
                // eslint-disable-next-line no-continue
                continue;
            }
            proofIndices.push(proofIndex);
            const valueIndex = this.values.findIndex((value) => ethers.BigNumber.from(this.initialValuesProof.storageProof[proofIndex].value).toHexString() === ethers.BigNumber.from(value).toHexString());
            const value = Math.floor(Math.random() * max_value);
            valueIndices.push(valueIndex);
            srcKeys.push(valueIndex);
            srcValues.push(value);
        }

        // change previous synced value in batches
        const storageAdds: any = [];
        while (srcKeys.length > 0) {
            storageAdds.push(this.srcContract.insertMultiple(srcKeys.splice(0, KEY_VALUE_PAIR_PER_BATCH), srcValues.splice(0, KEY_VALUE_PAIR_PER_BATCH)));
        }
        try {
            await Promise.all(storageAdds);
        } catch (e) {
            logger.error('Could not insert multiple values in srcContract');
            logger.error(e);
            return false;
        }

        return true;
    }

    async changeValues(valueCount: number, max_value: number): Promise<Boolean> {
        if (valueCount > this.values.length) {
            logger.error('Requested more value changes than values in contract');
            return false;
        } if (!this.migrationState) {
            logger.error('contract is not migrated yet.');
            return false;
        }

        const srcKeys: Array<number> = [];
        const srcValues: Array<number> = [];
        for (let i = 0; i < valueCount; i += 1) {
            const value = Math.floor(Math.random() * max_value);
            srcValues.push(value);
            srcKeys.push(this.keys[i]);
        }
        const storageAdds: any = [];
        while (srcKeys.length > 0) {
            storageAdds.push(this.srcContract.insertMultiple(srcKeys.splice(0, KEY_VALUE_PAIR_PER_BATCH), srcValues.splice(0, KEY_VALUE_PAIR_PER_BATCH)));
        }
        try {
            await Promise.all(storageAdds);
        } catch (e) {
            logger.error('Could not insert multiple values in srcContract');
            logger.error(e);
            return false;
        }
        return true;
    }

    async changeValueAtMTHeight(mtHeight: number, max_value: number): Promise<Boolean> {
        if (!this.migrationState) {
            logger.error('Proxy contract is not initialized yet.');
            return false;
        } if (mtHeight > this.max_mpt_depth || mtHeight < this.min_mpt_depth) {
            logger.error(`mtHeight ${mtHeight} is not in the range of: ${this.min_mpt_depth} <= ${mtHeight} <= ${this.max_mpt_depth}`);
            return false;
        }

        // get representing value for mpt height
        const proofIndex = this.initialValuesProof.storageProof.findIndex((storageProof) => storageProof.proof.length === mtHeight);
        const valueIndex = this.values.findIndex((value) => ethers.BigNumber.from(this.initialValuesProof.storageProof[proofIndex].value).toHexString() === ethers.BigNumber.from(value).toHexString());

        // change previous synced value
        const value = Math.floor(Math.random() * max_value);
        await this.srcContract.insert(valueIndex, value);
        return true;
    }

    async changeValueAtIndex(valueIndex: number, max_value: number): Promise<Boolean> {
        if (!this.migrationState) {
            logger.error('Proxy contract is not initialized yet.');
            return false;
        }
        if (this.keys.findIndex((key) => key === valueIndex) < 0) {
            logger.error(`Index ${valueIndex} does not exist on srcContract`);
            return false;
        }
        const value = Math.floor(Math.random() * max_value);
        await this.srcContract.insert(valueIndex, value);
        return true;
    }

    async migrateChangesToProxy(changedKeys: Array<BigNumberish>): Promise<MigrationResult> {
        if (!this.migrationState) {
            logger.error('Proxy contract is not initialized yet.');
            return { migrationResult: false };
        }

        if (changedKeys.length < 1) {
            return {
                migrationResult: true,
                receipt: {
                    gasUsed: ethers.BigNumber.from(0),
                },
            };
        }

        const latestBlock = await this.provider.send('eth_getBlockByNumber', ['latest', true]);

        // create a proof of the source contract's storage for all the changed keys
        const changedKeysProof = new GetProof(await this.provider.send('eth_getProof', [this.srcContract.address, changedKeys]));

        // get depth of value
        let max_value_mpt_depth = 0;
        changedKeysProof.storageProof.forEach((storageProof) => {
            if (max_value_mpt_depth < storageProof.proof.length) max_value_mpt_depth = storageProof.proof.length;
        });

        // compute the optimized storage proof
        const rlpOptimized = changedKeysProof.optimizedStorageProof();

        // ensure that the old contract state equals the last synced storage hash
        try {
            const validated = await this.proxyContract.verifyOldContractStateProof(rlpOptimized);
            if (!validated) {
                logger.error('Could not verify old contract state proof');
                return { migrationResult: false };
            }
        } catch (e) {
            logger.error('something went wrong');
            const regexr = new RegExp(/Reverted 0x(.*)/);
            const checker = regexr.exec(e.data);
            if (checker) {
                logger.error(`'${hex_to_ascii(checker[1])}'`);
                logger.fatal(e);
            } else logger.fatal(e);
            return { migrationResult: false };
        }

        const rlpProof = await changedKeysProof.optimizedProof(latestBlock.stateRoot);
        await this.relayContract.addBlock(latestBlock.stateRoot, latestBlock.number);

        // update the proxy storage
        let txResponse;
        let receipt;
        try {
            txResponse = await this.proxyContract.updateStorage(rlpProof, latestBlock.number);
            receipt = await txResponse.wait();
        } catch (e) {
            logger.error('something went wrong');
            const regexr = new RegExp(/Reverted 0x(.*)/);
            const checker = regexr.exec(e.data);
            if (checker) {
                logger.error(`'${hex_to_ascii(checker[1])}'`);
                logger.fatal(e);
            } else logger.fatal(e);
            return { migrationResult: false };
        }

        return {
            receipt,
            max_value_mpt_depth,
            migrationResult: true,

        };
    }
}
