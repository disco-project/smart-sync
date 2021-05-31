import {SimpleStorage, SimpleStorage__factory,} from "../src-gen/types";
import {ethers, network} from "hardhat";
import {expect} from "chai";
import {StorageDiffer} from "../src/get-diff";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { HttpNetworkConfig } from "hardhat/types";

describe("Get contract storage diff", function () {
    let deployer: SignerWithAddress;
    let storageSrc: SimpleStorage;
    let storageTarget: SimpleStorage;
    let differ: StorageDiffer;
    let provider: JsonRpcProvider;
    let httpConfig: HttpNetworkConfig;

    before(async () => {
        httpConfig = network.config as HttpNetworkConfig;
        provider = new ethers.providers.JsonRpcProvider(httpConfig.url);
    });

    it("Should deploy contracts", async function () {
        [deployer] = await ethers.getSigners();
        differ = new StorageDiffer();
        const Storage = new SimpleStorage__factory(deployer);
        storageSrc = await Storage.deploy();
        storageTarget = await Storage.deploy();

        expect(storageSrc.address).to.not.equal(storageTarget.address);
    });

    it("Should get an empty diff for same contract", async function () {
        const diff = await differ.getDiff(storageSrc.address);
        expect(diff.isEmpty()).to.be.true;
    });

    it("Should get a single additional key in diff after setting a value", async function () {
        // set value at storage slot 0
        const tx = await storageSrc.setA(1337);
        const blockNum = tx.blockNumber ?? await provider.getBlockNumber();
        // compare the second latest block against the block
        // that includes the tx that set the value of storage key 0
        let diff = await differ.getDiff(storageSrc.address, blockNum - 1);
        // the diff includes an additional key
        expect(diff.diffs.length).to.equal(1);
        const adds = diff.adds();
        expect(adds.length).to.equal(1);
        expect(ethers.BigNumber.from(adds[0].key)).to.equal(ethers.BigNumber.from(0));

        // comparing the latest block against the second latest ('latest' - 1)
        // results in a diff with a removed key
        diff = await differ.getDiff(storageSrc.address, "latest", blockNum - 1);
        expect(diff.diffs.length).to.equal(1);
        const removes = diff.removes();
        expect(removes.length).to.equal(1);
        expect(ethers.BigNumber.from(removes[0].key)).to.equal(ethers.BigNumber.from(0));
    });

    it("Should get a single changed key in diff after changing a value in the same contract", async function () {
        const tx = await storageSrc.setA(42);
        const blockNum = tx.blockNumber ?? await provider.getBlockNumber();

        let diff = await differ.getDiff(storageSrc.address, blockNum - 1);
        expect(diff.diffs.length).to.equal(1);
        const changed = diff.changes();
        expect(changed.length).to.equal(1);
        expect(ethers.BigNumber.from(changed[0].key)).to.equal(ethers.BigNumber.from(0));

        // value was changed from 1337 to 42, so the srcValue represents the old value...
        expect(ethers.BigNumber.from(changed[0].srcValue)).to.equal(ethers.BigNumber.from(1337));

        // ...and the target value the new value
        expect(ethers.BigNumber.from(changed[0].targetValue)).to.equal(ethers.BigNumber.from(42));
    });

    it("Should get correct diff between different contracts", async function () {
        await storageTarget.setA(42);
        // state of both contracts is now identical for the latest block
        let diff = await differ.getDiff(storageSrc.address, storageTarget.address);
        expect(diff.isEmpty()).to.be.true;

        // changing each value in both contracts results in a single diff
        await storageSrc.setA(1337);
        await storageTarget.setA(9000);

        diff = await differ.getDiff(storageSrc.address, storageTarget.address);
        expect(diff.diffs.length).to.equal(1);
        const changed = diff.changes();
        expect(changed.length).to.equal(1);
        expect(ethers.BigNumber.from(changed[0].key)).to.equal(ethers.BigNumber.from(0));

        expect(ethers.BigNumber.from(changed[0].srcValue)).to.equal(ethers.BigNumber.from(1337));

        expect(ethers.BigNumber.from(changed[0].targetValue)).to.equal(ethers.BigNumber.from(9000));
    })
});
