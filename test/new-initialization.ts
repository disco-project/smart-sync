/* eslint-env mocha */
/* eslint-disable no-unused-expressions */
import { ethers, network } from 'hardhat';
import { expect } from 'chai';
import { JsonRpcProvider } from '@ethersproject/providers';
import { HttpNetworkConfig } from 'hardhat/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import DiffHandler from '../src/diffHandler/DiffHandler';
import { logger } from '../src/utils/logger';
import { TestChainProxy, InitializationResult } from './test-utils';
import {
    RelayContract__factory, MappingContract, MappingContract__factory, RelayContract,
} from '../src-gen/types';

const MAX_VALUE = 1000000;

describe('New Initialization', async () => {
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
        logger.setSettings({ minLevel: 'info', name: 'new-initialization.ts' });
        provider = new ethers.providers.JsonRpcProvider(httpConfig.url);
        [deployer] = await ethers.getSigners();
    });

    beforeEach(async () => {
        factory = new MappingContract__factory(deployer);
        srcContract = await factory.deploy();
        logicContract = await factory.deploy();
        // deploy the relay contract
        const Relayer = new RelayContract__factory(deployer);
        relayContract = await Relayer.deploy();
        chainProxy = new TestChainProxy(srcContract, logicContract, httpConfig, deployer, relayContract, provider);
    });

    it('Contract with map containing 1000 values, update 20 values', async () => {
        const map_size = 1000;
        let initialization: InitializationResult;
        try {
            initialization = await chainProxy.initializeProxyContract(map_size, MAX_VALUE);
            expect(initialization.migrationState).to.be.true;
        } catch (e) {
            logger.fatal(e);
            process.exit(-1);
        }

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        const differ = new DiffHandler(provider);
        let diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        // change all the previous synced values
        const result = await chainProxy.changeDeepestValues(20, MAX_VALUE);
        expect(result).to.be.true;

        diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        const changedKeys = diff.getKeys();

        // migrate changes to proxy contract
        const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
        expect(migrationResult.migrationResult).to.be.true;
        if (!migrationResult.receipt) {
            logger.fatal('No receipt provided');
            process.exit(-1);
        }

        logger.info('Gas used for updating 20 values in map with 1000 values: ', migrationResult.receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });
});