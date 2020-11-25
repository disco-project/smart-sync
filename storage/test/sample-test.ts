import {ethers} from "hardhat";
import {expect} from "chai";
import {Greeter, Greeter__factory,} from "../src-gen/types";

describe("Greeter", function () {
    let deployer;
    it("Should return the new greeting once it's changed", async function () {
        [deployer] = await ethers.getSigners();
        const Greeter = new Greeter__factory(deployer);
        const greeter = await Greeter.deploy("Hello, world!");

        await greeter.deployed();
        expect(await greeter.greet()).to.equal("Hello, world!");

        await greeter.setGreeting("Hola, mundo!");
        expect(await greeter.greet()).to.equal("Hola, mundo!");
    });
});
