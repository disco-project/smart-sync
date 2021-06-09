import {RelayContract__factory, MappingContract, MappingContract__factory, RelayContract} from "../src-gen/types";
import {ethers, network} from "hardhat";
import {expect} from "chai";
import {StorageDiff, StorageDiffer} from "../src/get-diff";
import { JsonRpcProvider } from "@ethersproject/providers";
import { logger } from "../src/logger"
import { HttpNetworkConfig } from "hardhat/types";
import { ChainProxy } from "../test/test-utils";
import { CSVDataTemplateSingleValue, CSVManager } from "./eval-utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumberish } from "@ethersproject/bignumber";

const MAX_VALUE = 1000000;
const ITERATIONS = 100;

describe("update-same-value-in-map-sizes-1-1000", async function () {
    let deployer: SignerWithAddress;
    let srcContract: MappingContract;
    let logicContract: MappingContract;
    let factory: MappingContract__factory;
    let provider: JsonRpcProvider;
    let relayContract: RelayContract;
    let httpConfig: HttpNetworkConfig;
    let chainProxy: ChainProxy;
    let csvManager: CSVManager<CSVDataTemplateSingleValue>;
    let differ: StorageDiffer;
    let currBlockNr: number;

    before(() => {
        httpConfig = network.config as HttpNetworkConfig;
        logger.setSettings({minLevel: 'info', name: 'update-same-value-in-map-sizes-1-1000.ts'});
        csvManager = new CSVManager<CSVDataTemplateSingleValue>(`update-same-value-in-map-sizes-1-1000.csv`);
        provider = new ethers.providers.JsonRpcProvider(httpConfig.url);
        differ = new StorageDiffer(provider);
    });

    after(async () => {
        await csvManager.writeTofile();
    });

    beforeEach(async () => {
        [deployer] = await ethers.getSigners();
        factory = new MappingContract__factory(deployer);
        srcContract = await factory.deploy();
        logicContract = await factory.deploy();
        // deploy the relay contract
        const Relayer = new RelayContract__factory(deployer);
        relayContract = await Relayer.deploy();
        chainProxy = new ChainProxy(srcContract, logicContract, httpConfig, deployer, relayContract, provider);
    });

    afterEach(async () => {
    });

    it(`Contract with map containing 1 value, continuously update 1 value for ${ITERATIONS} in max depth of mt`, async function () {
        const initialization = await chainProxy.initializeProxyContract(1, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        currBlockNr = await provider.getBlockNumber() + 1;

        for (let i = 0; i < ITERATIONS; i++) {
            // change previous synced value
            const result = await chainProxy.changeDeepestValues(1, MAX_VALUE);
            expect(result).to.be.true;

            // migrate changes to proxy contract
            // get the diff set, the storage keys for the changed values
            let diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
            const changedKeys: Array<BigNumberish> = diff.getKeys();
            logger.debug(changedKeys);
            currBlockNr = await provider.getBlockNumber() + 1;
            const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }

            logger.info(`Update 1 value, map_size: ${1}, iteration: ${i}: `, migrationResult.receipt.gasUsed.toNumber());

            csvManager.pushData({
                map_size: 1,
                changed_value_index: i,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                max_mpt_depth: initialization.max_mpt_depth,
                value_mpt_depth: migrationResult.max_value_mpt_depth
            });
        }
    });

    it(`Contract with map containing 10 values, continuously update 1 value for ${ITERATIONS} in max depth of mt`, async function() {
        const map_size = 10;
        const initialization = await chainProxy.initializeProxyContract(map_size, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        currBlockNr = await provider.getBlockNumber() + 1;

        for (let i = 0; i < ITERATIONS; i++) {
            // change previous synced value
            const result = await chainProxy.changeDeepestValues(1, MAX_VALUE);
            expect(result).to.be.true;

            // migrate changes to proxy contract
            // get the diff set, the storage keys for the changed values
            let diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
            const changedKeys: Array<BigNumberish> = diff.getKeys();
            logger.debug(changedKeys);
            currBlockNr = await provider.getBlockNumber() + 1;
            const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }

            logger.info(`Update 1 value, map_size: ${map_size}, iteration: ${i}: `, migrationResult.receipt.gasUsed.toNumber());

            csvManager.pushData({
                map_size,
                changed_value_index: i,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                max_mpt_depth: initialization.max_mpt_depth,
                value_mpt_depth: migrationResult.max_value_mpt_depth
            });
        }
    });

    it(`Contract with map containing 100 values, continuously update 1 value for ${ITERATIONS} in max depth of mt`, async function() {
        const map_size = 100;
        const initialization = await chainProxy.initializeProxyContract(map_size, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        logger.debug(`correct storage root: ${initialization.initialValuesProof.storageHash}`);
        currBlockNr = await provider.getBlockNumber() + 1;

        for (let i = 0; i < ITERATIONS; i++) {
            // change previous synced value
            const result = await chainProxy.changeDeepestValues(1, MAX_VALUE);
            expect(result).to.be.true;

            // migrate changes to proxy contract
            // get the diff set, the storage keys for the changed values
            let diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
            const changedKeys: Array<BigNumberish> = diff.getKeys();
            logger.debug(changedKeys);
            currBlockNr = await provider.getBlockNumber() + 1;
            const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }

            logger.info(`Update 1 value, map_size: ${map_size}, iteration: ${i}: `, migrationResult.receipt.gasUsed.toNumber());

            csvManager.pushData({
                map_size,
                changed_value_index: i,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                max_mpt_depth: initialization.max_mpt_depth,
                value_mpt_depth: migrationResult.max_value_mpt_depth
            });
        }
    });

    it(`Contract with map containing 1000 values, continuously update 1 value for ${ITERATIONS} in max depth of mt`, async function() {
        const map_size = 1000;
        const initialization = await chainProxy.initializeProxyContract(map_size, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        logger.debug(`correct storage root: ${initialization.initialValuesProof.storageHash}`);
        currBlockNr = await provider.getBlockNumber() + 1;

        for (let i = 0; i < ITERATIONS; i++) {
            // change previous synced value
            const result = await chainProxy.changeDeepestValues(1, MAX_VALUE);
            expect(result).to.be.true;

            // migrate changes to proxy contract
            // get the diff set, the storage keys for the changed values
            let diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
            const changedKeys: Array<BigNumberish> = diff.getKeys();
            logger.debug(changedKeys);
            currBlockNr = await provider.getBlockNumber() + 1;
            const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
            expect(migrationResult.migrationResult).to.be.true;
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }

            logger.info(`Update 1 value, map_size: ${map_size}, iteration: ${i}: `, migrationResult.receipt.gasUsed.toNumber());

            csvManager.pushData({
                map_size,
                changed_value_index: i,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                max_mpt_depth: initialization.max_mpt_depth,
                value_mpt_depth: migrationResult.max_value_mpt_depth
            });
        }
    });
});