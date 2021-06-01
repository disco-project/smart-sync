import {RelayContract__factory, SyncCandidate, SyncCandidate__factory, CallRelayContract__factory, CallRelayContract, RelayContract} from "../src-gen/types";
import {ethers, network} from "hardhat";
import {expect} from "chai";
import {GetProof, encodeBlockHeader} from "../src/verify-proof";
import {getAllKeys} from "../src/utils";
import {StorageDiffer} from "../src/get-diff";
import {DeployProxy} from "../src/deploy-proxy";
import {PROXY_INTERFACE} from "../src/config";
import {Contract} from "ethers";
import { logger } from "../src/logger"
import { HttpNetworkConfig } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { JsonRpcProvider } from "@ethersproject/providers";

describe("Deploy proxy and logic contract", async function () {
    let deployer: SignerWithAddress;
    let srcContract: SyncCandidate;
    let logicContract: SyncCandidate;
    let provider: JsonRpcProvider;
    let factory: SyncCandidate__factory;
    let relayContract: RelayContract;
    let latestBlock;
    let proxyContract: Contract;
    let callRelayContract: CallRelayContract;
    let proof;
    let httpConfig: HttpNetworkConfig;

    before(async () => {
        httpConfig = network.config as HttpNetworkConfig;
        logger.setSettings({minLevel: 'info', name: 'proxy-deploy-test.ts'});
        [deployer] = await ethers.getSigners();
        provider = new ethers.providers.JsonRpcProvider(httpConfig.url);
    });

    it("Should deploy initial contract and set an initial value", async function () {
        factory = new SyncCandidate__factory(deployer);
        srcContract = await factory.deploy();
        logicContract = await factory.deploy();
        // deploy the relay contract
        const Relayer = new RelayContract__factory(deployer);
        relayContract = await Relayer.deploy();
        await srcContract.setValueA(42);
        await srcContract.setValueB(100);
        expect(await srcContract.getValueA()).to.be.equal(ethers.BigNumber.from(42));
    });

    it("Should copy the source contract", async function () {
        const keys = await getAllKeys(srcContract.address, provider);

        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

        // create a proof of the source contract's storage
        proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]));

        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);
    })

    it("Should compile and deploy the proxy", async function () {
        const compiledProxy = await DeployProxy.compiledAbiAndBytecode(relayContract.address, logicContract.address, srcContract.address);

        // deploy the proxy with the state of the `srcContract`
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);

        proxyContract = await proxyFactory.deploy();

        let proxyKeys: Array<string> = [];
        let proxyValues: Array<string> = [];
        for (const storageProof of proof.storageProof) {
            proxyKeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
        }
        await proxyContract.addStorage(proxyKeys, proxyValues, { gasLimit: httpConfig.gas });

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        const differ = new StorageDiffer(provider);
        const diff = await differ.getDiffFromTxs(srcContract.address, proxyContract.address);

        expect(diff.isEmpty()).to.be.true;
    })

    it("It should update multiple values", async function () {
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

        let keys = await getAllKeys(srcContract.address, provider);
        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);
        // create a proof of the source contract's storage
        proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]));

        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        const compiledProxy = await DeployProxy.compiledAbiAndBytecode(relayContract.address, logicContract.address, srcContract.address);

        // deploy the proxy with the state of the `srcContract`
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);

        proxyContract = await proxyFactory.deploy();

        let proxyKeys: Array<string> = [];
        let proxyValues: Array<string> = [];
        for (const storageProof of proof.storageProof) {
            proxyKeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
        }
        await proxyContract.addStorage(proxyKeys, proxyValues, { gasLimit: httpConfig.gas });

        // validate migration
        //  getting account proof from source contract
        const sourceAccountProof = await proof.optimizedProof(latestBlock.stateRoot, false);

        //  getting account proof from proxy contract
        const proxyProvider = new ethers.providers.JsonRpcProvider(httpConfig.url);
        const latestProxyChainBlock = await proxyProvider.send('eth_getBlockByNumber', ["latest", false]);
        const proxyChainProof = new GetProof(await proxyProvider.send("eth_getProof", [proxyContract.address, []]));
        const proxyAccountProof = await proxyChainProof.optimizedProof(latestProxyChainBlock.stateRoot, false);

        //  getting encoded block header
        const encodedBlockHeader = encodeBlockHeader(latestProxyChainBlock);

        await relayContract.verifyMigrateContract(sourceAccountProof, proxyAccountProof, encodedBlockHeader, proxyContract.address, ethers.BigNumber.from(latestProxyChainBlock.number).toNumber(), { gasLimit: httpConfig.gas });

        //  validating
        const migrationValidated = await relayContract.getMigrationState(proxyContract.address);
        expect(migrationValidated).to.be.true;

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        let differ = new StorageDiffer(provider);
        let diff = await differ.getDiffFromTxs(srcContract.address, proxyContract.address);
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
        diff = await differ.getDiffFromTxs(srcContract.address, proxyContract.address);
        const changedKeys = diff.diffs.map(c => c.key);

        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

        // create a proof of the source contract's storage for all the changed keys
        proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, changedKeys]));

        // compute the optimized storage proof
        const rlpOptimized = proof.optimizedStorageProof();

        // ensure that the old contract state equals the last synced storage hash
        const validated = await proxyContract.verifyOldContractStateProof(rlpOptimized);
        expect(validated).to.be.true;

        const rlpProof = await proof.optimizedProof(latestBlock.stateRoot);
        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        // update the proxy storage
        let txResponse = await proxyContract.updateStorage(rlpProof);
        let receipt = await txResponse.wait();
        console.log("Gas used for updating 8 and adding 1 value: ", receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiffFromTxs(srcContract.address, proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    })

    it("should perform second iteration", async function() {
        // change some previously synced values
        await srcContract.insert(420, 53);
        await srcContract.insert(470, 93);
        await srcContract.insert(710, 83);

        // get the diff set, the storage keys for the changed values
        const differ = new StorageDiffer(provider);
        let diff = await differ.getDiffFromTxs(srcContract.address, proxyContract.address);
        const changedKeys = diff.diffs.map(c => c.key);

        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

        // create a proof of the source contract's storage for all the changed keys
        const proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, changedKeys]));
        const rlpProof = await proof.optimizedProof(latestBlock.stateRoot);
        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        // update the proxy storage
        await proxyContract.updateStorage(rlpProof);

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiffFromTxs(srcContract.address, proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    })

    it("It should reject unknown values", async function () {
        await srcContract.insert(999, 6);
        await srcContract.insert(1200, 7);
        await srcContract.insert(1222, 9);

        // get the diff set, the storage keys for the changed values
        const differ = new StorageDiffer(provider);
        const diff = await differ.getDiffFromTxs(srcContract.address, proxyContract.address);
        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);
        const keys = diff.diffs.map(c => c.key);

        const proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]));

        const rlpProof = await proof.optimizedProof(latestBlock.stateRoot);

        // Note that the respective block is not added to the realy contract here

        // compute the optimized storage proof
        const rlpOptimized = proof.optimizedStorageProof();
        // ensure that the old contract state equals the last synced storage hash
        const validated = await proxyContract.verifyOldContractStateProof(rlpOptimized);
        expect(validated).to.be.false;
    })

    it("should reject state changes via fallback called externally", async function() {
        // Deploy Calling contract
        const callRelayFactory = new CallRelayContract__factory(deployer);
        callRelayContract = await callRelayFactory.deploy(proxyContract.address);

        try {
            await proxyContract.insert(691,10);
        } catch (error) {
            // ignore error
        }
        // TODO: Why do external static calls not work?
        // expect(await proxyContract.callStatic.getValue(691)).to.equal(9);
        expect(await callRelayContract.callStatic.getValue(691)).to.equal(ethers.BigNumber.from(9));
    })

    it("should be possible to retreive values via fallback through calling contract", async function() {
        expect(await callRelayContract.callStatic.getValue(691)).to.equal(ethers.BigNumber.from(9));
        expect(await callRelayContract.callStatic.getValue(333)).to.equal(ethers.BigNumber.from(33));
    })

    it("should reject state changes via fallback through calling contract", async function() {
        try {
            await callRelayContract.insert(691,10);
        } catch (error) {
            // ignore error
        }
        expect(await callRelayContract.getValue(691)).to.equal(9);
    })
})