import {SimpleStorage, SimpleStorage__factory,} from "../src/types";
import * as hre from "hardhat";
import {ethers} from "hardhat";
import {expect} from "chai";

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

    // The constructor sets the `owner` field at slot 2, and `b` is initialized with 42 at slot 1
    // the order of the keys is determined by https://docs.rs/trie-db/0.22.1/trie_db/struct.FatDBIterator.html (pre-order traversal)
    // at https://github.com/openethereum/openethereum/blob/main/ethcore/src/client/client.rs#L2144
    it("Should contain two storage keys after deployment", async function () {
        const provider = new hre.ethers.providers.JsonRpcProvider();

        // https://openethereum.github.io/JSONRPC-parity-module#parity_liststoragekeys
        const keys = await provider.send("parity_listStorageKeys", [
            storage.address, 5, null
        ]);
        expect(keys.length).to.equal(2);

        //  value of `address owner;` is inside the slot with index 2 of the contract's storage
        const ownerSlot = ethers.BigNumber.from(keys[0]);
        expect(ownerSlot).to.equal(ethers.BigNumber.from(2));

        // value of `uint b` (=42) is inside the slot with index 1 (second slot)
        const bSlot = ethers.BigNumber.from(keys[1]);
        expect(bSlot).to.equal(ethers.BigNumber.from(1));

        // get the value of the `owner` field
        const storageOwner = await provider.getStorageAt(storage.address, ownerSlot);
        // converted to a 20byte address this equals to the address of the contract's deployer
        expect(ethers.utils.getAddress(storageOwner.slice(2 + 24))).to.equal(deployer.address)

        // get the value of the `b` field
        const bValue = await provider.getStorageAt(storage.address, bSlot);
        expect(bValue).to.equal(ethers.BigNumber.from(42));
    })
});