import {RelayContract__factory, SyncCandidate, SyncCandidate__factory, CallRelayContract} from "../src-gen/types";
import {ethers} from "hardhat";
import {expect} from "chai";
import {GetProof} from "../src/verify-proof";
import {getAllKeys} from "../src/utils";
import {StorageDiffer} from "../src/get-diff";
import {DeployProxy} from "../src/deploy-proxy";
import {PROXY_INTERFACE} from "../src/config";
import {Contract} from "ethers";
import { Logger } from "tslog";
const rlp = require('rlp');

describe("Test scaling of contract", async function () {
    let deployer;
    let srcContract: SyncCandidate;
    let logicContract: SyncCandidate;
    let factory: SyncCandidate__factory;
    let provider;
    let relayContract;
    let encodedProof;
    let latestBlock;
    let proxyContract: Contract;
    let callRelayContract: CallRelayContract;
    let storageRoot;
    let logger: Logger;

    beforeEach(async () => {
        [deployer] = await ethers.getSigners();
        factory = new SyncCandidate__factory(deployer);
        srcContract = await factory.deploy();
        logicContract = await factory.deploy();
        // deploy the relay contract
        const Relayer = new RelayContract__factory(deployer);
        relayContract = await Relayer.deploy();
        provider = new ethers.providers.JsonRpcProvider();
        await srcContract.setValueA(42);
        await srcContract.setValueB(100);

        logger = new Logger({ name: 'extension-validation-test.ts', minLevel: 'info' });
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
        let proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]), logger);
        encodedProof = await proof.encoded(latestBlock.stateRoot);

        const rlpOptimized = proof.optimizedStorageProof();
        expect(rlpOptimized).to.not.be.undefined;
        expect(rlpOptimized).to.not.be.null;
        if (!rlpOptimized) process.exit(-1);
        expect(ethers.utils.keccak256(rlpOptimized)).to.equal('0x56058e12a3cd40a2bb799c6f297535d7da47185263d82d5d1e760df9eb65b8cd');
    });
});