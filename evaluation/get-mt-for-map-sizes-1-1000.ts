import { BigNumber, ethers } from 'ethers';
import { expect } from 'chai';
import { JsonRpcProvider } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { CSVDataTemplateBasicMTEdge, CSVManager } from './eval-utils';
import { TestChainProxy, TestCLI } from '../test/test-utils';
import {
    RelayContract__factory, MappingContract, MappingContract__factory, RelayContract,
} from '../src-gen/types';
import { logger } from '../src/utils/logger';
import { getAllKeys } from '../src/utils/utils';
import GetProof from '../src/proofHandler/GetProof';
import { TxContractInteractionOptions } from '../src/cli/smart-sync';
import FileHandler from '../src/utils/fileHandler';

const MAX_VALUE = 1000000;

describe('get-mt-for-map-sizes-1-1000', async () => {
    let srcDeployer: SignerWithAddress;
    let targetDeployer: SignerWithAddress;
    let srcContract: MappingContract;
    let logicContract: MappingContract;
    let factory: MappingContract__factory;
    let srcProvider: JsonRpcProvider;
    let targetProvider: JsonRpcProvider;
    let relayContract: RelayContract;
    let chainConfigs: TxContractInteractionOptions | undefined;
    let csvManager: CSVManager<CSVDataTemplateBasicMTEdge>;
    let chainProxy: TestChainProxy;

    before(async () => {
        const fh = new FileHandler(TestCLI.defaultEvaluationConfigFile);
        chainConfigs = fh.getJSON<TxContractInteractionOptions>();
        if (!chainConfigs) {
            logger.error(`No config available under ${TestCLI.defaultEvaluationConfigFile}`);
            process.exit(-1);
        }
        srcProvider = new ethers.providers.JsonRpcProvider({ url: chainConfigs.srcChainRpcUrl, timeout: BigNumber.from(chainConfigs.connectionTimeout).toNumber() });
        targetProvider = new ethers.providers.JsonRpcProvider({ url: chainConfigs.targetChainRpcUrl, timeout: BigNumber.from(chainConfigs.connectionTimeout).toNumber() });
        srcDeployer = await SignerWithAddress.create(srcProvider.getSigner());
        targetDeployer = await SignerWithAddress.create(targetProvider.getSigner());
        logger.setSettings({ minLevel: 'info', name: 'get-mt-for-map-sizes-1-1000.ts' });
    });

    after(async () => {
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
        await csvManager.writeTofile();
    });

    it('Contract with map containing 10 values, update 1 value per mpt height', async () => {
        const mapSize = 10;
        const initialization = await chainProxy.initializeProxyContract(mapSize, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        csvManager = new CSVManager<{ from: string, to: string }>('10_edges.csv');
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
                    csvManager.pushData({ from: fromKec, to: toKec });
                }
            }
        });
    });

    it('Contract with map containing 100 values, update 1 value per mpt height', async () => {
        const mapSize = 100;
        const initialization = await chainProxy.initializeProxyContract(mapSize, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        csvManager = new CSVManager<{ from: string, to: string }>('100_edges.csv');
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
                    csvManager.pushData({ from: fromKec, to: toKec });
                }
            }
        });
    });

    it('Contract with map containing 1000 values, update 1 value per mpt height', async () => {
        const mapSize = 1000;
        const initialization = await chainProxy.initializeProxyContract(mapSize, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        csvManager = new CSVManager<{ from: string, to: string }>('1000_edges.csv');
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
                    csvManager.pushData({ from: fromKec, to: toKec });
                }
            }
        });
    });
});
