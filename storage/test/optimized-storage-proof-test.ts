import {SimpleStorage, SimpleStorage__factory,} from "../src-gen/types";
import {ethers} from "hardhat";
import {expect} from "chai";
import {GetProof, verifyStorageProof} from "../src/verify-proof";

describe("Test storage proof optimization", async function () {
    let deployer;
    let storage: SimpleStorage;
    let provider;

    before(async function () {
        [deployer] = await ethers.getSigners();
        const Storage = new SimpleStorage__factory(deployer);
        storage = await Storage.deploy();
        provider = new ethers.providers.JsonRpcProvider();
    });

    it("Should optimize the storage proof", async function () {
        const tx = await storage.setA(1337);
        const key = ethers.utils.hexZeroPad("0x0", 32);
        const proof = new GetProof (await provider.send("eth_getProof", [storage.address, [key]]));

        proof.optimizedStorageProof();
    })

    it("Should insert some mappings and create a nested optimized proof", async function () {
        const values:any[] = [];
        for (let i = 0; i < 10; i++) {
            // get some random keys
            const entry = {key: Math.floor(Math.random() * Math.floor(1000)), value: i};
            await storage.insert(entry.key, entry.value);
            values.push(entry);
        }

        const keys = await provider.send("parity_listStorageKeys", [
            storage.address, 100, null
        ]);

        const proof = new GetProof (await provider.send("eth_getProof", [storage.address, keys]));
        const optimized = proof.optimizedStorageProof();
    })

})