import {SimpleStorage, SimpleStorage__factory,} from "../src-gen/types";
import {ethers, network} from "hardhat";
import {GetProof} from "../src/verify-proof";
import { logger } from "../src/logger";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { HttpNetworkConfig } from "hardhat/types";

describe("Test storage proof optimization", async function () {
    let deployer: SignerWithAddress;
    let storage: SimpleStorage;
    let provider: JsonRpcProvider;
    let httpConfig: HttpNetworkConfig;

    before(async function () {
        httpConfig = network.config as HttpNetworkConfig;
        deployer = await SignerWithAddress.create(provider.getSigner());
        const Storage = new SimpleStorage__factory(deployer);
        storage = await Storage.deploy();
        provider = new ethers.providers.JsonRpcProvider(httpConfig.url);
        logger.setSettings({minLevel: 'info', name: 'optimized-storage-proof-test.ts'});
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