import {RlpTestContract, RlpTestContract__factory,} from "../src-gen/types";
import {ethers} from "hardhat";
import * as rlp from "rlp";
import {expect} from "chai";

describe("Test solidty rlp encoding decoding", function () {
    let deployer;
    let contract: RlpTestContract;

    it("Should encode and decode values", async function () {
        [deployer] = await ethers.getSigners();
        const Rlp = new RlpTestContract__factory(deployer);
        contract = await Rlp.deploy();

        let buf = Buffer.from([42]);
        let encoded = await contract.encodeBytes(buf);
        expect(encoded).to.equal("0x" + rlp.encode(buf).toString("hex"));

        let list = [Buffer.from([42]), Buffer.from([37])];
        encoded = await contract.encodeList(list);
        expect(encoded).to.equal("0x" + rlp.encode(list).toString("hex"));
    });

    it("Should encode Merkle leaf", async function () {
        const key = Buffer.from("20b10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf6", "hex");
        const value = Buffer.from([42]);
        const encoded = await contract.encodeList([rlp.encode(key), rlp.encode(value)]);

        expect(encoded).to.equal("0x" + rlp.encode([key, value]).toString("hex"));
    })

});
