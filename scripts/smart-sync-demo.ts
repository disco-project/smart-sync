const ethers = require("ethers");
require("dotenv").config();

const goerliProvider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_GOERLI);
const polygonProvider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_MUMBAI);

const goerliSigner = new ethers.Wallet(process.env.PRIVATE_KEY, goerliProvider);
const polygonSigner = new ethers.Wallet(process.env.PRIVATE_KEY, polygonProvider);

const {abi, bytecode} = require("../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json");

const SimpleStorageGoerli = new ethers.ContractFactory(abi, bytecode, goerliSigner);
const SimpleStoragePolygon = new ethers.ContractFactory(abi, bytecode, polygonSigner);

async function main() {
    // Goerli
    // const simpleStorageGoerli = await SimpleStorageGoerli.deploy();
    // await simpleStorageGoerli.deployed();
    // const simpleStorageGoerliAddress = simpleStorageGoerli.address;
    // console.log(simpleStorageGoerli.deployTransaction);
    // console.log(await simpleStorageGoerli.getA())
    // console.log(`Deployed Goerli contract at: ${simpleStorageGoerliAddress}`);
    const goerliAddress = '0x7d57C196D527C50d4E975300EB802F2b6f219559';
    const simpleStorageGoerli = new ethers.Contract(
        goerliAddress,
        abi,
        goerliSigner
    );
    console.log((await simpleStorageGoerli.getA()).toString());

    // Polygon
    // const simpleStoragePolygon = await SimpleStoragePolygon.deploy();
    // await simpleStoragePolygon.deployed();
    // const simpleStoragePolygonAddress = simpleStoragePolygon.address;
    // console.log(`Deployed Polygon Mumbai contract at: ${simpleStoragePolygonAddress}`);
    const newValue = 1337;
    // await (await simpleStoragePolygon.setA(newValue)).wait();
    const polygonAddress = '0x1350463D86472B4BbBfcD4936807168df93Ea639';
    const simpleStoragePolygon = new ethers.Contract(
        polygonAddress,
        abi, 
        polygonSigner
    );
    console.log((await simpleStoragePolygon.getA()).toString());

    // the first variable stored by the contact is a
    // so it should be at index 0 in the storage.
    const itemAtStorage = await polygonProvider.getStorageAt(simpleStoragePolygon.address, 0);
    console.log(itemAtStorage, await simpleStoragePolygon.getA())
    console.log(itemAtStorage._hex == await simpleStoragePolygon.getA()); // false because item at storage is padded
    console.log(ethers.BigNumber.from(itemAtStorage).toNumber() === newValue);

}

main();