import {SimpleStorage, SimpleStorage__factory,} from "../src-gen/types";
import {ethers} from "hardhat";
import {GetProof} from "../src/verify-proof";
import { Logger } from "tslog";

describe("Test storage proof optimization", async function () {
    let deployer;
    let storage: SimpleStorage;
    let provider;
    let logger: Logger;

    before(async function () {
        [deployer] = await ethers.getSigners();
        const Storage = new SimpleStorage__factory(deployer);
        storage = await Storage.deploy();
        provider = new ethers.providers.JsonRpcProvider();
        process.env.CROSS_CHAIN_LOG_LEVEL = 'info';
        process.env.CROSS_CHAIN_LOGGER_NAME = 'optimized-storage-proof.ts';
    });

    it("Should insert some mappings and create a nested optimized proof", async function () {
        for (let i = 0; i < 10; i++) {
            // get some random keys
            const entry = {key: Math.floor(Math.random() * Math.floor(1000)), value: i};
            await storage.insert(entry.key, entry.value);
        }

        const keys = await provider.send("parity_listStorageKeys", [
            storage.address, 100, null
        ]);

        const proof = new GetProof (await provider.send("eth_getProof", [storage.address, keys]));
        const optimized = proof.optimizedStorageProof();
    })

})