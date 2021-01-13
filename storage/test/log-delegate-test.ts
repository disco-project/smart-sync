import {
    CallingContract,
    CallingContract__factory,
    LogLogicContract,
    LogLogicContract__factory,
    LogProxyContract,
    LogProxyContract__factory
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
            // try to set the value which should fail
            await contract.setValue(2);
        } catch (error) {
            // ignore error
        }
        // validate that the setValue did not succeed and the contract variable still has its old value
        expect(await contract.getValue()).to.equal(37)
    });

    it("Should not delegate set call through calling contract", async function () {
        let contract = new ethers.Contract(caller.address, abi, deployer);
        try {
            await contract.setValue(2);
        } catch (error) {
            // ignore error
        }
        expect(await contract.getValue()).to.equal(37)
    });

    it("Should allow delegation of pure functions through the proxy", async function () {
        let contract = new ethers.Contract(proxy.address, abi, deployer);
        expect(await contract.valuePure()).to.equal(42)
    });
});
