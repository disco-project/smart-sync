import * as hre from "hardhat";
import * as rlp from "rlp";
import {ethers} from "hardhat";
import {expect} from "chai";
import {BaseTrie as Trie} from "merkle-patricia-tree";
import {SimpleStorage, SimpleStorage__factory} from "../src-gen/types";
import {format_proof_nodes, GetProof, hexStringToBuffer} from "../src/verify-proof";
import * as utils from "../src/utils";
import {buildAccountProof} from "../src/build-proof";

describe("Validate old contract state", function () {
    let deployer;
    let storage: SimpleStorage;

    it("Should validate contract state proof", async function () {
        [deployer] = await ethers.getSigners();
        const Storage = new SimpleStorage__factory(deployer);
        storage = await Storage.deploy();
        const provider = new hre.ethers.providers.JsonRpcProvider();

        const oldValue = 1;

        await storage.setA(oldValue);

        let keys = await provider.send("parity_listStorageKeys", [
            storage.address, 10, null
        ]);

        const oldProof = <GetProof>await provider.send("eth_getProof", [storage.address, keys]);

        await storage.setA(1337);

        keys = await provider.send("parity_listStorageKeys", [
            storage.address, 10, null
        ]);

        const proof = <GetProof>await provider.send("eth_getProof", [storage.address, keys]);

        const trie = new Trie();

        for (let p of proof.storageProof) {
            const storageKey = hexStringToBuffer(ethers.utils.keccak256(ethers.utils.hexZeroPad(p.key, 32)));
            const val = p.value === "0x0" ? Buffer.from([]) : hexStringToBuffer(ethers.BigNumber.from(p.value).toHexString());
            await trie.put(
                storageKey,
                utils.encode(val)
            );
        }

        expect(proof.storageHash).to.be.equal("0x" + trie.root.toString("hex"))

        // reset to old value
        await trie.put(
            hexStringToBuffer(ethers.utils.keccak256(ethers.utils.hexZeroPad("0x0", 32))),
            utils.encode(hexStringToBuffer(ethers.BigNumber.from(oldValue).toHexString()))
        );

        expect(oldProof.storageHash).to.be.equal("0x" + trie.root.toString("hex"))
    })

    it("Should validate contract state proof", async function () {
        const Storage = new SimpleStorage__factory(deployer);
        const storage2 = await Storage.deploy();
        const provider = new hre.ethers.providers.JsonRpcProvider();

        let keys = await provider.send("parity_listStorageKeys", [
            storage2.address, 10, null
        ]);

        const block = await provider.send('eth_getBlockByNumber', ["latest", true]);

        const getProof  = <GetProof>await provider.send("eth_getProof", [storage2.address, keys]);

        let proof = new GetProof(getProof);

        const encoded = await proof.encoded(block.stateRoot);
        //
        // proof = await GetProof.decode(encoded, storage2.address);
        // console.log(proof.storageProof.length);
        const p = proof.storageProof[0];
        // console.log(p.proof);
        const nodes = format_proof_nodes(p.proof);
        console.log(nodes[0].toString("hex"));
        const dec = rlp.decode(nodes[0]);
        console.log(dec[0]);
        console.log(rlp.encode(dec[0]));
        console.log(rlp.encode(dec[1]));
        // console.log(Buffer.concat([rlp.encode(dec[0]), rlp.encode(dec[1])]));
        //
        // console.log(Buffer.concat([Buffer.from([35 +192]),  rlp.encode(dec[0]), rlp.encode(dec[1])]));
        const storageKey = hexStringToBuffer(ethers.utils.keccak256(ethers.utils.hexZeroPad(p.key, 32)));
        console.log("key: ", storageKey.toString("hex"));
        console.log("root: ", proof.storageHash);
        //
        //
        //
        // console.log(encoded);
    })
});
