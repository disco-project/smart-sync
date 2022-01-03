import { ethers } from 'ethers';
import { expect } from 'chai';
import { JsonRpcProvider } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { TestChainProxy, TestCLI } from '../test/test-utils';
import { CSVDataTemplateMultipleValues, CSVManager } from './eval-utils';
import {
    RelayContract__factory, MappingContract, MappingContract__factory, RelayContract,
} from '../src-gen/types';
import DiffHandler from '../src/diffHandler/DiffHandler';
import { logger } from '../src/utils/logger';
import StorageDiff from '../src/diffHandler/StorageDiff';
import { TxContractInteractionOptions } from '../src/cli/smart-sync';
import FileHandler from '../src/utils/fileHandler';

const MAX_VALUE = 1000000;
const MAX_CHANGED_VALUES = 100;

describe('update-multiple-values-random-with-map-sizes-1-1000', async () => {
    let srcDeployer: SignerWithAddress;
    let targetDeployer: SignerWithAddress;
    let srcProvider: JsonRpcProvider;
    let targetProvider: JsonRpcProvider;
    let srcContract: MappingContract;
    let logicContract: MappingContract;
    let factory: MappingContract__factory;
    let relayContract: RelayContract;
    let chainConfigs: TxContractInteractionOptions | undefined;
    let chainProxy: TestChainProxy;
    let csvManager: CSVManager<CSVDataTemplateMultipleValues>;
    let differ: DiffHandler;
    let currBlockNr: number;

    before(async () => {
        const fh = new FileHandler(TestCLI.defaultTestConfigFile);
        chainConfigs = fh.getJSON<TxContractInteractionOptions>();
        if (!chainConfigs) {
            logger.error(`No config available under ${TestCLI.defaultTestConfigFile}`);
            process.exit(-1);
        }
        srcProvider = new ethers.providers.JsonRpcProvider({ url: chainConfigs.srcChainRpcUrl, timeout: BigNumber.from(chainConfigs.connectionTimeout).toNumber() });
        targetProvider = new ethers.providers.JsonRpcProvider({ url: chainConfigs.targetChainRpcUrl, timeout: BigNumber.from(chainConfigs.connectionTimeout).toNumber() });
        srcDeployer = await SignerWithAddress.create(srcProvider.getSigner());
        targetDeployer = await SignerWithAddress.create(targetProvider.getSigner());
        logger.setSettings({ minLevel: 'info', name: 'update-multiple-values-random-with-map-sizes-1-1000.ts' });
        csvManager = new CSVManager<CSVDataTemplateMultipleValues>('measurements-multiple-values-random-with-map-sizes-1-1000.csv');
        differ = new DiffHandler(srcProvider, targetProvider);
    });

    after(async () => {
        await csvManager.writeTofile();
    });

    beforeEach(async () => {
        factory = new MappingContract__factory(srcDeployer);
        srcContract = await factory.deploy();
        logicContract = await factory.deploy();
        // deploy the relay contract
        const Relayer = new RelayContract__factory(targetDeployer);
        relayContract = await Relayer.deploy();
        if (!chainConfigs) {
            logger.error(`No config available under ${TestCLI.defaultTestConfigFile}`);
            process.exit(-1);
        }
        chainProxy = new TestChainProxy(srcContract, logicContract, chainConfigs, srcDeployer, targetDeployer, relayContract, srcProvider, targetProvider);
    });

    afterEach(async () => {
    });

    it('Contract with map containing 10 values, update multiple values random per iteration', async () => {
        const mapSize = 10;
        const initialization = await chainProxy.initializeProxyContract(mapSize, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        currBlockNr = await srcProvider.getBlockNumber() + 1;

        for (let i = 0; i < mapSize; i += 1) {
            const valueCount = i + 1;

            // changing values at srcContract
            const result = await chainProxy.changeRandomValues(valueCount, MAX_VALUE);
            expect(result).to.be.true;

            // migrate changes to proxy contract
            // get the diff set, the storage keys for the changed values
            const diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
            const changedKeys: Array<BigNumberish> = diff.getKeys();
            logger.debug(`valueCount: ${valueCount}, changedKeys: ${changedKeys.length}`);
            currBlockNr = await srcProvider.getBlockNumber() + 1;
            const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
            expect(migrationResult.migrationResult).to.be.true;
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }

            logger.info(`value count: ${valueCount}, gas used: `, migrationResult.receipt.gasUsed.toNumber());

            // add data to csv
            csvManager.pushData({
                mapSize,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                changed_value_count: valueCount,
                max_mpt_depth: initialization.max_mpt_depth,
                sequential: false,
            });
        }
    });

    it('Contract with map containing 100 values, update multiple values random per iteration', async () => {
        const mapSize = 100;
        const initialization = await chainProxy.initializeProxyContract(mapSize, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        currBlockNr = await srcProvider.getBlockNumber() + 1;

        for (let i = 0; i < mapSize; i += 1) {
            const valueCount = i + 1;

            // changing values at srcContract
            const result = await chainProxy.changeRandomValues(valueCount, MAX_VALUE);
            expect(result).to.be.true;

            // migrate changes to proxy contract
            // get the diff set, the storage keys for the changed values
            const diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
            const changedKeys: Array<BigNumberish> = diff.getKeys();
            currBlockNr = await srcProvider.getBlockNumber() + 1;
            const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
            expect(migrationResult.migrationResult).to.be.true;
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }

            logger.info(`value count: ${valueCount}, gas used: `, migrationResult.receipt.gasUsed.toNumber());

            // add data to csv
            csvManager.pushData({
                mapSize,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                changed_value_count: valueCount,
                max_mpt_depth: initialization.max_mpt_depth,
                sequential: false,
            });
        }
    });

    it('Contract with map containing 1000 values, update multiple values random per iteration', async () => {
        const mapSize = 1000;
        const initialization = await chainProxy.initializeProxyContract(mapSize, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        currBlockNr = await srcProvider.getBlockNumber() + 1;

        for (let i = 0; i < MAX_CHANGED_VALUES; i += 1) {
            const valueCount = i + 1;

            // changing values at srcContract
            const result = await chainProxy.changeRandomValues(valueCount, MAX_VALUE);
            expect(result).to.be.true;

            // migrate changes to proxy contract
            // get the diff set, the storage keys for the changed values
            const diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
            const changedKeys: Array<BigNumberish> = diff.getKeys();
            logger.debug(`valueCount: ${valueCount}, changedKeys: ${changedKeys.length}`);
            currBlockNr = await srcProvider.getBlockNumber() + 1;
            const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
            expect(migrationResult.migrationResult).to.be.true;
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }

            logger.info(`value count: ${valueCount}, gas used: `, migrationResult.receipt.gasUsed.toNumber());

            // add data to csv
            csvManager.pushData({
                mapSize,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                changed_value_count: valueCount,
                max_mpt_depth: initialization.max_mpt_depth,
                sequential: false,
            });
        }
    });
});
