import {RelayContract__factory, MappingContract, MappingContract__factory, RelayContract} from "../src-gen/types";
import {ethers, network} from "hardhat";
import {expect} from "chai";
import { JsonRpcProvider } from "@ethersproject/providers";
import { logger } from "../src/logger"
import { HttpNetworkConfig } from "hardhat/types";
import { CSVDataTemplatePerMTHeight, CSVManager } from "./eval-utils";
import { ChainProxy } from "../test/test-utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { StorageDiff, StorageDiffer } from "../src/get-diff";
import { BigNumberish } from "@ethersproject/bignumber";

const MAX_VALUE = 1000000;

describe("Test scaling of contract", async function () {
    let deployer: SignerWithAddress;
    let srcContract: MappingContract;
    let logicContract: MappingContract;
    let factory: MappingContract__factory;
    let provider: JsonRpcProvider;
    let relayContract: RelayContract;
    let httpConfig: HttpNetworkConfig;
    let csvManager: CSVManager<CSVDataTemplatePerMTHeight>;
    let chainProxy: ChainProxy;
    let differ: StorageDiffer;
    let currBlockNr: number;

    before(() => {
        httpConfig = network.config as HttpNetworkConfig;
        logger.setSettings({minLevel: 'info', name: 'update-one-value-per-mpt-height-with-map-sizes-1-to-1000.ts'});
        csvManager = new CSVManager<CSVDataTemplatePerMTHeight>(`measurements-update-one-value-per-mpt-height-with-map-sizes-1-to-1000.csv`);
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

    it("Contract with map containing 1 value, update 1 value", async function () {
        const initialization = await chainProxy.initializeProxyContract(1, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        currBlockNr = await provider.getBlockNumber() + 1;

        // change all the previous synced values
        await chainProxy.changeValueAtIndex(0, MAX_VALUE);

        // migrate changes to proxy contract
        // get the diff set, the storage keys for the changed values
        let diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
        const changedKeys: Array<BigNumberish> = diff.getKeys();
        logger.debug(changedKeys);
        const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
        expect(migrationResult.migrationResult).to.be.true;
        if (!migrationResult.receipt) {
            logger.fatal('No receipt provided');
            process.exit(-1);
        }

        logger.info("Gas used for updating 1 value in map with 1 value: ", migrationResult.receipt.gasUsed.toNumber());

        csvManager.pushData({
            map_size: 1,
            used_gas: migrationResult.receipt.gasUsed.toNumber(),
            max_mpt_depth: initialization.max_mpt_depth,
            value_mpt_depth: 1
        });
    });

    it("Contract with map containing 10 values, update 1 value per mpt height", async function() {
        const map_size = 10;
        const initialization = await chainProxy.initializeProxyContract(map_size, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        currBlockNr = await provider.getBlockNumber() + 1;

        for (let i = initialization.min_mpt_depth; i <= initialization.max_mpt_depth; i++) {
            // change value
            expect(await chainProxy.changeValueAtMTHeight(i, MAX_VALUE)).to.be.true;

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

            logger.info(`Gas used for updating value in height ${i} in contract with max depth ${initialization.max_mpt_depth}: `, migrationResult.receipt.gasUsed.toNumber());

            // add data to csv
            csvManager.pushData({
                map_size: map_size,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                max_mpt_depth: initialization.max_mpt_depth,
                value_mpt_depth: i
            });
        }
    });

    it("Contract with map containing 100 values, update 1 value per mpt height", async function() {
        const map_size = 100;
        const initialization = await chainProxy.initializeProxyContract(map_size, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        currBlockNr = await provider.getBlockNumber() + 1;

        for (let i = initialization.min_mpt_depth; i <= initialization.max_mpt_depth; i++) {
            // change value
            expect(await chainProxy.changeValueAtMTHeight(i, MAX_VALUE)).to.be.true;

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

            logger.info(`Gas used for updating value in height ${i} in contract with max depth ${initialization.max_mpt_depth}: `, migrationResult.receipt.gasUsed.toNumber());

            // add data to csv
            csvManager.pushData({
                map_size: map_size,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                max_mpt_depth: initialization.max_mpt_depth,
                value_mpt_depth: i
            });
        }
    });

    it("Contract with map containing 1000 values, update 1 value per mpt height", async function() {
        const map_size = 1000;
        const initialization = await chainProxy.initializeProxyContract(map_size, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        currBlockNr = await provider.getBlockNumber() + 1;

        for (let i = initialization.min_mpt_depth; i <= initialization.max_mpt_depth; i++) {
            // change value
            expect(await chainProxy.changeValueAtMTHeight(i, MAX_VALUE)).to.be.true;

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

            logger.info(`Gas used for updating value in height ${i} in contract with max depth ${initialization.max_mpt_depth}: `, migrationResult.receipt.gasUsed.toNumber());

            // add data to csv
            csvManager.pushData({
                map_size: map_size,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                max_mpt_depth: initialization.max_mpt_depth,
                value_mpt_depth: i
            });
        }
    });
});