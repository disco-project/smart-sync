import {SimpleStorage, SimpleStorage__factory,} from "../src-gen/types";
import * as hre from "hardhat";
import {ethers} from "hardhat";
import {expect} from "chai";
import {BaseTrie as Trie} from "merkle-patricia-tree";
import {GetProof, verify_eth_getProof} from "../src/verify-proof";
import {Proof} from "merkle-patricia-tree/dist.browser/baseTrie";

describe("Storage", function () {
    let deployer;
    let storage: SimpleStorage;
    it("Should deploy and return default values", async function () {
        [deployer] = await ethers.getSigners();
        const Storage = new SimpleStorage__factory(deployer);
        storage = await Storage.deploy();

        expect(await storage.getA()).to.equal(0);
        expect(await storage.getB()).to.equal(42);
        expect(await storage.getValue(deployer.address)).to.equal(0);
    });

    it("Should read correct storage after transactions", async function () {
        const provider = new hre.ethers.providers.JsonRpcProvider();

        // assign a value to `a`
        const newValue = 1337;
        expect(await storage.setA(newValue)).to.exist;
        const keys = await provider.send("parity_listStorageKeys", [
            storage.address, 5, null
        ]);
        // now there should be 3 storage keys
        expect(keys.length).to.equal(2);

        // `a` is the first field of the contract and its value is stored at slot 0
        const aValue = await provider.getStorageAt(storage.address, 0);
        expect(aValue).to.equal(ethers.BigNumber.from(newValue));
    })

    it("Should read correct mapping storage", async function () {
        const provider = new hre.ethers.providers.JsonRpcProvider();

        const value = 1000;
        expect(await storage.setValue(value)).to.exist;
        const keys = await provider.send("parity_listStorageKeys", [
            storage.address, 5, null
        ]);
        // after setting `a` and inserting a value in the mapping there should be 4 storage keys
        expect(keys.length).to.equal(3);
        const storageKey = ethers.BigNumber.from(keys[1]);

        // the `storageKey` of the `value` is the hash of the `key` of `value` in the mapping
        // concatenated with the slot of the mapping in the contract: `keccak256(key . slot)`
        const location = ethers.utils.hexConcat([
            ethers.utils.hexZeroPad(deployer.address, 32), ethers.utils.hexZeroPad("0x03", 32),
        ]);
        expect(ethers.utils.keccak256(location)).to.equal(keys[1]);

        const storedValue = await provider.getStorageAt(storage.address, storageKey);
        expect(ethers.BigNumber.from(storedValue).toNumber()).to.equal(value);
    })

    async function verifyProof(rootHash: Buffer, key: Buffer, proof: Proof): Promise<Buffer | null> {
        let proofTrie = new Trie(null, rootHash)
        try {
            proofTrie = await Trie.fromProof(proof, proofTrie)
        } catch (e) {
            throw new Error('Invalid proof nodes given')
        }
        return proofTrie.get(key)
    }

    it("Should return a valid proof", async function () {
        const provider = new hre.ethers.providers.JsonRpcProvider();
        const keys = await provider.send("parity_listStorageKeys", [
            storage.address, 5, null
        ]);
        // [`eth_getProof`](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1186.md) implemented at
        // https://github.com/openethereum/openethereum/blob/27a0142af14730bcb50eeacc84043dc6f49395e8/rpc/src/v1/impls/eth.rs#L677
        const proof = <GetProof>await provider.send("eth_getProof", [storage.address, keys]);

        // get the latest block
        const block = await provider.send('eth_getBlockByNumber', ["latest", true]);

        // verify the proof against the block's state root
        expect(await verify_eth_getProof(proof, block.stateRoot)).to.be.true;
    })
});
