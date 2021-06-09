import { Contract } from "@ethersproject/contracts";
import { JsonRpcProvider } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumberish, ethers } from "ethers";
import { HttpNetworkConfig } from "hardhat/types";
import { MappingContract, RelayContract } from "../src-gen/types";
import { PROXY_INTERFACE } from "../src/config";
import { DeployProxy } from "../src/deploy-proxy";
import { StorageDiffer } from "../src/get-diff";
import { logger } from "../src/logger";
import { getAllKeys } from "../src/utils";
import { encodeBlockHeader, GetProof } from "../src/verify-proof";

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
    proofs?: GetProof;
}

export interface ChangeValueAtIndexResult {
    success: Boolean;
    newValue?: BigNumberish;
}

export class ChainProxy {
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
    readonly differ: StorageDiffer;
    private migrationState: Boolean;

    constructor(srcContract: MappingContract, logicContract: MappingContract, httpConfig: HttpNetworkConfig, deployer: SignerWithAddress, relayContract: RelayContract, provider: JsonRpcProvider) {
        this.srcContract = srcContract;
        this.logicContract = logicContract;
        this.relayContract = relayContract;
        this.httpConfig = httpConfig;
        this.deployer = deployer;
        this.provider = provider;
        this.differ = new StorageDiffer(this.provider);
        this.migrationState = false;
    }

    async initializeProxyContract(map_size: number, max_value: number): Promise<InitializationResult> {
        this.map_size = map_size;
        let latestBlock;
        // insert some random values
        let srcKeys: Array<number> = [];
        let srcValues: Array<number> = [];
        for (let i = 0; i < map_size; i++) {
            const value = Math.floor(Math.random() * max_value);
            srcValues.push(value);
            srcKeys.push(i);
            this.keys.push(i);
            this.values.push(value);
            if (srcValues.length >= KEY_VALUE_PAIR_PER_BATCH) {
                try {
                    await this.srcContract.insertMultiple(srcKeys, srcValues);
                } catch(e) {
                    logger.error('Could not insert multiple values in srcContract');
                    logger.error(e);
                    process.exit(-1);
                }
                srcValues = [];
                srcKeys = [];
            } 
        }
        if (srcValues.length !== 0) {
            try {
                await this.srcContract.insertMultiple(srcKeys, srcValues);
            } catch(e) {
                logger.error('Could not insert multiple values in srcContract');
                logger.error(e);
                process.exit(-1);
            }
        }
    
        let keys = await getAllKeys(this.srcContract.address, this.provider);
        latestBlock = await this.provider.send('eth_getBlockByNumber', ["latest", true]);
        // create a proof of the source contract's storage
        this.initialValuesProof = new GetProof(await this.provider.send("eth_getProof", [this.srcContract.address, keys]));
    
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
    
        await this.relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);
    
        const compiledProxy = await DeployProxy.compiledAbiAndBytecode(this.relayContract.address, this.logicContract.address, this.srcContract.address);
    
        // deploy the proxy with the state of the `srcContract`
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, this.deployer);
        this.proxyContract = await proxyFactory.deploy();
    
        // migrate storage
        logger.debug('migrating storage');
        let proxykeys: Array<String> = [];
        let proxyValues: Array<String> = [];
        for (const storageProof of this.initialValuesProof.storageProof) {
            proxykeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
            if (proxykeys.length >= KEY_VALUE_PAIR_PER_BATCH) {
                await this.proxyContract.addStorage(proxykeys, proxyValues);
                proxykeys = [];
                proxyValues = [];
            }
        }
        if (proxykeys.length != 0) await this.proxyContract.addStorage(proxykeys, proxyValues);
        logger.debug('done.');
    
        // validate migration
        //  getting account proof from source contract
        const sourceAccountProof = await this.initialValuesProof.optimizedProof(latestBlock.stateRoot, false);
    
        //  getting account proof from proxy contract
        const latestProxyChainBlock = await this.provider.send('eth_getBlockByNumber', ["latest", false]);
        const proxyChainProof = new GetProof(await this.provider.send("eth_getProof", [this.proxyContract.address, []]));
        const proxyAccountProof = await proxyChainProof.optimizedProof(latestProxyChainBlock.stateRoot, false);
    
        //  getting encoded block header
        const encodedBlockHeader = encodeBlockHeader(latestProxyChainBlock);
    
        await this.relayContract.verifyMigrateContract(sourceAccountProof, proxyAccountProof, encodedBlockHeader, this.proxyContract.address, ethers.BigNumber.from(latestProxyChainBlock.number).toNumber(), { gasLimit: this.httpConfig.gas });
    
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
            initialValuesProof: this.initialValuesProof
        };
    }

    async changeDeepestValues(valueCount: number, max_value: number): Promise<Boolean> {
        if (valueCount > this.values.length) {
            logger.error('Requested more value changes than values in contract');
            return false;
        } else if (!this.migrationState) {
            logger.error('Proxy contract is not initialized yet.');
            return false;
        }

        // always change deepest values first
        let currHeight = this.max_mpt_depth;
        let valueIndices: Array<number> = [];
        let proofIndices: Array<number> = [];
        let srcKeys: Array<number> = [];
        let srcValues: Array<number> = [];
        while (valueIndices.length < valueCount) {
            // get a new value
            const proofIndex = this.initialValuesProof.storageProof.findIndex((storageProof, index) => {
                return storageProof.proof.length === currHeight && proofIndices.indexOf(index) === -1;
            });
            if (proofIndex === -1) {
                // if all values from currHeight already in our array, go one level closer to root
                currHeight--;
                continue;
            }
            proofIndices.push(proofIndex);
            const valueIndex = this.values.findIndex((value) => {
                return ethers.BigNumber.from(this.initialValuesProof.storageProof[proofIndex].value).toHexString() === ethers.BigNumber.from(value).toHexString();
            });
            const value = Math.floor(Math.random() * max_value);
            valueIndices.push(valueIndex)
            srcKeys.push(valueIndex);
            srcValues.push(value);
            // change previous synced value in batches
            if (srcKeys.length >= KEY_VALUE_PAIR_PER_BATCH) {
                try {
                    await this.srcContract.insertMultiple(srcKeys, srcValues);
                } catch(e) {
                    logger.error('Could not insert multiple values in srcContract');
                    logger.error(e);
                    return false;
                }
                srcKeys = [];
                srcValues = [];
            }
        }
        if (srcKeys.length !== 0) {
            try {
                await this.srcContract.insertMultiple(srcKeys, srcValues);
            } catch(e) {
                logger.error('Could not insert multiple values in srcContract');
                logger.error(e);
                return false;
            }
        }

        return true;
    }

    async changeValues(valueCount: number, max_value: number, offset?: number): Promise<Boolean> {
        if (valueCount > this.values.length) {
            logger.error('Requested more value changes than values in contract');
            return false;
        } else if (!this.migrationState) {
            logger.error('contract is not migrated yet.');
            return false;
        }
        offset = offset ? offset : 0;

        let srcKeys: Array<number> = [];
        let srcValues: Array<number> = [];
        for (let i = 0; i < valueCount; i++) {
            const value = Math.floor(Math.random() * max_value);
            srcValues.push(value);
            srcKeys.push(this.keys[i]);
            if (srcValues.length >= KEY_VALUE_PAIR_PER_BATCH) {
                try {
                    await this.srcContract.insertMultiple(srcKeys, srcValues);
                } catch(e) {
                    logger.error('Could not insert multiple values in srcContract');
                    logger.error(e);
                    return false;
                }
                srcValues = [];
                srcKeys = [];
            } 
        }
        if (srcValues.length !== 0) {
            try {
                await this.srcContract.insertMultiple(srcKeys, srcValues);
            } catch(e) {
                logger.error('Could not insert multiple values in srcContract');
                logger.error(e);
                return false;
            }
        }
        return true;
    }

    async changeValueAtMTHeight(mtHeight: number, max_value: number): Promise<Boolean> {
        if (!this.migrationState) {
            logger.error('Proxy contract is not initialized yet.');
            return false;
        } else if (mtHeight > this.max_mpt_depth || mtHeight < this.min_mpt_depth) {
            logger.error(`mtHeight ${mtHeight} is not in the range of: ${this.min_mpt_depth} <= ${mtHeight} <= ${this.max_mpt_depth}`)
            return false;
        }

        // get representing value for mpt height
        const proofIndex = this.initialValuesProof.storageProof.findIndex((storageProof) => {
            return storageProof.proof.length === mtHeight;
        });
        const valueIndex = this.values.findIndex((value) => {
            return ethers.BigNumber.from(this.initialValuesProof.storageProof[proofIndex].value).toHexString() === ethers.BigNumber.from(value).toHexString();
        });

        // change previous synced value
        const value = Math.floor(Math.random() * max_value);
        await this.srcContract.insert(valueIndex, value);
        return true;
    }

    async changeValueAtIndex(valueIndex: number, max_value: number): Promise<ChangeValueAtIndexResult> {
        if (!this.migrationState) {
            logger.error('Proxy contract is not initialized yet.');
            return { success: false };
        }
        if (this.keys.findIndex(key => key === valueIndex) < 0) {
            logger.error(`Index ${valueIndex} does not exist on srcContract`);
            return { success: false };
        }
        const value = Math.floor(Math.random() * max_value);
        await this.srcContract.insert(valueIndex, value);
        return { 
            newValue: value, 
            success: true 
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
                    gasUsed: ethers.BigNumber.from(0)
                }
            };
        }

        let latestBlock = await this.provider.send('eth_getBlockByNumber', ["latest", true]);

        // create a proof of the source contract's storage for all the changed keys
        let changedKeysProof = new GetProof(await this.provider.send("eth_getProof", [this.srcContract.address, changedKeys]));

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
            return { migrationResult: false };
        }

        const rlpProof = await changedKeysProof.optimizedProof(latestBlock.stateRoot);
        await this.relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        // update the proxy storage
        let txResponse;
        let receipt;
        try {
            txResponse = await this.proxyContract.updateStorage(rlpProof);
            receipt = await txResponse.wait();
        } catch (e) {
            logger.error('something went wrong');
            const regexr = new RegExp(/Reverted 0x(.*)/);
            const checker = regexr.exec(e.data);
            if (checker) {
                logger.error(`'${this.hex_to_ascii(checker[1])}'`);
                logger.fatal(e);
            }
            else logger.fatal(e);
            return { migrationResult: false };
        }

        return {
            receipt,
            max_value_mpt_depth,
            migrationResult: true,
            proofs: changedKeysProof
        };
    }

    hex_to_ascii(str1) {
        var hex  = str1.toString();
        var str = '';
        for (var n = 0; n < hex.length; n += 2) {
            str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));
        }
        return str;
    }
}