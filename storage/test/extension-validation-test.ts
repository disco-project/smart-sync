import {RelayContract__factory, SyncCandidate, SyncCandidate__factory, CallRelayContract, RelayContract} from "../src-gen/types";
import {ethers, network} from "hardhat";
import {expect} from "chai";
import {GetProof} from "../src/verify-proof";
import {getAllKeys} from "../src/utils";
import {StorageDiffer} from "../src/get-diff";
import {ProxyContractBuilder} from "../src/proxy-contract-builder";
import {PROXY_INTERFACE} from "../src/config";
import {Contract} from "ethers";
import { logger } from "../src/logger";
import { HttpNetworkConfig } from "hardhat/types";
import { JsonRpcProvider } from "@ethersproject/providers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("Extension Validation", async function () {
    let deployer: SignerWithAddress;
    let srcContract: SyncCandidate;
    let logicContract: SyncCandidate;
    let factory: SyncCandidate__factory;
    let provider: JsonRpcProvider;
    let relayContract: RelayContract;
    let latestBlock;
    let proxyContract: Contract;
    let httpConfig: HttpNetworkConfig;

    before(async () => {
        [deployer] = await ethers.getSigners();
        httpConfig = network.config as HttpNetworkConfig;
        logger.setSettings({minLevel: 'info', name: 'extension-validation-test.ts'});
        provider = new ethers.providers.JsonRpcProvider(httpConfig.url);
    });

    beforeEach(async () => {
        factory = new SyncCandidate__factory(deployer);
        srcContract = await factory.deploy();
        logicContract = await factory.deploy();
        // deploy the relay contract
        const Relayer = new RelayContract__factory(deployer);
        relayContract = await Relayer.deploy();
        await srcContract.setValueA(42);
        await srcContract.setValueB(100);
    });

    it("It should create an optimized proof with extension nodes in it", async function () {
        srcContract = await factory.deploy();

        // insert some random values
        await srcContract.insert(420, 30);
        await srcContract.insert(470, 1);
        await srcContract.insert(710, 2);
        await srcContract.insert(337, 3);
        await srcContract.insert(331, 4);
        await srcContract.insert(20, 5);
        await srcContract.insert(400, 6);
        await srcContract.insert(50, 8);
        await srcContract.insert(752, 6);
        await srcContract.insert(602, 7);
        await srcContract.insert(691, 9);
        await srcContract.insert(333, 33);

        let keys = await getAllKeys(srcContract.address, provider);
        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);
        // create a proof of the source contract's storage

        let proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]));

        const rlpOptimized = proof.optimizedStorageProof();
        expect(rlpOptimized).to.not.be.undefined;
        expect(rlpOptimized).to.not.be.null;
        if (!rlpOptimized) process.exit(-1);
        expect(ethers.utils.keccak256(rlpOptimized)).to.equal('0x56058e12a3cd40a2bb799c6f297535d7da47185263d82d5d1e760df9eb65b8cd');
    });

    it("proxyContract should accept proof with extensions in it and create an optimized proof with an extension node as root", async function () {
        srcContract = await factory.deploy();

        // insert some random values
        await srcContract.insert(20, 5);
        await srcContract.insert(333, 33);

        let keys = await getAllKeys(srcContract.address, provider);
        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);
        // create a proof of the source contract's storage
        let proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]));

        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        const compiledProxy = await ProxyContractBuilder.compiledAbiAndBytecode(relayContract.address, logicContract.address, srcContract.address);

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
        let differ = new StorageDiffer(provider);
        let diff = await differ.getDiffFromStorage(srcContract.address, proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        const rlpOptimized = proof.optimizedStorageProof();
        expect(rlpOptimized).to.not.be.undefined;
        expect(rlpOptimized).to.not.be.null;
        if (!rlpOptimized) process.exit(-1);
        expect(ethers.utils.keccak256(rlpOptimized)).to.equal('0x1af21a373943b987bcbf3fdcbbb249ec3c6ec3f4074bc554b0a766deeb1bf677');
    });
});