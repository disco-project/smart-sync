import { ethers } from 'ethers';
import { expect } from 'chai';
import { JsonRpcProvider } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { CSVDataTemplatePerMTHeight, CSVManager } from './eval-utils';
import { TestChainProxy, TestCLI } from '../test/test-utils';
import {
    RelayContract__factory, MappingContract, MappingContract__factory, RelayContract,
} from '../src-gen/types';
import DiffHandler from '../src/diffHandler/DiffHandler';
import { logger } from '../src/utils/logger';
import StorageDiff from '../src/diffHandler/StorageDiff';
import { getAllKeys } from '../src/utils/utils';
import GetProof from '../src/proofHandler/GetProof';
import { TxContractInteractionOptions } from '../src/cli/smart-sync';
import FileHandler from '../src/utils/fileHandler';

const MAX_VALUE = 1000000;

describe('update-one-value-per-mpt-height-with-map-sizes-1-to-1000', async () => {
    let srcDeployer: SignerWithAddress;
    let targetDeployer: SignerWithAddress;
    let srcProvider: JsonRpcProvider;
    let targetProvider: JsonRpcProvider;
    let srcContract: MappingContract;
    let logicContract: MappingContract;
    let factory: MappingContract__factory;
    let relayContract: RelayContract;
    let chainConfigs: TxContractInteractionOptions | undefined;
    let csvManager: CSVManager<CSVDataTemplatePerMTHeight>;
    let chainProxy: TestChainProxy;
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
        logger.setSettings({ minLevel: 'info', name: 'update-one-value-per-mpt-height-with-map-sizes-1-to-1000.ts' });
        csvManager = new CSVManager<CSVDataTemplatePerMTHeight>('measurements-update-one-value-per-mpt-height-with-map-sizes-1-to-1000.csv');
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
        await chainProxy.changeValueAtIndex(0, MAX_VALUE);

        // migrate changes to proxy contract
        // get the diff set, the storage keys for the changed values
        const start = (new Date()).getTime();
        const diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
        const changedKeys: Array<BigNumberish> = diff.getKeys();
        logger.debug(changedKeys);
        const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
        const timer = (new Date()).getTime() - start;
        expect(migrationResult.migrationResult).to.be.true;
        if (!migrationResult.receipt) {
            logger.fatal('No receipt provided');
            process.exit(-1);
        }

        logger.info('Gas used for updating 1 value in map with 1 value: ', migrationResult.receipt.gasUsed.toNumber());

        csvManager.pushData({
            mapSize: 1,
            used_gas: migrationResult.receipt.gasUsed.toNumber(),
            max_mpt_depth: initialization.max_mpt_depth,
            value_mpt_depth: 1,
            changeMigrationTime: timer,
        });
    });

    it('Contract with map containing 10 values, update 1 value per mpt height', async () => {
        const mapSize = 10;
        const initialization = await chainProxy.initializeProxyContract(mapSize, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        currBlockNr = await srcProvider.getBlockNumber() + 1;

        for (let i = initialization.min_mpt_depth; i <= initialization.max_mpt_depth; i += 1) {
            // change value
            expect(await chainProxy.changeValueAtMTHeight(i, MAX_VALUE)).to.be.true;

            // migrate changes to proxy contract
            // get the diff set, the storage keys for the changed values
            const start = (new Date()).getTime();
            const diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
            const changedKeys: Array<BigNumberish> = diff.getKeys();
            logger.debug(changedKeys);
            const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
            const timer = (new Date()).getTime() - start;
            expect(migrationResult.migrationResult).to.be.true;
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }

            logger.info(`Gas used for updating value in height ${i} in contract with max depth ${initialization.max_mpt_depth}: `, migrationResult.receipt.gasUsed.toNumber());

            // add data to csv
            csvManager.pushData({
                mapSize,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                max_mpt_depth: initialization.max_mpt_depth,
                value_mpt_depth: i,
                changeMigrationTime: timer,
            });
        }
    });

    it('Contract with map containing 100 values, update 1 value per mpt height', async () => {
        const mapSize = 100;
        const initialization = await chainProxy.initializeProxyContract(mapSize, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        currBlockNr = await srcProvider.getBlockNumber() + 1;
        const csvDings = new CSVManager<{ from: string, to: string }>('edges.csv');
        const theKeys = await getAllKeys(srcContract.address, srcProvider);
        const proofer = new GetProof(await srcProvider.send('eth_getProof', [srcContract.address, theKeys]));
        const existingPairs: { from: string, to: string }[] = [];
        proofer.storageProof.forEach((proof) => {
            for (let i = 1; i < proof.proof.length; i += 1) {
                const fromKec = ethers.utils.keccak256(proof.proof[i - 1]);
                const toKec = ethers.utils.keccak256(proof.proof[i]);
                const index = existingPairs.findIndex((pair) => pair.from === fromKec && pair.to === toKec);
                if (index < 0) {
                    existingPairs.push({ from: fromKec, to: toKec });
                    csvDings.pushData({ from: fromKec, to: toKec });
                }
            }
        });
        await csvDings.writeTofile();

        for (let i = initialization.min_mpt_depth; i <= initialization.max_mpt_depth; i += 1) {
            // change value
            expect(await chainProxy.changeValueAtMTHeight(i, MAX_VALUE)).to.be.true;

            // migrate changes to proxy contract
            // get the diff set, the storage keys for the changed values
            const start = (new Date()).getTime();
            const diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
            const changedKeys: Array<BigNumberish> = diff.getKeys();
            logger.debug(changedKeys);
            const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
            const timer = (new Date()).getTime() - start;
            expect(migrationResult.migrationResult).to.be.true;
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }

            logger.info(`Gas used for updating value in height ${i} in contract with max depth ${initialization.max_mpt_depth}: `, migrationResult.receipt.gasUsed.toNumber());

            // add data to csv
            csvManager.pushData({
                mapSize,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                max_mpt_depth: initialization.max_mpt_depth,
                value_mpt_depth: i,
                changeMigrationTime: timer,
            });
        }
    });

    it('Contract with map containing 1000 values, update 1 value per mpt height', async () => {
        const mapSize = 1000;
        const initialization = await chainProxy.initializeProxyContract(mapSize, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        currBlockNr = await srcProvider.getBlockNumber() + 1;

        for (let i = initialization.min_mpt_depth; i <= initialization.max_mpt_depth; i += 1) {
            // change value
            expect(await chainProxy.changeValueAtMTHeight(i, MAX_VALUE)).to.be.true;

            // migrate changes to proxy contract
            // get the diff set, the storage keys for the changed values
            const start = (new Date()).getTime();
            const diff: StorageDiff = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr);
            const changedKeys: Array<BigNumberish> = diff.getKeys();
            logger.debug(changedKeys);
            const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
            const timer = (new Date()).getTime() - start;
            expect(migrationResult.migrationResult).to.be.true;
            if (!migrationResult.receipt) {
                logger.fatal('No receipt provided');
                process.exit(-1);
            }

            logger.info(`Gas used for updating value in height ${i} in contract with max depth ${initialization.max_mpt_depth}: `, migrationResult.receipt.gasUsed.toNumber());

            // add data to csv
            csvManager.pushData({
                mapSize,
                used_gas: migrationResult.receipt.gasUsed.toNumber(),
                max_mpt_depth: initialization.max_mpt_depth,
                value_mpt_depth: i,
                changeMigrationTime: timer,
            });
        }
    });
});
