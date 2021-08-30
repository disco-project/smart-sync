/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-env mocha */
/* eslint-disable no-unused-expressions */
import { ethers, network } from 'hardhat';
import { expect } from 'chai';
import { JsonRpcProvider } from '@ethersproject/providers';
import { HttpNetworkConfig } from 'hardhat/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumberish } from '@ethersproject/bignumber';
import { logger } from '../src/utils/logger';
import { TestChainProxy } from '../test/test-utils';
import { CSVDataTemplateMultipleValues, CSVManager } from './eval-utils';
import {
    RelayContract__factory, MappingContract, MappingContract__factory, RelayContract,
} from '../src-gen/types';
import DiffHandler from '../src/diffHandler/DiffHandler';
import StorageDiff from '../src/diffHandler/StorageDiff';

const MAX_VALUE = 1000000;
const MAX_CHANGED_VALUES = 100;

describe('update-multiple-values-with-map-sizes-1-1000', async () => {
    let deployer: SignerWithAddress;
    let srcContract: MappingContract;
    let logicContract: MappingContract;
    let factory: MappingContract__factory;
    let provider: JsonRpcProvider;
    let relayContract: RelayContract;
    let httpConfig: HttpNetworkConfig;
    let chainProxy: TestChainProxy;
    let csvManager: CSVManager<CSVDataTemplateMultipleValues>;
    let differ: DiffHandler;
    let currBlockNr: number;

    before(() => {
        httpConfig = network.config as HttpNetworkConfig;
        logger.setSettings({ minLevel: 'info', name: 'update-multiple-values-with-map-sizes-1-1000.ts' });
        csvManager = new CSVManager<CSVDataTemplateMultipleValues>('measurements-multiple-values-with-map-sizes-1-to-1000.csv');
        provider = new ethers.providers.JsonRpcProvider(httpConfig.url);
        differ = new DiffHandler(provider);
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
        chainProxy = new TestChainProxy(srcContract, logicContract, httpConfig, deployer, relayContract, provider);
    });

    afterEach(async () => {
    });

    it('Contract with map containing 10 values, update multiple values per iteration', async () => {
        const map_size = 10;
        const initialization = await chainProxy.initializeProxyContract(map_size, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        currBlockNr = await provider.getBlockNumber() + 1;

        for (let i = 0; i < map_size; i += 1) {
            const value_count = i + 1;

            // changing values at srcContract
            const result = await chainProxy.changeDeepestValues(value_count, MAX_VALUE);
            expect(result).to.be.true;

            // migrate changes to proxy contract
            // get the diff set, the storage keys for the changed values
            const diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
            const changedKeys: Array<BigNumberish> = diff.getKeys();
            logger.debug(`valueCount: ${value_count}, changedKeys: ${changedKeys.length}`);
            currBlockNr = await provider.getBlockNumber() + 1;
            const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
            expect(migrationResult.migrationResult).to.be.true;
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }

            logger.info(`Gas used for updating ${value_count} values in contract with max depth ${initialization.max_mpt_depth}: `, migrationResult.receipt.gasUsed.toNumber());

            // add data to csv
            csvManager.pushData({
                map_size,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                changed_value_count: value_count,
                max_mpt_depth: initialization.max_mpt_depth,
            });
        }
    });

    it('Contract with map containing 100 values, update multiple values per iteration', async () => {
        const map_size = 100;
        const initialization = await chainProxy.initializeProxyContract(map_size, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        currBlockNr = await provider.getBlockNumber() + 1;

        for (let i = 0; i < map_size; i += 1) {
            const value_count = i + 1;

            // changing values at srcContract
            const result = await chainProxy.changeDeepestValues(value_count, MAX_VALUE);
            expect(result).to.be.true;

            // migrate changes to proxy contract
            // get the diff set, the storage keys for the changed values
            const diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
            const changedKeys: Array<BigNumberish> = diff.getKeys();
            logger.debug(`valueCount: ${value_count}, changedKeys: ${changedKeys.length}`);
            currBlockNr = await provider.getBlockNumber() + 1;
            const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
            expect(migrationResult.migrationResult).to.be.true;
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }

            logger.info(`Gas used for updating ${value_count} values in contract with max depth ${initialization.max_mpt_depth}: `, migrationResult.receipt.gasUsed.toNumber());

            // add data to csv
            csvManager.pushData({
                map_size,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                changed_value_count: value_count,
                max_mpt_depth: initialization.max_mpt_depth,
            });
        }
    });

    it('Contract with map containing 1000 values, update multiple values per iteration', async () => {
        const map_size = 1000;
        const initialization = await chainProxy.initializeProxyContract(map_size, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        currBlockNr = await provider.getBlockNumber() + 1;

        for (let i = 0; i < MAX_CHANGED_VALUES; i += 1) {
            const value_count = i + 1;

            // changing values at srcContract
            const result = await chainProxy.changeDeepestValues(value_count, MAX_VALUE);
            expect(result).to.be.true;

            // migrate changes to proxy contract
            // get the diff set, the storage keys for the changed values
            const diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
            const changedKeys: Array<BigNumberish> = diff.getKeys();
            logger.debug(`valueCount: ${value_count}, changedKeys: ${changedKeys.length}`);
            currBlockNr = await provider.getBlockNumber() + 1;
            const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
            expect(migrationResult.migrationResult).to.be.true;
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }

            logger.info(`Gas used for updating ${value_count} values in contract with max depth ${initialization.max_mpt_depth}: `, migrationResult.receipt.gasUsed.toNumber());

            // add data to csv
            csvManager.pushData({
                map_size,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                changed_value_count: value_count,
                max_mpt_depth: initialization.max_mpt_depth,
            });
        }
    });
});