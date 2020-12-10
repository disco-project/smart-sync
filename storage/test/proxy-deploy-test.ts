import {RelayContract__factory, SyncCandidate, SyncCandidate__factory,} from "../src-gen/types";
import {ethers} from "hardhat";
import {expect} from "chai";
import {encodeStorageProof, GetProof, hexStringToBuffer, testStorageProof} from "../src/verify-proof";
import {getAllKeys} from "../src/utils";
import {StorageDiffer} from "../src/get-diff";
import {buildAccountProof} from "../src/build-proof";
import {DeployProxy} from "../src/deploy-proxy";
import {PROXY_INTERFACE} from "../src/config";
import * as rlp from "rlp";
import * as utils from"../src/utils";

describe("Deploy proxy and logic contract", async function () {
    let deployer;
    let srcContract: SyncCandidate;
    let provider;
    let factory: SyncCandidate__factory;
    let relayContract;
    let encodedProof;
    let latestBlock;

    it("Should deploy initial contract and set an initial value", async function () {
        [deployer] = await ethers.getSigners();
        factory = new SyncCandidate__factory(deployer);
        srcContract = await factory.deploy();
        provider = new ethers.providers.JsonRpcProvider();
        await srcContract.setValueA(42);
        expect(await srcContract.getValueA()).to.be.equal(ethers.BigNumber.from(42));
    });

    it("Should copy the source contract", async function () {
        const targetContract = await factory.deploy();
        await targetContract.setValueA(42);
        expect((await new StorageDiffer(provider).getDiff(srcContract.address, targetContract.address)).isEmpty()).to.be.true;
        const keys = await getAllKeys(srcContract.address, provider);

        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

        const proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]));

        // deploy the relay contract
        const Relayer = new RelayContract__factory(deployer);
        relayContract = await Relayer.deploy(latestBlock.hash, proof.address, latestBlock.stateRoot, proof.storageHash);

        const merkleProof = await buildAccountProof(proof, latestBlock.stateRoot);

        const verified = await relayContract.verify(
            merkleProof.value,
            merkleProof.encodedPath,
            merkleProof.parentNodes,
            merkleProof.root
        );
        expect(verified).to.be.true;

        // rlp encode the `eth_getProof`
        encodedProof = await proof.encoded(latestBlock.stateRoot);
        expect(await relayContract.verifyEthGetProof(encodedProof)).to.be.true;

        const storage = proof.storageProof[0];

        const rlpStorage = await encodeStorageProof(storage, proof.storageHash);

        const resp  = await relayContract.verifyStorageProof(rlpStorage, proof.storageHash);

        console.log("storage verified: ", resp);
    })

    it("Should compile the proxy", async function () {
        const compiledProxy = await DeployProxy.compiledAbiAndBytecode(relayContract.address, srcContract.address);

        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);

        const proxyContract = await proxyFactory.deploy(encodedProof, latestBlock.hash);

        console.log(proxyContract);
    })


})