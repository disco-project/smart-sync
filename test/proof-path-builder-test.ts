import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { BigNumber, ethers } from 'ethers';
import { StorageImitator, StorageImitator__factory } from '../src-gen/types';
import { logger } from '../src/utils/logger';
import { TxContractInteractionOptions } from '../src/cli/smart-sync';
import FileHandler from '../src/utils/fileHandler';
import { TestCLI } from './test-utils';
import { CSVManager } from '../evaluation/eval-utils';
import { ChainProxy, ContractAddressMap, RPCConfig } from '../src/chain-proxy';

describe('Proof Path Builder Tests', () => {
    let deployer: SignerWithAddress;
    let storageSrc: StorageImitator;
    let provider: JsonRpcProvider;
    let chainConfigs: TxContractInteractionOptions | undefined;
    let chainProxy: ChainProxy;

    before(async () => {
        const fh = new FileHandler(TestCLI.defaultTestConfigFile);
        chainConfigs = fh.getJSON<TxContractInteractionOptions>();
        if (!chainConfigs) {
            logger.error(`No config available under ${TestCLI.defaultTestConfigFile}`);
            process.exit(-1);
        }
        provider = new ethers.providers.JsonRpcProvider({ url: chainConfigs.srcChainRpcUrl, timeout: BigNumber.from(chainConfigs.connectionTimeout).toNumber() });
        deployer = await SignerWithAddress.create(provider.getSigner());
        logger.setSettings({ minLevel: 'info', name: 'proof-path-builder-test.ts' });
    });

    beforeEach(async () => {
        const Storage = new StorageImitator__factory(deployer);
        storageSrc = await Storage.deploy();
        if (!chainConfigs) {
            logger.error(`No config available under ${TestCLI.defaultTestConfigFile}`);
            process.exit(-1);
        }
        const srcProviderConnectionInfo: ethers.utils.ConnectionInfo = {
            url: chainConfigs?.srcChainRpcUrl,
            timeout: BigNumber.from(chainConfigs.connectionTimeout).toNumber(),
        };
        const targetProviderConnectionInfo: ethers.utils.ConnectionInfo = {
            url: chainConfigs.targetChainRpcUrl,
            timeout: BigNumber.from(chainConfigs.connectionTimeout).toNumber(),
        };
        const contractAddressMap: ContractAddressMap = {
            srcContract: storageSrc.address,
        };
        const srcRPCConfig: RPCConfig = {
            gasLimit: BigNumber.from(chainConfigs.gasLimit).toNumber(),
        };
        const targetRPCConfig: RPCConfig = {
            targetAccountEncryptedJsonPath: TestCLI.targetAccountEncryptedJsonPath,
            targetAccountPassword: TestCLI.targetAccountPassword,
            gasLimit: BigNumber.from(chainConfigs.gasLimit).toNumber(),
        };
        chainProxy = new ChainProxy(contractAddressMap, srcProviderConnectionInfo, srcRPCConfig, targetProviderConnectionInfo, targetRPCConfig);
        await chainProxy.init();
    });

    it('Should build right proof after value was deleted', async () => {
        const csvManagerOld = new CSVManager<{ key: string, value: string }>('delete_earlyPairs_13534149.csv', 'test/storageKeyValuePairs');
        const csvManagerNew = new CSVManager<{ key: string, value: string }>('delete_latestPairs_13535417.csv', 'test/storageKeyValuePairs');
        const oldState = csvManagerOld.readFromFile();
        const newState: Array<string> = csvManagerNew.readFromFile();
        const oldKeys: Array<string> = [];
        const oldValues: Array<string> = [];
        const newKeys: Array<string> = [];
        const newValues: Array<string> = [];
        oldState.forEach((pair: [key: string, value: string]) => {
            oldKeys.push(ethers.utils.hexZeroPad(pair[0], 32));
            oldValues.push(ethers.utils.hexZeroPad(pair[1], 32));
        });
        newState.forEach((pair) => {
            newKeys.push(ethers.utils.hexZeroPad(pair[0], 32));
            newValues.push(ethers.utils.hexZeroPad(pair[1], 32));
        });
        while (oldKeys.length > 0) {
            await storageSrc.setStorageKey(oldKeys.splice(0, 50), oldValues.splice(0, 50), { gasLimit: BigNumber.from(chainConfigs?.gasLimit).toNumber() });
        }
        await chainProxy.migrateSrcContract('latest');
        // todo check if the storage is the same
        let changedKeys = await chainProxy.getDiff('srcTx', { targetBlock: 'latest' });
        if (!changedKeys) {
            logger.error('Could not get changed keys');
            expect(false);
            return;
        }
        if (changedKeys.getKeys().length > 0) {
            logger.error('There is a diff.');
            expect(false);
            return;
        }
        oldState.forEach((pair) => {
            const index = newState.findIndex((newPair) => ethers.utils.hexZeroPad(pair[0], 32) === ethers.utils.hexZeroPad(newPair[0], 32));
            if (index < 0) {
                newKeys.push(pair[0]);
                newValues.push(ethers.utils.hexZeroPad('0x0', 32));
            }
        });
        await storageSrc.setStorageKey(newKeys, newValues);
        changedKeys = await chainProxy.getDiff('srcTx', { targetBlock: 'latest' });
        if (!changedKeys) {
            logger.error('could not get changed keys');
            expect(false);
            return;
        }
        await chainProxy.migrateChangesToProxy(changedKeys?.getKeys(), []);

        const proxyProof = await chainProxy.targetProvider.send('eth_getProof', [chainProxy.proxyContractAddress, []]);
        const proxyStorageRoot = proxyProof.storageHash.toLowerCase();
        const srcProof = await chainProxy.srcProvider.send('eth_getProof', [chainProxy.srcContractAddress, []]);
        const srcStorageRoot = srcProof.storageHash.toLowerCase();
        expect(proxyStorageRoot).to.equal(srcStorageRoot);
    });

    it('Should build right proof after value that changes the merkle treee', async () => {
        const csvManagerOld = new CSVManager<{ key: string, value: string }>('early_pairs_for_change_mt_through_add_13535603.csv', 'test/storageKeyValuePairs');
        const csvManagerNew = new CSVManager<{ key: string, value: string }>('latest_pairs_for_change_mt_through_add_13536164.csv', 'test/storageKeyValuePairs');
        const oldState = csvManagerOld.readFromFile();
        const newState: Array<string> = csvManagerNew.readFromFile();
        const oldKeys: Array<string> = [];
        const oldValues: Array<string> = [];
        const newKeys: Array<string> = [];
        const newValues: Array<string> = [];
        oldState.forEach((pair: [key: string, value: string]) => {
            oldKeys.push(ethers.utils.hexZeroPad(pair[0], 32));
            oldValues.push(ethers.utils.hexZeroPad(pair[1], 32));
        });
        newState.forEach((pair) => {
            newKeys.push(ethers.utils.hexZeroPad(pair[0], 32));
            newValues.push(ethers.utils.hexZeroPad(pair[1], 32));
        });
        while (oldKeys.length > 0) {
            await storageSrc.setStorageKey(oldKeys.splice(0, 50), oldValues.splice(0, 50), { gasLimit: BigNumber.from(chainConfigs?.gasLimit).toNumber() });
        }
        logger.debug(`srcContractAddress: ${storageSrc.address}`);
        await chainProxy.migrateSrcContract('latest');

        let changedKeys = await chainProxy.getDiff('srcTx', { targetBlock: 'latest' });
        if (!changedKeys) {
            logger.error('Could not get changed keys');
            expect(false);
            return;
        }
        if (changedKeys.getKeys().length > 0) {
            logger.error('There is a diff.');
            expect(false);
            return;
        }
        oldState.forEach((pair) => {
            const index = newState.findIndex((newPair) => ethers.utils.hexZeroPad(pair[0], 32) === ethers.utils.hexZeroPad(newPair[0], 32));
            if (index < 0) {
                newKeys.push(pair[0]);
                newValues.push(ethers.utils.hexZeroPad('0x0', 32));
            }
        });
        await storageSrc.setStorageKey(newKeys, newValues);
        changedKeys = await chainProxy.getDiff('srcTx', { targetBlock: 'latest' });
        if (!changedKeys) {
            logger.error('could not get changed keys');
            expect(false);
            return;
        }
        await chainProxy.migrateChangesToProxy(changedKeys?.getKeys(), changedKeys.fromKeys);

        const proxyProof = await chainProxy.targetProvider.send('eth_getProof', [chainProxy.proxyContractAddress, []]);
        const proxyStorageRoot = proxyProof.storageHash.toLowerCase();
        const srcProof = await chainProxy.srcProvider.send('eth_getProof', [chainProxy.srcContractAddress, []]);
        const srcStorageRoot = srcProof.storageHash.toLowerCase();
        expect(proxyStorageRoot).to.equal(srcStorageRoot);
    });
});
