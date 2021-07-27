import { ethers } from 'hardhat';
import { logger } from '../src/logger';
import { getAllKeys} from '../src/utils';

async function main () {
    const Mapper = await ethers.getContractFactory('MappingContract');
    const mapper = await Mapper.deploy();
    const provider = await new ethers.providers.JsonRpcProvider('http://localhost:8545');

    await mapper.deployed();

    for (let i = 0; i < 10; i++) {
        await mapper.insert(i, i + 1);
        const keys = await getAllKeys(mapper.address, provider);
        const proof = await provider.send("eth_getProof", [mapper.address, keys]);
        logger.info(proof.storageProof);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });