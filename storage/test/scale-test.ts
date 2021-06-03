import {RelayContract__factory, MappingContract, MappingContract__factory, SyncCandidate__factory, CallRelayContract__factory, CallRelayContract, SimpleStorage, SimpleStorage__factory, ProxyContract, RelayContract} from "../src-gen/types";
import {ethers, network} from "hardhat";
import {expect} from "chai";
import {StorageDiffer} from "../src/get-diff";
import { JsonRpcProvider } from "@ethersproject/providers";
import { logger } from "../src/logger"
import { HttpNetworkConfig } from "hardhat/types";
import { ChainProxy } from "./test-utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

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

    before(async () => {
        httpConfig = network.config as HttpNetworkConfig;
        logger.setSettings({minLevel: 'info', name: 'scale_test.ts'});
        [deployer] = await ethers.getSigners();
        provider = new ethers.providers.JsonRpcProvider(httpConfig.url);
    });

    beforeEach(async () => {
        factory = new MappingContract__factory(deployer);
        srcContract = await factory.deploy();
        logicContract = await factory.deploy();
        // deploy the relay contract
        const Relayer = new RelayContract__factory(deployer);
        relayContract = await Relayer.deploy();
        chainProxy = new ChainProxy(srcContract, logicContract, httpConfig, deployer, relayContract, provider);
    });

    it("Contract with map containing 1 value, update 1 value", async function () {
        // insert some random values
        const initialization = await chainProxy.initializeProxyContract(1, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        let differ = new StorageDiffer(provider);
        let diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        // change all the previous synced values
        await chainProxy.changeValues(1, MAX_VALUE);

        // get changed keys
        diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        const changedKeys = diff.getKeys();

        // migrate changes to proxy contract
        const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
        expect(migrationResult.migrationResult).to.be.true;
        if (!migrationResult.receipt) {
            logger.fatal('No receipt provided');
            process.exit(-1);
        }
        logger.info("Gas used for updating 1 value in map with 1 value: ", migrationResult.receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });

    it("Contract with map containing 10 values, update 1 value", async function() {
        // insert some random values
        const initialization = await chainProxy.initializeProxyContract(10, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        let differ = new StorageDiffer(provider);
        let diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        // change all the previous synced values
        await chainProxy.changeValueAtIndex(0, MAX_VALUE);

        // get changed keys
        diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        const changedKeys = diff.getKeys();

        // migrate changes to proxy contract
        const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
        expect(migrationResult.migrationResult).to.be.true;
        if (!migrationResult.receipt) {
            logger.fatal('No receipt provided');
            process.exit(-1);
        }
        logger.info("Gas used for updating first value in map with 10 values: ", migrationResult.receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });

    it("Contract with map containing 10 values, update first 5 values", async function() {
        // insert some random values
        const initialization = await chainProxy.initializeProxyContract(10, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        
        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        let differ = new StorageDiffer(provider);
        let diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        // change all the previous synced values
        await chainProxy.changeValues(5, MAX_VALUE);

        // get changed keys
        diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        const changedKeys = diff.getKeys();

        // migrate changes to proxy contract
        const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
        expect(migrationResult.migrationResult).to.be.true;
        if (!migrationResult.receipt) {
            logger.fatal('No receipt provided');
            process.exit(-1);
        }
        logger.info("Gas used for updating first 5 values in map with 10 values: ", migrationResult.receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });

    it("Contract with map containing 10 values, update last 5 values", async function() {
        // insert some random values
        const initialization = await chainProxy.initializeProxyContract(10, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        
        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        let differ = new StorageDiffer(provider);
        let diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        // change all the previous synced values
        await chainProxy.changeValues(5, MAX_VALUE, 5);

        // get changed keys
        diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        const changedKeys = diff.getKeys();

        // migrate changes to proxy contract
        const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
        expect(migrationResult.migrationResult).to.be.true;
        if (!migrationResult.receipt) {
            logger.fatal('No receipt provided');
            process.exit(-1);
        }
        logger.info("Gas used for updating last 5 values in map with 10 values: ", migrationResult.receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });

    it("Contract with map containing 10 values, update 10 values", async function() {
        // insert some random values
        const initialization = await chainProxy.initializeProxyContract(10, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        
        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        let differ = new StorageDiffer(provider);
        let diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        // change all the previous synced values
        await chainProxy.changeValues(10, MAX_VALUE);

        // get changed keys
        diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        const changedKeys = diff.getKeys();

        // migrate changes to proxy contract
        const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
        expect(migrationResult.migrationResult).to.be.true;
        if (!migrationResult.receipt) {
            logger.fatal('No receipt provided');
            process.exit(-1);
        }
        logger.info("Gas used for updating 10 values in map with 10 values: ", migrationResult.receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiffFromTxs(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });
})