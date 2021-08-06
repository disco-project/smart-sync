import {
    CallingContract,
    CallingContract__factory,
    TestLogicContract,
    TestLogicContract__factory,
    TestProxyContract,
    TestProxyContract__factory
} from "../src-gen/types";
import {ethers, network} from "hardhat";
import {expect} from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { HttpNetworkConfig } from "hardhat/types";

describe("Test static proxy calls", function () {
    let deployer: SignerWithAddress;
    let logic: TestLogicContract;
    let proxy: TestProxyContract;
    let caller: CallingContract;
    
    const abi = [
        "function getValue() view returns (uint256)",
        "function setValue(uint256 value)",
        "function valuePure() public pure returns (uint256)"
    ];

    it("Should deploy the contracts", async function () {
        let httpConfig = network.config as HttpNetworkConfig;
        let provider = new ethers.providers.JsonRpcProvider(httpConfig.url);
        deployer = await SignerWithAddress.create(provider.getSigner());
        const Logic = new TestLogicContract__factory(deployer);
        logic = await Logic.deploy();
        const Proxy = new TestProxyContract__factory(deployer);
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
