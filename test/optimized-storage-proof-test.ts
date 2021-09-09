import { ethers, network } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { HttpNetworkConfig } from 'hardhat/types';
import { logger } from '../src/utils/logger';
import { SimpleStorage, SimpleStorage__factory } from '../src-gen/types';
import GetProof from '../src/proofHandler/GetProof';

describe('Test storage proof optimization', async () => {
    let deployer: SignerWithAddress;
    let storage: SimpleStorage;
    let provider: JsonRpcProvider;
    let httpConfig: HttpNetworkConfig;

    before(async () => {
        httpConfig = network.config as HttpNetworkConfig;
        [deployer] = await ethers.getSigners();
        const Storage = new SimpleStorage__factory(deployer);
        storage = await Storage.deploy();
        provider = new ethers.providers.JsonRpcProvider(httpConfig.url);
        logger.setSettings({ minLevel: 'info', name: 'optimized-storage-proof-test.ts' });
    });

    it('Should insert some mappings and create a nested optimized proof', async () => {
        const inserts: any = [];
        for (let i = 0; i < 10; i += 1) {
            // get some random keys
            const entry = { key: Math.floor(Math.random() * Math.floor(1000)), value: i };
            inserts.push(storage.insert(entry.key, entry.value));
        }
        await Promise.all(inserts);

        const keys = await provider.send('parity_listStorageKeys', [
            storage.address, 100, null,
        ]);

        const proof = new GetProof(await provider.send('eth_getProof', [storage.address, keys]));
        proof.optimizedStorageProof();
    });
});
