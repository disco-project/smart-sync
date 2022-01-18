import { Contract } from '@ethersproject/contracts';
import { JsonRpcProvider } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BigNumberish, ethers } from 'ethers';
import { Trie } from 'merkle-patricia-tree/dist/baseTrie';
import { TLogLevelName } from 'tslog';
import { MappingContract, RelayContract } from '../src-gen/types';
import { PROXY_INTERFACE } from '../src/config';
import ProxyContractBuilder from '../src/utils/proxy-contract-builder';
import DiffHandler from '../src/diffHandler/DiffHandler';
import { logger } from '../src/utils/logger';
import {
    encode, getAllKeys, hexStringToBuffer, hexToAscii,
} from '../src/utils/utils';
import GetProof, { encodeAccount, formatProofNodes } from '../src/proofHandler/GetProof';
import { Account, StorageProof } from '../src/proofHandler/Types';
import { encodeBlockHeader } from '../src/chain-proxy';
import { TxContractInteractionOptions } from '../src/cli/smart-sync';
import { CSVManager } from '../evaluation/eval-utils';

const KEY_VALUE_PAIR_PER_BATCH = 100;

export namespace TestCLI {
    export const tsNodeExec = './node_modules/ts-node/dist/bin-transpile.js';
    export const cliExec = './src/cli/smart-sync.ts';
    export const defaultTestConfigFile = './test/config/test-cli-config.json';
    export const targetAccountEncryptedJsonPath = './test/config/encryptedAccount.json';
    export const targetAccountPassword = 'dev';
    export const DEFAULT_PROVIDER = 'http://localhost:8545';
    export const MAX_VALUE = 1000000;
}

export interface InitializationResult {
    migrationState: Boolean;
    proxyContract: Contract;
    values: Array<number | string>;
    keys: Array<number | string>;
    max_mpt_depth: number;
    min_mpt_depth: number;
    initialValuesProof: GetProof;
}

export interface MigrationResult {
    migrationResult: Boolean;
    receipt?: {
        gasUsed: ethers.BigNumber;
    };
    maxValueMptDept?: number;
    proofs?: GetProof;
}

export interface ChangeValueAtIndexResult {
    success: Boolean;
    newValue?: BigNumberish;
}

export function buildCLICommand(command: string, args: string, tx: Boolean, logLevel?: TLogLevelName, options?: string, confFile?: string) {
    return `${TestCLI.tsNodeExec} ${TestCLI.cliExec} ${command} ${args} -c ${confFile || TestCLI.defaultTestConfigFile} -l ${logLevel}${tx ? ` --target-account-encrypted-json ${TestCLI.targetAccountEncryptedJsonPath} --target-account-password ${TestCLI.targetAccountPassword}` : ''}${options ? ` ${options}` : ''}`;
}

async function verifyStorageProof(storageProof: StorageProof, root) {
    const storageTrieKey = hexStringToBuffer(ethers.utils.keccak256(ethers.utils.hexZeroPad(storageProof.key, 32)));
    const storageTrieRoot = hexStringToBuffer(root);

    const proofValue = await Trie.verifyProof(storageTrieRoot, storageTrieKey, formatProofNodes(storageProof.proof));

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

    const proofAcc = await Trie.verifyProof(root, trieKey, formatProofNodes(proof.accountProof));

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
    readonly values: Array<number | string> = [];

    readonly keys: Array<number | string> = [];

    private proxyContract: Contract;

    readonly srcContract: MappingContract;

    readonly srcProvider: JsonRpcProvider;

    readonly targetProvider: JsonRpcProvider;

    readonly httpConfig: TxContractInteractionOptions;

    readonly logicContract: MappingContract;

    readonly relayContract: RelayContract;

    readonly srcDeployer: SignerWithAddress;

    readonly targetDeployer: SignerWithAddress;

    private max_mpt_depth: number;

    private min_mpt_depth: number;

    private initialValuesProof: GetProof;

    readonly differ: DiffHandler;

    private migrationState: Boolean;

    constructor(srcContract: MappingContract, logicContract: MappingContract, httpConfig: TxContractInteractionOptions, srcDeployer: SignerWithAddress, targetDeployer: SignerWithAddress, relayContract: RelayContract, srcProvider: JsonRpcProvider, targetProvider: JsonRpcProvider) {
        this.srcContract = srcContract;
        this.logicContract = logicContract;
        this.relayContract = relayContract;
        this.httpConfig = httpConfig;
        this.srcDeployer = srcDeployer;
        this.targetDeployer = targetDeployer;
        this.srcProvider = srcProvider;
        this.targetProvider = targetProvider;
        this.differ = new DiffHandler(this.srcProvider, this.targetProvider);
        this.migrationState = false;
    }

    async insertRandomValues(map_size: number, max_value: number) {
        const srcKeys: Array<number> = [];
        const srcValues: Array<number> = [];
        for (let i = 0; i < map_size; i += 1) {
            const value = Math.floor(Math.random() * max_value);
            srcValues.push(value);
            srcKeys.push(i);
            this.keys.push(i);
            this.values.push(value);
        }
        await this.insertValues(srcKeys, srcValues);
    }

    async insertValuesFromCSV(path: string, fileName: string) {
        const csvManager = new CSVManager<{ key: string, value: string }>(fileName, path);
        const oldState = csvManager.readFromFile();
        const srcKeys: Array<string> = [];
        const srcValues: Array<string> = [];
        oldState.forEach((pair: [key: string, value: string]) => {
            srcKeys.push(ethers.utils.hexZeroPad(pair[0], 32));
            srcValues.push(ethers.utils.hexZeroPad(pair[1], 32));
            this.keys.push(ethers.utils.hexZeroPad(pair[0], 32));
            this.values.push(ethers.utils.hexZeroPad(pair[1], 32));
        });
        await this.setStorageKeys(srcKeys, srcValues);
    }

    async changeValuesThroughCSV(srcPath: string, srcFileName: string, targetPath: string, targetFileName: string) {
        const csvManagerOld = new CSVManager<{ key: string, value: string }>(srcFileName, srcPath);
        const csvManagerNew = new CSVManager<{ key: string, value: string }>(targetFileName, targetPath);
        const oldState = csvManagerOld.readFromFile();
        const newState: Array<string> = csvManagerNew.readFromFile();
        const newKeys: Array<string> = [];
        const newValues: Array<string> = [];
        newState.forEach((pair) => {
            newKeys.push(ethers.utils.hexZeroPad(pair[0], 32));
            newValues.push(ethers.utils.hexZeroPad(pair[1], 32));
        });
        oldState.forEach((pair) => {
            const index = newState.findIndex((newPair) => ethers.utils.hexZeroPad(pair[0], 32) === ethers.utils.hexZeroPad(newPair[0], 32));
            if (index < 0) {
                newKeys.push(pair[0]);
                newValues.push(ethers.utils.hexZeroPad('0x0', 32));
            }
        });
        await this.setStorageKeys(newKeys, newValues);
    }

    async setStorageKeys(keys: Array<string>, values: Array<string>) {
        while (keys.length > 0) {
            await this.srcContract.setStorageKey(keys.splice(0, 50), values.splice(0, 50), { gasLimit: BigNumber.from(this.httpConfig.gasLimit).toNumber() });
        }
    }

    async initializeProxyContract(map_size?: number, max_value?: number): Promise<InitializationResult> {
        if (map_size && max_value) {
            await this.insertRandomValues(map_size, max_value);
        }
        const keys = await getAllKeys(this.srcContract.address, this.srcProvider);
        const latestBlock = await this.srcProvider.send('eth_getBlockByNumber', ['latest', true]);
        // create a proof of the source contract's storage
        this.initialValuesProof = new GetProof(await this.srcProvider.send('eth_getProof', [this.srcContract.address, keys]));

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
        if (compiledProxy.error) {
            logger.error('Could not get the compiled proxy...');
            process.exit(-1);
        }

        // deploy the proxy with the state of the `srcContract`
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, this.targetDeployer);
        this.proxyContract = await proxyFactory.deploy();

        // migrate storage
        logger.debug('migrating storage');
        const proxykeys: Array<String> = [];
        const proxyValues: Array<String> = [];
        this.initialValuesProof.storageProof.forEach((storageProof) => {
            proxykeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
        });
        const storageAdds: Promise<any>[] = [];
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
        const latestProxyChainBlock = await this.targetProvider.send('eth_getBlockByNumber', ['latest', false]);
        const proxyChainProof = new GetProof(await this.targetProvider.send('eth_getProof', [this.proxyContract.address, []]));
        const proxyAccountProof = await proxyChainProof.optimizedProof(latestProxyChainBlock.stateRoot, false);

        //  getting encoded block header
        const encodedBlockHeader = encodeBlockHeader(latestProxyChainBlock);

        await this.relayContract.verifyMigrateContract(sourceAccountProof, proxyAccountProof, encodedBlockHeader, this.proxyContract.address, ethers.BigNumber.from(latestProxyChainBlock.number).toNumber(), ethers.BigNumber.from(latestBlock.number).toNumber(), { gasLimit: this.httpConfig.gasLimit });

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
            // eslint-disable-next-line @typescript-eslint/no-loop-func
            const proofIndex = this.initialValuesProof.storageProof.findIndex((storageProof, index) => storageProof.proof.length === currHeight && proofIndices.indexOf(index) === -1);
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

        return this.insertValues(srcKeys, srcValues);
    }

    async changeRandomValues(valueCount: number, max_value: number): Promise<Boolean> {
        if (valueCount > this.values.length) {
            logger.error('Requested more value changes than values in contract');
            return false;
        } if (!this.migrationState) {
            logger.error('contract is not migrated yet.');
            return false;
        }

        const usedKeys: Array<number | string> = [];
        const srcKeys: Array<number | string> = [];
        const srcValues: Array<number> = [];
        for (let i = 0; i < valueCount; i += 1) {
            const value = Math.floor(Math.random() * max_value);
            srcValues.push(value);

            let newKey = Math.floor(Math.random() * this.keys.length);
            // eslint-disable-next-line @typescript-eslint/no-loop-func
            while (usedKeys.findIndex((key) => key === this.keys[newKey]) > -1) {
                newKey = Math.floor(Math.random() * this.keys.length);
            }
            srcKeys.push(this.keys[newKey]);
            usedKeys.push(this.keys[newKey]);
        }
        return this.insertValues(srcKeys, srcValues);
    }

    async changeValues(valueCount: number, max_value: number): Promise<Boolean> {
        if (valueCount > this.values.length) {
            logger.error('Requested more value changes than values in contract');
            return false;
        } if (!this.migrationState) {
            logger.error('contract is not migrated yet.');
            return false;
        }

        const srcKeys: Array<number | string> = [];
        const srcValues: Array<number> = [];
        for (let i = 0; i < valueCount; i += 1) {
            const value = Math.floor(Math.random() * max_value);
            srcValues.push(value);
            srcKeys.push(this.keys[i]);
        }
        return this.insertValues(srcKeys, srcValues);
    }

    private async insertValues(srcKeys: Array<number | string>, srcValues: Array<number>): Promise<Boolean> {
        const promises: Promise<any>[] = [];
        while (srcKeys.length > 0) {
            promises.push(this.srcContract.insertMultiple(srcKeys.splice(0, KEY_VALUE_PAIR_PER_BATCH), srcValues.splice(0, KEY_VALUE_PAIR_PER_BATCH)));
        }

        try {
            await Promise.all(promises);
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

    async addValueAtIndex(valueIndex: number, max_value: number): Promise<ChangeValueAtIndexResult> {
        if (!this.migrationState) {
            logger.error('Proxy contract is not initialized yet.');
            return { success: false };
        }
        const value = Math.floor(Math.random() * max_value);
        await this.srcContract.insert(valueIndex, value);
        return {
            newValue: value,
            success: true,
        };
    }

    async deleteValueAtIndex(valueIndex: number): Promise<Boolean> {
        if (!this.migrationState) {
            logger.error('Proxy contract is not initialized yet.');
            return false;
        }
        await this.srcContract.deleteValue(valueIndex);
        return true;
    }

    async changeValueAtIndex(valueIndex: number, max_value: number): Promise<ChangeValueAtIndexResult> {
        if (!this.migrationState) {
            logger.error('Proxy contract is not initialized yet.');
            return { success: false };
        }
        if (this.keys.findIndex((key) => key === valueIndex) < 0) {
            logger.error(`Index ${valueIndex} does not exist on srcContract`);
            return { success: false };
        }
        const value = Math.floor(Math.random() * max_value);
        await this.srcContract.insert(valueIndex, value);
        return {
            newValue: value,
            success: true,
        };
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

        const latestBlock = await this.srcProvider.send('eth_getBlockByNumber', ['latest', true]);

        // create a proof of the source contract's storage for all the changed keys
        const changedKeysProof = new GetProof(await this.srcProvider.send('eth_getProof', [this.srcContract.address, changedKeys]));

        // get depth of value
        let maxValueMptDept = 0;
        changedKeysProof.storageProof.forEach((storageProof) => {
            if (maxValueMptDept < storageProof.proof.length) maxValueMptDept = storageProof.proof.length;
        });

        const rlpProof = await changedKeysProof.optimizedProof(latestBlock.stateRoot);
        await this.relayContract.addBlock(latestBlock.stateRoot, latestBlock.number);

        // update the proxy storage
        let txResponse;
        let receipt;
        try {
            txResponse = await this.proxyContract.updateStorage(rlpProof, latestBlock.number, { gasLimit: this.httpConfig.gasLimit });
            receipt = await txResponse.wait();
        } catch (e: any) {
            logger.error('something went wrong');
            const regexr = /Reverted 0x(.*)/;
            const checker = regexr.exec(e.data);
            if (checker) {
                logger.error(`'${hexToAscii(checker[1])}'`);
                logger.fatal(e);
            } else logger.fatal(e);
            return { migrationResult: false };
        }

        return {
            receipt,
            maxValueMptDept,
            migrationResult: true,
            proofs: changedKeysProof,
        };
    }
}
