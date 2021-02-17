import {
    LogLogicContract__factory,
    LogLogicContract,
    LogProxyContract__factory,
    LogProxyContract,
} from "../src-gen/types";
import {ethers} from "hardhat";
import {expect} from "chai";

describe("Test log events on fallback", function () {
    let deployer;
    let logic: LogLogicContract;
    let proxy: LogProxyContract;
    const abi = [
        "function getValue() view returns (uint256)",
        "function setValue(uint256 value)",
        "function valuePure() public pure returns (uint256)"
    ];

    it("Should deploy the contracts", async function () {
        [deployer] = await ethers.getSigners();
        const Logic = new LogLogicContract__factory(deployer);
        logic = await Logic.deploy();
        const Proxy = new LogProxyContract__factory(deployer);
        proxy = await Proxy.deploy(logic.address);
    });

});
