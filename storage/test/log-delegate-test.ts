import {
    LogLogicContract__factory,
    LogLogicContract,
    LogProxyContract__factory,
    LogProxyContract,
    CallingContract__factory,
    CallingContract
} from "../src-gen/types";
import {ethers} from "hardhat";
import {expect} from "chai";

describe("Test log events on fallback", function () {
    let deployer;
    let logic: LogLogicContract;
    let proxy: LogProxyContract;
    let caller: CallingContract;
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
        const Caller = new CallingContract__factory(deployer);
        caller = await Caller.deploy(proxy.address);
    });

    it("Should not delegate set call through proxy contract", async function () {
        let contract = new ethers.Contract(proxy.address, abi, deployer);
        try {
            await contract.setValue(2);
        } catch (error) {
            // ignore exception
        }
        expect(await contract.getValue()).to.equal(37)
    });
});
