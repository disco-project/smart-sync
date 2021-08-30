/* eslint-env mocha */
/* eslint-disable no-unused-expressions */
import { ethers, network } from 'hardhat';
import { expect } from 'chai';
import { JsonRpcProvider } from '@ethersproject/providers';
import { HttpNetworkConfig } from 'hardhat/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import DiffHandler from '../src/diffHandler/DiffHandler';
import { logger } from '../src/utils/logger';
import { TestChainProxy } from './test-utils';
import {
    RelayContract__factory,
    MappingContract,
    MappingContract__factory,
    RelayContract,
} from '../src-gen/types';

const MAX_VALUE = 1000000;

describe('Test scaling of contract', async () => {
    let deployer: SignerWithAddress;
    let srcContract: MappingContract;
    let logicContract: MappingContract;
    let factory: MappingContract__factory;
    let provider: JsonRpcProvider;
    let relayContract: RelayContract;
    let httpConfig: HttpNetworkConfig;
    let chainProxy: TestChainProxy;

    before(async () => {
        httpConfig = network.config as HttpNetworkConfig;
        logger.setSettings({ minLevel: 'info', name: 'scale_test.ts' });
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
        logger.debug(`srcContractAddress: ${srcContract.address}, relayContract: ${relayContract.address}`);
        chainProxy = new TestChainProxy(srcContract, logicContract, httpConfig, deployer,
            relayContract,
            provider);
    });

    it('Contract with map containing 1 value, update 1 value', async () => {
        // insert some random values
        const initialization = await chainProxy.initializeProxyContract(1, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        const differ = new DiffHandler(provider);
        let diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        // change all the previous synced values
        await chainProxy.changeValues(1, MAX_VALUE);

        // get changed keys
        diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        const changedKeys = diff.getKeys();

        // migrate changes to proxy contract
        const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
        expect(migrationResult.migrationResult).to.be.true;
        if (!migrationResult.receipt) {
            logger.fatal('No receipt provided');
            process.exit(-1);
        }
        logger.info('Gas used for updating 1 value in map with 1 value: ', migrationResult.receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });

    it('Contract with map containing 10 values, update 1 value', async () => {
        // insert some random values
        const initialization = await chainProxy.initializeProxyContract(10, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        const differ = new DiffHandler(provider);
        let diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        // change all the previous synced values
        await chainProxy.changeValueAtIndex(0, MAX_VALUE);

        // get changed keys
        diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        const changedKeys = diff.getKeys();

        // migrate changes to proxy contract
        const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
        expect(migrationResult.migrationResult).to.be.true;
        if (!migrationResult.receipt) {
            logger.fatal('No receipt provided');
            process.exit(-1);
        }
        logger.info('Gas used for updating first value in map with 10 values: ', migrationResult.receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });

    it('Contract with map containing 10 values, update first 5 values', async () => {
        // insert some random values
        const initialization = await chainProxy.initializeProxyContract(10, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        const differ = new DiffHandler(provider);
        let diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        // change all the previous synced values
        await chainProxy.changeValues(5, MAX_VALUE);

        // get changed keys
        diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        const changedKeys = diff.getKeys();

        // migrate changes to proxy contract
        const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
        expect(migrationResult.migrationResult).to.be.true;
        if (!migrationResult.receipt) {
            logger.fatal('No receipt provided');
            process.exit(-1);
        }
        logger.info('Gas used for updating first 5 values in map with 10 values: ', migrationResult.receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });

    it('Contract with map containing 10 values, update last 5 values', async () => {
        // insert some random values
        const initialization = await chainProxy.initializeProxyContract(10, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        const differ = new DiffHandler(provider);
        let diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        // change all the previous synced values
        await chainProxy.changeValues(5, MAX_VALUE);

        // get changed keys
        diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        const changedKeys = diff.getKeys();

        // migrate changes to proxy contract
        const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
        expect(migrationResult.migrationResult).to.be.true;
        if (!migrationResult.receipt) {
            logger.fatal('No receipt provided');
            process.exit(-1);
        }
        logger.info('Gas used for updating last 5 values in map with 10 values: ', migrationResult.receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });

    it('Contract with map containing 10 values, update 10 values', async () => {
        // insert some random values
        const initialization = await chainProxy.initializeProxyContract(10, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        const differ = new DiffHandler(provider);
        let diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        // change all the previous synced values
        await chainProxy.changeValues(10, MAX_VALUE);

        // get changed keys
        diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        const changedKeys = diff.getKeys();

        // migrate changes to proxy contract
        const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
        expect(migrationResult.migrationResult).to.be.true;
        if (!migrationResult.receipt) {
            logger.fatal('No receipt provided');
            process.exit(-1);
        }
        logger.info('Gas used for updating 10 values in map with 10 values: ', migrationResult.receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });
});
