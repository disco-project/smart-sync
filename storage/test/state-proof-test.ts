import * as rlp from "rlp";
import {ethers} from "hardhat";
import {expect} from "chai";
import {StorageDiffer} from "../src/get-diff";
import {BaseTrie as Trie} from "merkle-patricia-tree";
import {SimpleStorage, SimpleStorage__factory} from "../src-gen/types";
import * as hre from "hardhat";
import {format_proof_nodes, GetProof, hexStringToBuffer} from "../src/verify-proof";

describe("Get contract storage diff", function () {
    let deployer;
    let storage: SimpleStorage;

    it("Should create old contract state proof", async function () {
        [deployer] = await ethers.getSigners();
        const Storage = new SimpleStorage__factory(deployer);
        storage = await Storage.deploy();

        const provider = new hre.ethers.providers.JsonRpcProvider();

        let keys = await provider.send("parity_listStorageKeys", [
            storage.address, 5, null
        ]);

        const oldProof = <GetProof>await provider.send("eth_getProof", [storage.address, keys]);
        await storage.setB(1337);

        await provider.send("parity_listStorageKeys", [
            storage.address, 5, null
        ]);

        const proof = <GetProof>await provider.send("eth_getProof", [storage.address, keys]);

        const block = await provider.send('eth_getBlockByNumber', ["latest", true]);

        const storageProof = proof.storageProof[0];

        const trie = new Trie();

        console.log(storageProof);

        console.log(storageProof.key);
        const storageKey = hexStringToBuffer(ethers.utils.keccak256(ethers.utils.hexZeroPad(storageProof.key, 32)));

        await trie.put(
            storageKey,
            hexStringToBuffer(storageProof.value)
        );


        // const trieProof = await Trie.createProof(trie,  hexStringToBuffer(storageProof.key));
        //
        // console.log(trieProof);
        console.log("");
        console.log(rlp.decode(storageProof.proof[0]));
        console.log(rlp.decode(storageProof.proof[1]));
        //console.log(ethers.utils.keccak256(ethers.utils.hexZeroPad(storageProof.key, 32)));

    })
});
