import {SimpleStorage, SimpleStorage__factory,} from "../src-gen/types";
import {ethers} from "hardhat";
import {expect} from "chai";
import {GetProof, verifyStorageProof} from "../src/verify-proof";

describe("Offchain verify", async function () {
    let deployer;
    let storage: SimpleStorage;
    let provider;

    before(async function () {
        [deployer] = await ethers.getSigners();
        const Storage = new SimpleStorage__factory(deployer);
        storage = await Storage.deploy();
        provider = new ethers.providers.JsonRpcProvider();
    });

    it("Should verify storage key inclusion", async function () {
        const tx = await storage.setA(1337);
        const key = ethers.utils.hexZeroPad("0x0", 32);
        const proof = <GetProof>await provider.send("eth_getProof", [storage.address, [key]]);

        const storageProof = proof.storageProof[0];
        const verify = await verifyStorageProof(storageProof, proof.storageHash);
        expect(verify).to.be.true;
    })

})