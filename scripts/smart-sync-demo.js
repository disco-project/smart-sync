const ethers = require("ethers");
require("dotenv").config();

const goerliProvider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_GOERLI);
const polygonProvider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_MUMBAI);

const goerliSigner = new ethers.Wallet(process.env.PRIVATE_KEY, goerliProvider);
const polygonSigner = new ethers.Wallet(process.env.PRIVATE_KEY, polygonProvider);
// const { SimpleStorage, SimpleStorage__factory } = require('../src-gen/types');

const {abi, bytecode} = require("../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json");

const SimpleStorageGoerli = new ethers.ContractFactory(abi, bytecode, goerliSigner);
const SimpleStoragePolygon = new ethers.ContractFactory(abi, bytecode, polygonSigner);

async function main() {
    const simpleStorageGoerli = await SimpleStorageGoerli.deploy();
    await simpleStorageGoerli.deployed();
    const simpleStorageGoerliAddress = simpleStorageGoerli.address;

    console.log(`Deployed Goerli contract at: ${simpleStorageGoerliAddress}`);
    // console.log(simpleStorageGoerli.deployTransaction);

    // console.log(await simpleStorageGoerli.getA())

    const simpleStoragePolygon = await SimpleStoragePolygon.deploy();
    await simpleStoragePolygon.deployed();
    const simpleStoragePolygonAddress = simpleStoragePolygon.address;
    console.log(`Deployed Polygon Mumbai contract at: ${simpleStoragePolygonAddress}`);

    const newValue = 1337;
    await (await simpleStoragePolygon.setA(newValue)).wait();
    const location = ethers.utils.hexConcat([
        ethers.utils.hexZeroPad(polygonSigner.address, 32), 
        ethers.utils.hexZeroPad('0x02', 32),
    ]);
    const storageKey = ethers.BigNumber.from(ethers.utils.keccak256(location));
    const storedValue = await polygonProvider.getStorageAt(
        simpleStoragePolygon.address, 
        storageKey
    );
    console.log(ethers.BigNumber.from(storedValue).toNumber());
}

main();

