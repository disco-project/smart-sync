/* eslint-disable no-await-in-loop */
import { ethers } from 'hardhat';
import { logger } from '../src/utils/logger';
import { getAllKeys } from '../src/utils/utils';

async function main() {
    const Mapper = await ethers.getContractFactory('MappingContract');
    const mapper = await Mapper.deploy();
    const provider = await new ethers.providers.JsonRpcProvider('http://localhost:8545');

    await mapper.deployed();
    logger.info(mapper.address);

    for (let i = 0; i < 10; i += 1) {
        await mapper.insert(i, i + 1);
        const keys = await getAllKeys(mapper.address, provider);
        const proof = await provider.send('eth_getProof', [mapper.address, keys]);
        logger.debug(proof.storageProof);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        logger.error(error);
        process.exit(1);
    });
