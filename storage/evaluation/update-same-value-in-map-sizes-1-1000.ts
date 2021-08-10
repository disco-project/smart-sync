import {RelayContract__factory, MappingContract, MappingContract__factory, RelayContract} from "../src-gen/types";
import {ethers, network} from "hardhat";
import {expect} from "chai";
import {StorageDiff, StorageDiffer} from "../src/get-diff";
import { JsonRpcProvider } from "@ethersproject/providers";
import { logger } from "../src/logger"
import { HttpNetworkConfig } from "hardhat/types";
import { TestChainProxy, ChangeValueAtIndexResult, MigrationResult } from "../test/test-utils";
import { CSVDataTemplateSingleValueMultiple, CSVManager, getExtensionsAmountLeadingToValue } from "./eval-utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumberish } from "@ethersproject/bignumber";

const MAX_VALUE = 1000000;
const ITERATIONS = 20;

describe("update-same-value-in-map-sizes-1-1000", async function () {
    let deployer: SignerWithAddress;
    let srcContract: MappingContract;
    let logicContract: MappingContract;
    let factory: MappingContract__factory;
    let provider: JsonRpcProvider;
    let relayContract: RelayContract;
    let httpConfig: HttpNetworkConfig;
    let chainProxy: TestChainProxy;
    let csvManager: CSVManager<CSVDataTemplateSingleValueMultiple>;
    let differ: StorageDiffer;
    let currBlockNr: number;

    // before(() => {
    //     httpConfig = network.config as HttpNetworkConfig;
    //     logger.setSettings({minLevel: 'info', name: 'update-same-value-in-map-sizes-1-1000.ts'});
    //     csvManager = new CSVManager<CSVDataTemplateSingleValueMultiple>(`update-same-value-with-map-sizes-1-1000-iterations=${ITERATIONS}.csv`);
    //     provider = new ethers.providers.JsonRpcProvider(httpConfig.url);
    //     differ = new StorageDiffer(provider);
    // });

    // after(async () => {
    //     await csvManager.writeTofile();
    // });

    // beforeEach(async () => {
    //     deployer = await SignerWithAddress.create(provider.getSigner());
    //     factory = new MappingContract__factory(deployer);
    //     srcContract = await factory.deploy();
    //     logicContract = await factory.deploy();
    //     // deploy the relay contract
    //     const Relayer = new RelayContract__factory(deployer);
    //     relayContract = await Relayer.deploy();
    //     chainProxy = new TestChainProxy(srcContract, logicContract, httpConfig, deployer, relayContract, provider);
    // });

    // afterEach(async () => {
    // });

    // it(`Contract with map containing 1 value, continuously update 1 value for ${ITERATIONS} in max depth of mt`, async function () {
    //     const initialization = await chainProxy.initializeProxyContract(1, MAX_VALUE);
    //     expect(initialization.migrationState).to.be.true;
    //     currBlockNr = await provider.getBlockNumber() + 1;

    //     for (let i = 0; i < ITERATIONS; i++) {
    //         // change previous synced value
    //         const result: ChangeValueAtIndexResult = await chainProxy.changeValueAtIndex(1, MAX_VALUE);
    //         expect(result.success).to.be.true;

    //         // migrate changes to proxy contract
    //         // get the diff set, the storage keys for the changed values
    //         let diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
    //         const changedKeys: Array<BigNumberish> = diff.getKeys();
    //         logger.debug(changedKeys);
    //         currBlockNr = await provider.getBlockNumber() + 1;
    //         const migrationResult: MigrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
    //         if (!migrationResult.receipt) {
    //             logger.fatal('No receipt provided');
    //             process.exit(-1);
    //         }

    //         const extensionsCounter = getExtensionsAmountLeadingToValue(result.newValue, migrationResult.proofs?.storageProof);

    //         logger.info(`${1}: Update value at ${i}, map_size: ${1}, value_depth: ${migrationResult.max_value_mpt_depth}, extensionsCounter: ${extensionsCounter}, gas_cost:`, migrationResult.receipt.gasUsed.toNumber());

    //         csvManager.pushData({
    //             extensionsCounter,
    //             map_size: 1,
    //             iteration: 1,
    //             changed_value_index: i,
    //             used_gas: migrationResult.receipt.gasUsed.toNumber(),
    //             max_mpt_depth: initialization.max_mpt_depth,
    //             value_mpt_depth: migrationResult.max_value_mpt_depth
    //         });
    //     }
    // });

    // it(`Contract with map containing 10 values, continuously update 1 value for ${ITERATIONS} in max depth of mt`, async function() {
    //     const map_size = 10;
    //     const initialization = await chainProxy.initializeProxyContract(map_size, MAX_VALUE);
    //     expect(initialization.migrationState).to.be.true;
    //     currBlockNr = await provider.getBlockNumber() + 1;

    //     for (let i = 0; i < map_size; i++) {
    //         for (let j = 0; j < ITERATIONS; j++) {
    //             // change previous synced value
    //             const result: ChangeValueAtIndexResult = await chainProxy.changeValueAtIndex(i, MAX_VALUE);
    //             expect(result.success).to.be.true;
    
    //             // migrate changes to proxy contract
    //             // get the diff set, the storage keys for the changed values
    //             let diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
    //             const changedKeys: Array<BigNumberish> = diff.getKeys();
    //             logger.debug(changedKeys);
    //             currBlockNr = await provider.getBlockNumber() + 1;
    //             const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
    //             if (!migrationResult.receipt) {
    //                 logger.fatal('No receipt provided');
    //                 process.exit(-1);
    //             }

    //             const extensionsCounter = getExtensionsAmountLeadingToValue(result.newValue, migrationResult.proofs?.storageProof);
    
    //             logger.info(`${j}: Update value at ${i}, map_size: ${map_size}, value_depth: ${migrationResult.max_value_mpt_depth}, extensionsCounter: ${extensionsCounter}, gas_cost:`, migrationResult.receipt.gasUsed.toNumber());
    
    //             csvManager.pushData({
    //                 extensionsCounter,
    //                 map_size,
    //                 iteration: j,
    //                 changed_value_index: i,
    //                 used_gas: migrationResult.receipt.gasUsed.toNumber(),
    //                 max_mpt_depth: initialization.max_mpt_depth,
    //                 value_mpt_depth: migrationResult.max_value_mpt_depth
    //             });
    //         }
    //     }
    // });

    // it(`Contract with map containing 100 values, continuously update 1 value for ${ITERATIONS} in max depth of mt`, async function() {
    //     const map_size = 100;
    //     const initialization = await chainProxy.initializeProxyContract(map_size, MAX_VALUE);
    //     expect(initialization.migrationState).to.be.true;
    //     logger.debug(`correct storage root: ${initialization.initialValuesProof.storageHash}`);
    //     currBlockNr = await provider.getBlockNumber() + 1;

    //     for (let i = 0; i < map_size; i++) {
    //         for (let j = 0; j < ITERATIONS; j++) {
    //             // change previous synced value
    //             const result: ChangeValueAtIndexResult = await chainProxy.changeValueAtIndex(i, MAX_VALUE);
    //             expect(result.success).to.be.true;
    
    //             // migrate changes to proxy contract
    //             // get the diff set, the storage keys for the changed values
    //             let diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
    //             const changedKeys: Array<BigNumberish> = diff.getKeys();
    //             logger.debug(changedKeys);
    //             currBlockNr = await provider.getBlockNumber() + 1;
    //             const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
    //             if (!migrationResult.receipt) {
    //                 logger.fatal('No receipt provided');
    //                 process.exit(-1);
    //             }

    //             const extensionsCounter = getExtensionsAmountLeadingToValue(result.newValue, migrationResult.proofs?.storageProof);
    
    //             logger.info(`${j}: Update value at ${i}, map_size: ${map_size}, value_depth: ${migrationResult.max_value_mpt_depth}, extensionsCounter: ${extensionsCounter}, gas_cost:`, migrationResult.receipt.gasUsed.toNumber());
    
    //             csvManager.pushData({
    //                 extensionsCounter,
    //                 map_size,
    //                 iteration: j,
    //                 changed_value_index: i,
    //                 used_gas: migrationResult.receipt.gasUsed.toNumber(),
    //                 max_mpt_depth: initialization.max_mpt_depth,
    //                 value_mpt_depth: migrationResult.max_value_mpt_depth
    //             });
    //         }
    //     }
    // });

    // it(`Contract with map containing 1000 values, continuously update 1 value for ${ITERATIONS} in max depth of mt`, async function() {
    //     const map_size = 1000;
    //     const initialization = await chainProxy.initializeProxyContract(map_size, MAX_VALUE);
    //     expect(initialization.migrationState).to.be.true;

    //     logger.debug(`correct storage root: ${initialization.initialValuesProof.storageHash}`);
    //     currBlockNr = await provider.getBlockNumber() + 1;

    //     for (let i = 0; i < map_size; i++) {
    //         for (let j = 0; j < ITERATIONS; j++) {
    //             // change previous synced value
    //             const result: ChangeValueAtIndexResult = await chainProxy.changeValueAtIndex(i, MAX_VALUE);
    //             expect(result.success).to.be.true;
    
    //             // migrate changes to proxy contract
    //             // get the diff set, the storage keys for the changed values
    //             let diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
    //             const changedKeys: Array<BigNumberish> = diff.getKeys();
    //             logger.debug(changedKeys);
    //             currBlockNr = await provider.getBlockNumber() + 1;
    //             const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
    //             if (!migrationResult.receipt) {
    //                 logger.fatal('No receipt provided');
    //                 process.exit(-1);
    //             }

    //             const extensionsCounter = getExtensionsAmountLeadingToValue(result.newValue, migrationResult.proofs.storageProof);
    
    //             logger.info(`${j}: Update value at ${i}, map_size: ${map_size}, value_depth: ${migrationResult.max_value_mpt_depth}, extensionsCounter: ${extensionsCounter}, gas_cost:`, migrationResult.receipt.gasUsed.toNumber());
    
    //             csvManager.pushData({
    //                 extensionsCounter,
    //                 map_size,
    //                 iteration: j,
    //                 changed_value_index: i,
    //                 used_gas: migrationResult.receipt.gasUsed.toNumber(),
    //                 max_mpt_depth: initialization.max_mpt_depth,
    //                 value_mpt_depth: migrationResult.max_value_mpt_depth
    //             });
    //         }
    //     }
    // });
});