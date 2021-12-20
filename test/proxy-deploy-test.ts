import { expect } from 'chai';
import { BigNumber, Contract, ethers } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { JsonRpcProvider } from '@ethersproject/providers';
import {
    RelayContract__factory, SyncCandidate, SyncCandidate__factory, CallRelayContract__factory, CallRelayContract, RelayContract,
} from '../src-gen/types';
import { getAllKeys } from '../src/utils/utils';
import DiffHandler from '../src/diffHandler/DiffHandler';
import { PROXY_INTERFACE } from '../src/config';
import { logger } from '../src/utils/logger';
import GetProof from '../src/proofHandler/GetProof';
import ProxyContractBuilder from '../src/utils/proxy-contract-builder';
import { encodeBlockHeader } from '../src/chain-proxy';
import { TestCLI } from './test-utils';
import { TxContractInteractionOptions } from '../src/cli/cross-chain-cli';
import FileHandler from '../src/utils/fileHandler';

describe('Deploy proxy and logic contract', async () => {
    let deployer: SignerWithAddress;
    let srcContract: SyncCandidate;
    let logicContract: SyncCandidate;
    let provider: JsonRpcProvider;
    let factory: SyncCandidate__factory;
    let relayContract: RelayContract;
    let latestBlock;
    let proxyContract: Contract;
    let callRelayContract: CallRelayContract;
    let proof: GetProof;
    let chainConfigs: TxContractInteractionOptions | undefined;

    before(async () => {
        const fh = new FileHandler(TestCLI.defaultTestConfigFile);
        chainConfigs = fh.getJSON<TxContractInteractionOptions>();
        if (!chainConfigs) {
            logger.error(`No config available under ${TestCLI.defaultTestConfigFile}`);
            process.exit(-1);
        }
        provider = new ethers.providers.JsonRpcProvider({ url: chainConfigs.srcChainRpcUrl, timeout: BigNumber.from(chainConfigs.connectionTimeout).toNumber() });
        deployer = await SignerWithAddress.create(provider.getSigner());
        logger.setSettings({ minLevel: 'info', name: 'proxy-deploy-test.ts' });
    });

    it('Should deploy initial contract and set an initial value', async () => {
        factory = new SyncCandidate__factory(deployer);
        srcContract = await factory.deploy();
        logicContract = await factory.deploy();
        // deploy the relay contract
        const Relayer = new RelayContract__factory(deployer);
        relayContract = await Relayer.deploy();
        await srcContract.setValueA(42);
        await srcContract.setValueB(100);
        expect((await srcContract.getValueA()).eq(ethers.BigNumber.from(42))).to.be.true;
    });

    it('Should copy the source contract', async () => {
        const keys = await getAllKeys(srcContract.address, provider);

        latestBlock = await provider.send('eth_getBlockByNumber', ['latest', true]);

        // create a proof of the source contract's storage
        proof = new GetProof(await provider.send('eth_getProof', [srcContract.address, keys]));

        await relayContract.addBlock(latestBlock.stateRoot, latestBlock.number);
    });

    it('Should compile and deploy the proxy', async () => {
        const compiledProxy = await ProxyContractBuilder.compiledAbiAndBytecode(relayContract.address, logicContract.address, srcContract.address);
        expect(compiledProxy.error).to.be.false;

        // deploy the proxy with the state of the `srcContract`
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);

        proxyContract = await proxyFactory.deploy();

        const proxyKeys: Array<string> = [];
        const proxyValues: Array<string> = [];
        proof.storageProof.forEach((p) => {
            proxyKeys.push(ethers.utils.hexZeroPad(p.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(p.value, 32));
        });
        await proxyContract.addStorage(proxyKeys, proxyValues, { gasLimit: chainConfigs?.gasLimit });

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        const differ = new DiffHandler(provider);
        const diff = await differ.getDiffFromStorage(srcContract.address, proxyContract.address);

        expect(diff.isEmpty()).to.be.true;
    });

    it('It should update multiple values', async () => {
        srcContract = await factory.deploy();

        // insert some random values
        await srcContract.insert(420, 30);
        await srcContract.insert(470, 1);
        await srcContract.insert(710, 2);
        await srcContract.insert(337, 3);
        await srcContract.insert(331, 4);
        await srcContract.insert(752, 5);
        await srcContract.insert(602, 6);
        await srcContract.insert(691, 8);

        const keys = await getAllKeys(srcContract.address, provider);
        latestBlock = await provider.send('eth_getBlockByNumber', ['latest', true]);
        // create a proof of the source contract's storage
        proof = new GetProof(await provider.send('eth_getProof', [srcContract.address, keys]));

        await relayContract.addBlock(latestBlock.stateRoot, latestBlock.number);

        const compiledProxy = await ProxyContractBuilder.compiledAbiAndBytecode(relayContract.address, logicContract.address, srcContract.address);
        expect(compiledProxy.error).to.be.false;

        // deploy the proxy with the state of the `srcContract`
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);

        proxyContract = await proxyFactory.deploy();

        const proxyKeys: Array<string> = [];
        const proxyValues: Array<string> = [];
        proof.storageProof.forEach((p) => {
            proxyKeys.push(ethers.utils.hexZeroPad(p.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(p.value, 32));
        });
        await proxyContract.addStorage(proxyKeys, proxyValues, { gasLimit: chainConfigs?.gasLimit });

        // validate migration
        //  getting account proof from source contract
        const sourceAccountProof = await proof.optimizedProof(latestBlock.stateRoot, false);

        //  getting account proof from proxy contract
        const proxyProvider = new ethers.providers.JsonRpcProvider(chainConfigs?.srcChainRpcUrl);
        const latestProxyChainBlock = await proxyProvider.send('eth_getBlockByNumber', ['latest', false]);
        const proxyChainProof = new GetProof(await proxyProvider.send('eth_getProof', [proxyContract.address, []]));
        const proxyAccountProof = await proxyChainProof.optimizedProof(latestProxyChainBlock.stateRoot, false);

        //  getting encoded block header
        const encodedBlockHeader = encodeBlockHeader(latestProxyChainBlock);

        await relayContract.verifyMigrateContract(sourceAccountProof, proxyAccountProof, encodedBlockHeader, proxyContract.address, ethers.BigNumber.from(latestProxyChainBlock.number).toNumber(), ethers.BigNumber.from(latestBlock.number).toNumber(), { gasLimit: chainConfigs?.gasLimit });

        //  validating
        const migrationValidated = await relayContract.getMigrationState(proxyContract.address);
        expect(migrationValidated).to.be.true;

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        const differ = new DiffHandler(provider);
        let diff = await differ.getDiffFromStorage(srcContract.address, proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        // change all the previous synced values
        await srcContract.insert(420, 5);
        await srcContract.insert(470, 9);
        await srcContract.insert(710, 8);
        await srcContract.insert(337, 7);
        await srcContract.insert(331, 5);
        await srcContract.insert(752, 6);
        await srcContract.insert(602, 7);
        await srcContract.insert(691, 9);
        // add new value
        await srcContract.insert(333, 33);

        // get the diff set, the storage keys for the changed values
        diff = await differ.getDiffFromStorage(srcContract.address, proxyContract.address);
        const changedKeys = diff.getKeys();

        latestBlock = await provider.send('eth_getBlockByNumber', ['latest', true]);

        // create a proof of the source contract's storage for all the changed keys
        proof = new GetProof(await provider.send('eth_getProof', [srcContract.address, changedKeys]));

        const rlpProof = await proof.optimizedProof(latestBlock.stateRoot);
        await relayContract.addBlock(latestBlock.stateRoot, latestBlock.number);

        // update the proxy storage
        const txResponse = await proxyContract.updateStorage(rlpProof, latestBlock.number);
        const receipt = await txResponse.wait();
        logger.info('Gas used for updating 8 and adding 1 value: ', receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiffFromStorage(srcContract.address, proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });

    it('should perform second iteration', async () => {
    // change some previously synced values
        await srcContract.insert(420, 53);
        await srcContract.insert(470, 93);
        await srcContract.insert(710, 83);

        // get the diff set, the storage keys for the changed values
        const differ = new DiffHandler(provider);
        let diff = await differ.getDiffFromStorage(srcContract.address, proxyContract.address);
        const changedKeys = diff.getKeys();

        latestBlock = await provider.send('eth_getBlockByNumber', ['latest', true]);

        // create a proof of the source contract's storage for all the changed keys
        proof = new GetProof(await provider.send('eth_getProof', [srcContract.address, changedKeys]));
        const rlpProof = await proof.optimizedProof(latestBlock.stateRoot);
        await relayContract.addBlock(latestBlock.stateRoot, latestBlock.number);

        // update the proxy storage
        await proxyContract.updateStorage(rlpProof, latestBlock.number);

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiffFromStorage(srcContract.address, proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });

    it('It should reject unknown values', async () => {
        await srcContract.insert(999, 6);
        await srcContract.insert(1200, 7);
        await srcContract.insert(1222, 9);

        // get the diff set, the storage keys for the changed values
        const differ = new DiffHandler(provider);
        const diff = await differ.getDiffFromStorage(srcContract.address, proxyContract.address);
        latestBlock = await provider.send('eth_getBlockByNumber', ['latest', true]);
        const keys = diff.getKeys();

        proof = new GetProof(await provider.send('eth_getProof', [srcContract.address, keys]));

        // compute the optimized storage proof
        const rlpOptimized = proof.optimizedStorageProof();
        // ensure that the old contract state equals the last synced storage hash
        const [oldHash, newHash] = await proxyContract.computeRoots(rlpOptimized);
        expect(oldHash).to.not.equal(newHash);
        expect(newHash).to.equal(proof.storageHash);
    });

    it('should reject state changes via fallback called externally', async () => {
    // Deploy Calling contract
        const callRelayFactory = new CallRelayContract__factory(deployer);
        callRelayContract = await callRelayFactory.deploy(proxyContract.address);

        try {
            await proxyContract.insert(691, 10);
        } catch (error) {
            // ignore error
        }
        // TODO: Why do external static calls not work?
        // expect(await proxyContract.callStatic.getValue(691)).to.equal(9);
        expect((await callRelayContract.callStatic.getValue(691)).eq(ethers.BigNumber.from(9))).to.be.true;
    });

    it('should be possible to retreive values via fallback through calling contract', async () => {
        expect((await callRelayContract.callStatic.getValue(691)).eq(ethers.BigNumber.from(9))).to.be.true;
        expect((await callRelayContract.callStatic.getValue(333)).eq(ethers.BigNumber.from(33))).to.be.true;
    });

    it('should reject state changes via fallback through calling contract', async () => {
        try {
            await callRelayContract.insert(691, 10);
        } catch (error) {
            // ignore error
        }
        expect((await callRelayContract.getValue(691)).eq(9)).to.be.true;
    });
});
