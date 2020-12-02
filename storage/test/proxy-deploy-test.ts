import {SyncCandidate, SyncCandidate__factory,} from "../src-gen/types";
import {ethers} from "hardhat";
import {expect} from "chai";
import {GetProof, verifyStorageProof} from "../src/verify-proof";

describe("Deploy proxy and logic contract", async function () {
    let deployer;
    let srcContract: SyncCandidate;
    let provider;

    it("Should deploy initial contract and set an initial value", async function () {
        [deployer] = await ethers.getSigners();
        const SyncCandidate = new SyncCandidate__factory(deployer);
        srcContract = await SyncCandidate.deploy();
        provider = new ethers.providers.JsonRpcProvider();
        const tx = await srcContract.setValueA(42);
        expect(await srcContract.getValueA()).to.be.equal(ethers.BigNumber.from(42));
    });

    it("Should port the source contract", async function () {

    })


})