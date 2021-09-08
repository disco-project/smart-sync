import { ethers } from 'ethers';
import { network } from 'hardhat';
import { expect } from 'chai';
import { JsonRpcProvider } from '@ethersproject/providers';
import { HttpNetworkConfig } from 'hardhat/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { CSVDataTemplateBasicMTEdge, CSVManager } from './eval-utils';
import { TestChainProxy } from '../test/test-utils';
import {
    RelayContract__factory, MappingContract, MappingContract__factory, RelayContract,
} from '../src-gen/types';
import { logger } from '../src/utils/logger';
import { getAllKeys } from '../src/utils/utils';
import GetProof from '../src/proofHandler/GetProof';

const MAX_VALUE = 1000000;

describe('get-mt-for-map-sizes-1-1000', async () => {
    let deployer: SignerWithAddress;
    let srcContract: MappingContract;
    let logicContract: MappingContract;
    let factory: MappingContract__factory;
    let provider: JsonRpcProvider;
    let relayContract: RelayContract;
    let httpConfig: HttpNetworkConfig;
    let csvManager: CSVManager<CSVDataTemplateBasicMTEdge>;
    let chainProxy: TestChainProxy;

    before(() => {
        httpConfig = network.config as HttpNetworkConfig;
        logger.setSettings({ minLevel: 'info', name: 'get-mt-for-map-sizes-1-1000.ts' });
        provider = new ethers.providers.JsonRpcProvider(httpConfig.url);
    });

    after(async () => {
    });

    beforeEach(async () => {
        deployer = await SignerWithAddress.create(provider.getSigner());
        factory = new MappingContract__factory(deployer);
        srcContract = await factory.deploy();
        logicContract = await factory.deploy();
        // deploy the relay contract
        const Relayer = new RelayContract__factory(deployer);
        relayContract = await Relayer.deploy();
        chainProxy = new TestChainProxy(srcContract, logicContract, httpConfig, deployer, relayContract, provider);
    });

    afterEach(async () => {
        await csvManager.writeTofile();
    });

    it('Contract with map containing 10 values, update 1 value per mpt height', async () => {
        const mapSize = 10;
        const initialization = await chainProxy.initializeProxyContract(mapSize, MAX_VALUE);
        expect(initialization.migrationState).to.be.true;
        csvManager = new CSVManager<{ from: string, to: string }>('10_edges.csv');
        const theKeys = await getAllKeys(srcContract.address, provider);
        const proofer = new GetProof(await provider.send('eth_getProof', [srcContract.address, theKeys]));
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
        const theKeys = await getAllKeys(srcContract.address, provider);
        const proofer = new GetProof(await provider.send('eth_getProof', [srcContract.address, theKeys]));
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
        const theKeys = await getAllKeys(srcContract.address, provider);
        const proofer = new GetProof(await provider.send('eth_getProof', [srcContract.address, theKeys]));
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
