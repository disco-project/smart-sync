import {RelayContract__factory, SyncCandidate, SyncCandidate__factory,} from "../src-gen/types";
import {ethers} from "hardhat";
import {expect} from "chai";
import {
    Account,
    encodeAccount,
    format_proof_nodes,
    GetProof,
    hexStringToBuffer,
    verifyStorageProof
} from "../src/verify-proof";
import {portContract} from "../src/port-contract";
import {getAllKeys} from "../src/utils";
import {StorageDiffer} from "../src/get-diff";
import * as rlp from "rlp";
import {BaseTrie as Trie} from "merkle-patricia-tree";
import {buildAccountProof} from "../src/build-proof";


describe("Deploy proxy and logic contract", async function () {
    let deployer;
    let srcContract: SyncCandidate;
    let provider;
    let factory: SyncCandidate__factory;

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

        const latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

        const proof = <GetProof>await provider.send("eth_getProof", [srcContract.address, keys]);

        // deploy the relay contract
        const Relayer = new RelayContract__factory(deployer);
        const relayContract = await Relayer.deploy(latestBlock.hash, proof.address, latestBlock.stateRoot, proof.storageHash);

        const merkleProof = await buildAccountProof(proof, latestBlock.stateRoot);

        const verified = await relayContract.verify(
            merkleProof.value,
            merkleProof.encodedPath,
            merkleProof.parentNodes,
            merkleProof.root
        );
        expect(verified).to.be.true;
    })


})