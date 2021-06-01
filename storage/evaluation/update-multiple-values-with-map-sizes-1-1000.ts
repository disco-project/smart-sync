import {RelayContract__factory, MappingContract, MappingContract__factory, RelayContract} from "../src-gen/types";
import {ethers, network} from "hardhat";
import {expect} from "chai";
import { JsonRpcProvider } from "@ethersproject/providers";
import {StorageDiffer} from "../src/get-diff";
import { logger } from "../src/logger";
import { HttpNetworkConfig } from "hardhat/types";
import { ChainProxy } from "../test/test-utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CSVDataTemplateMultipleValues, CSVManager } from "./eval-utils";

const MAX_CHANGED_VALUES = 100;
const MAX_VALUE = 1000000;

describe("Test scaling of contract", async function () {
    let deployer: SignerWithAddress;
    let srcContract: MappingContract;
    let logicContract: MappingContract;
    let factory: MappingContract__factory;
    let provider: JsonRpcProvider;
    let relayContract: RelayContract;
    let httpConfig: HttpNetworkConfig;
    let chainProxy: ChainProxy;
    let csvManager: CSVManager<CSVDataTemplateMultipleValues>;

    before(() => {
        httpConfig = network.config as HttpNetworkConfig;
        logger.setSettings({minLevel: 'info', name: 'update-multiple-values-with-map-sizes-1-1000.ts'});
        csvManager = new CSVManager<CSVDataTemplateMultipleValues>(`measurements-multiple-values-with-map-sizes-1-to-1000.csv`);
        provider = new ethers.providers.JsonRpcProvider(httpConfig.url);
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

    it("Contract with map containing 10 values, update multiple values per iteration", async function() {
        const map_size = 10;
        const initialization = await chainProxy.initializeProxyContract(map_size, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        let differ = new StorageDiffer(provider);
        let diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        for (let i = 1; i < map_size; i++) {
            const value_count = i + 1;

            // changing values at srcContract
            const result = await chainProxy.changeDeepestValues(value_count, MAX_VALUE);
            expect(result).to.be.true;

            // migrate changes to proxy contract
            const migrationResult = await chainProxy.migrateChangesToProxy();
            expect(migrationResult.migrationResult).to.be.true;
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }
            
            logger.info(`Gas used for updating ${value_count} values in contract with max depth ${initialization.max_mpt_depth}: `, migrationResult.receipt.gasUsed.toNumber());

            // add data to csv
            csvManager.pushData({
                map_size: map_size,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                changed_value_count: value_count,
                max_mpt_depth: initialization.max_mpt_depth
            });

            // after update storage layouts are equal, no diffs
            diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
            expect(diff.isEmpty()).to.be.true;
        }
    });

    it("Contract with map containing 100 values, update multiple values per iteration", async function() {
        const map_size = 100;
        const initialization = await chainProxy.initializeProxyContract(map_size, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        let differ = new StorageDiffer(provider);
        let diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        for (let i = 1; i < map_size; i++) {
            const value_count = i + 1;

            // changing values at srcContract
            const result = await chainProxy.changeDeepestValues(value_count, MAX_VALUE);
            expect(result).to.be.true;

            // migrate changes to proxy contract
            const migrationResult = await chainProxy.migrateChangesToProxy();
            expect(migrationResult.migrationResult).to.be.true;
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }
            
            logger.info(`Gas used for updating ${value_count} values in contract with max depth ${initialization.max_mpt_depth}: `, migrationResult.receipt.gasUsed.toNumber());

            // add data to csv
            csvManager.pushData({
                map_size: map_size,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                changed_value_count: value_count,
                max_mpt_depth: initialization.max_mpt_depth
            });

            // after update storage layouts are equal, no diffs
            diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
            expect(diff.isEmpty()).to.be.true;
        }
    });

    it("Contract with map containing 1000 values, update multiple values per iteration", async function() {
        const map_size = 1000;
        const initialization = await chainProxy.initializeProxyContract(map_size, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        let differ = new StorageDiffer(provider);
        let diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        for (let i = 1; i < MAX_CHANGED_VALUES; i++) {
            const value_count = i + 1;

            // changing values at srcContract
            const result = await chainProxy.changeDeepestValues(value_count, MAX_VALUE);
            expect(result).to.be.true;

            // migrate changes to proxy contract
            const migrationResult = await chainProxy.migrateChangesToProxy();
            expect(migrationResult.migrationResult).to.be.true;
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }
            
            logger.info(`Gas used for updating ${value_count} values in contract with max depth ${initialization.max_mpt_depth}: `, migrationResult.receipt.gasUsed.toNumber());

            // add data to csv
            csvManager.pushData({
                map_size: map_size,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                changed_value_count: value_count,
                max_mpt_depth: initialization.max_mpt_depth
            });

            // after update storage layouts are equal, no diffs
            diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
            expect(diff.isEmpty()).to.be.true;
        }
    });
});