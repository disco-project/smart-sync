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

    it("Should delegate view call", async function () {
        let contract = new ethers.Contract(caller.address, abi, deployer);
        await contract.getValue();
 
    });

    it("Should not delegate set call through contract", async function () {
        let contract = new ethers.Contract(caller.address, abi, deployer);
        //await expect(await contract.setValue(2)).to.be.reverted;
        return contract.setValue(2, {gasLimit: 200000})
            .then(async () => {
                expect(await contract.getValue()).to.equal("37");
            });
    });

    it("Should not delegate set call", async function () {
        let contract = new ethers.Contract(proxy.address, abi, deployer);
        return contract.setValue(2, {gasLimit: 200000})
            .then(async (receipt, error) => {
                console.log(error);
                expect(await contract.getValue()).to.equal("37");
            });
    });

});
