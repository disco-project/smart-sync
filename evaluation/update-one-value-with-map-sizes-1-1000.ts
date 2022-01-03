import { ethers } from 'ethers';
import { expect } from 'chai';
import { JsonRpcProvider } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import {
    ChangeValueAtIndexResult, MigrationResult, TestChainProxy, TestCLI,
} from '../test/test-utils';
import { CSVDataTemplateSingleValue, CSVManager, getExtensionsAmountLeadingToValue } from './eval-utils';
import {
    RelayContract__factory, MappingContract, MappingContract__factory, RelayContract,
} from '../src-gen/types';
import DiffHandler from '../src/diffHandler/DiffHandler';
import { logger } from '../src/utils/logger';
import StorageDiff from '../src/diffHandler/StorageDiff';
import FileHandler from '../src/utils/fileHandler';
import { TxContractInteractionOptions } from '../src/cli/smart-sync';

const MAX_VALUE = 1000000;

describe('update-one-value-with-map-sizes-1-1000', async () => {
    let srcDeployer: SignerWithAddress;
    let targetDeployer: SignerWithAddress;
    let srcProvider: JsonRpcProvider;
    let targetProvider: JsonRpcProvider;
    let chainConfigs: TxContractInteractionOptions | undefined;
    let srcContract: MappingContract;
    let logicContract: MappingContract;
    let factory: MappingContract__factory;
    let relayContract: RelayContract;
    let chainProxy: TestChainProxy;
    let csvManager: CSVManager<CSVDataTemplateSingleValue>;
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
        logger.setSettings({ minLevel: 'info', name: 'update-one-value-with-map-sizes-1-1000.ts' });
        csvManager = new CSVManager<CSVDataTemplateSingleValue>('measurements-update-one-value-with-map-sizes-1-to-1000.csv');
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

    it('Contract with map containing 1 value, update 1 value', async () => {
        const initialization = await chainProxy.initializeProxyContract(1, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        currBlockNr = await srcProvider.getBlockNumber() + 1;

        // change all the previous synced values
        const result: ChangeValueAtIndexResult = await chainProxy.changeValueAtIndex(0, MAX_VALUE);

        // migrate changes to proxy contract
        // get the diff set, the storage keys for the changed values
        const diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
        const changedKeys: Array<BigNumberish> = diff.getKeys();
        logger.debug(changedKeys);
        const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
        expect(migrationResult.migrationResult).to.be.true;
        if (!migrationResult.receipt) {
            logger.fatal('No receipt provided');
            process.exit(-1);
        }

        const extensionsCounter = getExtensionsAmountLeadingToValue(result.newValue, migrationResult.proofs?.storageProof);

        logger.info(`Update value at ${1}, mapSize: ${1}, value_depth: ${migrationResult.maxValueMptDept}, extensionsCounter: ${extensionsCounter}, gas_cost:`, migrationResult.receipt.gasUsed.toNumber());

        csvManager.pushData({
            extensionsCounter,
            mapSize: 1,
            changed_value_index: 0,
            used_gas: migrationResult.receipt.gasUsed.toNumber(),
            max_mpt_depth: initialization.max_mpt_depth,
            value_mpt_depth: 1,
        });
    });

    it('Contract with map containing 10 values, update 1 value per iteration', async () => {
        const mapSize = 10;
        const initialization = await chainProxy.initializeProxyContract(mapSize, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        logger.debug(`correct storage root: ${initialization.initialValuesProof.storageHash}`);
        currBlockNr = await srcProvider.getBlockNumber() + 1;

        for (let i = 0; i < mapSize; i += 1) {
            // change previous synced value
            const result: ChangeValueAtIndexResult = await chainProxy.changeValueAtIndex(i, MAX_VALUE);
            expect(result.success).to.be.true;

            // migrate changes to proxy contract
            // get the diff set, the storage keys for the changed values
            const diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
            const changedKeys: Array<BigNumberish> = diff.getKeys();
            logger.debug(changedKeys);
            currBlockNr = await srcProvider.getBlockNumber() + 1;
            const migrationResult: MigrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }

            const extensionsCounter = getExtensionsAmountLeadingToValue(result.newValue, migrationResult.proofs?.storageProof);

            logger.info(`Update value at ${i}, mapSize: ${mapSize}, value_depth: ${migrationResult.maxValueMptDept}, extensionsCounter: ${extensionsCounter}, gas_cost:`, migrationResult.receipt.gasUsed.toNumber());

            csvManager.pushData({
                extensionsCounter,
                mapSize,
                changed_value_index: i,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                max_mpt_depth: initialization.max_mpt_depth,
                value_mpt_depth: migrationResult.maxValueMptDept,
            });
        }
    });

    it('Contract with map containing 100 values, update 1 value per iteration', async () => {
        const mapSize = 100;
        const initialization = await chainProxy.initializeProxyContract(mapSize, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        logger.debug(`correct storage root: ${initialization.initialValuesProof.storageHash}`);
        currBlockNr = await srcProvider.getBlockNumber() + 1;

        for (let i = 0; i < mapSize; i += 1) {
            // change previous synced value
            const result: ChangeValueAtIndexResult = await chainProxy.changeValueAtIndex(i, MAX_VALUE);
            expect(result.success).to.be.true;

            // migrate changes to proxy contract
            // get the diff set, the storage keys for the changed values
            const diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
            const changedKeys: Array<BigNumberish> = diff.getKeys();
            logger.debug(changedKeys);
            currBlockNr = await srcProvider.getBlockNumber() + 1;
            const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }

            const extensionsCounter = getExtensionsAmountLeadingToValue(result.newValue, migrationResult.proofs?.storageProof);

            logger.info(`Update value at ${i}, mapSize: ${mapSize}, value_depth: ${migrationResult.maxValueMptDept}, extensionsCounter: ${extensionsCounter}, gas_cost:`, migrationResult.receipt.gasUsed.toNumber());

            csvManager.pushData({
                extensionsCounter,
                mapSize,
                changed_value_index: i,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                max_mpt_depth: initialization.max_mpt_depth,
                value_mpt_depth: migrationResult.maxValueMptDept,
            });
        }
    });

    it('Contract with map containing 1000 values, update 1 value per iteration', async () => {
        const mapSize = 1000;
        const initialization = await chainProxy.initializeProxyContract(mapSize, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        logger.debug(`correct storage root: ${initialization.initialValuesProof.storageHash}`);
        currBlockNr = await srcProvider.getBlockNumber() + 1;

        for (let i = 0; i < mapSize; i += 1) {
            // change previous synced value
            const result: ChangeValueAtIndexResult = await chainProxy.changeValueAtIndex(i, MAX_VALUE);
            expect(result.success).to.be.true;

            // migrate changes to proxy contract
            // get the diff set, the storage keys for the changed values
            const diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
            const changedKeys: Array<BigNumberish> = diff.getKeys();
            logger.debug(changedKeys);
            currBlockNr = await srcProvider.getBlockNumber() + 1;
            const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
            expect(migrationResult.migrationResult).to.be.true;
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }

            const extensionsCounter = getExtensionsAmountLeadingToValue(result.newValue, migrationResult.proofs?.storageProof);

            logger.info(`Update value at ${i}, mapSize: ${mapSize}, value_depth: ${migrationResult.maxValueMptDept}, extensionsCounter: ${extensionsCounter}, gas_cost:`, migrationResult.receipt.gasUsed.toNumber());

            csvManager.pushData({
                extensionsCounter,
                mapSize,
                changed_value_index: i,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                max_mpt_depth: initialization.max_mpt_depth,
                value_mpt_depth: migrationResult.maxValueMptDept,
            });
        }
    });
});
