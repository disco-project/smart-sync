import * as hre from "hardhat";
import {ethers} from "hardhat";
import * as rlp from "rlp";
import {expect} from "chai";
import {BaseTrie as Trie} from "merkle-patricia-tree";
import {SimpleStorage, SimpleStorage__factory} from "../src-gen/types";
import {format_proof_nodes, GetProof, hexStringToBuffer} from "../src/verify-proof";
import * as utils from "../src/utils";

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
});
