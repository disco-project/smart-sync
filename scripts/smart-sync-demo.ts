const ethers = require("ethers");
require("dotenv").config();
const DEPLOYED_CONTRACT_ADDRESS_GOERLI = process.env.DEPLOYED_CONTRACT_GOERLI
const DEPLOYED_CONTRACT_ADDRESS_MUMBAI = process.env.DEPLOYED_CONTRACT_MUMBAI

const goerliProvider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_GOERLI);
const polygonProvider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_MUMBAI);

const goerliSigner = new ethers.Wallet(process.env.PRIVATE_KEY, goerliProvider);
const polygonSigner = new ethers.Wallet(process.env.PRIVATE_KEY, polygonProvider);

const {abi, bytecode} = require("../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json");

const SimpleStorageGoerli = new ethers.ContractFactory(abi, bytecode, goerliSigner);
const SimpleStoragePolygon = new ethers.ContractFactory(abi, bytecode, polygonSigner);

async function main() {
    const simpleStorageGoerli = new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS_GOERLI,
        abi,
        goerliSigner
    );
    console.log((await simpleStorageGoerli.getA()).toString());

    const simpleStoragePolygon = new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS_MUMBAI,
        abi, 
        polygonSigner
    );
    console.log((await simpleStoragePolygon.getA()).toString());

    // the first variable stored by the contact is a
    // so it should be at index 0 in the storage.
    const newValue = 1337;
    const itemAtStorage = await polygonProvider.getStorageAt(simpleStoragePolygon.address, 0);
    console.log(itemAtStorage, await simpleStoragePolygon.getA())
    console.log(itemAtStorage._hex == await simpleStoragePolygon.getA()); // false because item at storage is padded
    console.log(ethers.BigNumber.from(itemAtStorage).toNumber() === newValue);

}

main();