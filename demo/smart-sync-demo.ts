import { ethers } from 'ethers';
import { logger } from '../src/utils/logger';

require('dotenv').config();

logger.setSettings({ minLevel: 'info', name: 'demo' });

const { PRIVATE_KEY, DEPLOYED_CONTRACT_ADDRESS_GOERLI, DEPLOYED_CONTRACT_ADDRESS_MUMBAI, RPC_URL_GOERLI, RPC_URL_MUMBAI } = process.env;

const goerliProvider = new ethers.providers.JsonRpcProvider(RPC_URL_GOERLI);
const polygonProvider = new ethers.providers.JsonRpcProvider(RPC_URL_MUMBAI);

const goerliSigner = new ethers.Wallet(PRIVATE_KEY as string, goerliProvider);
const polygonSigner = new ethers.Wallet(PRIVATE_KEY as string, polygonProvider);

const { abi, bytecode } = require('../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json');

async function main() {
    const simpleStorageGoerli = new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS_GOERLI as string,
        abi,
        goerliSigner,
    );
    const a = await simpleStorageGoerli.getA();
    logger.info(a);

    const simpleStoragePolygon = new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS_MUMBAI as string,
        abi,
        polygonSigner,
    );
    const aPolygon = await simpleStoragePolygon.getA();
    logger.info(aPolygon);

    // the first variable stored by the contact is a
    // so it should be at index 0 in the storage.
    const newValue = 1337;
    const itemAtStorage = await polygonProvider.getStorageAt(simpleStoragePolygon.address, 0);
    logger.info(itemAtStorage, await simpleStoragePolygon.getA());

    // eslint-disable-next-line no-underscore-dangle
    logger.info(itemAtStorage._hex === await simpleStoragePolygon.getA()); // false because item at storage is padded
    logger.info(ethers.BigNumber.from(itemAtStorage).toNumber() === newValue);
}

main();
