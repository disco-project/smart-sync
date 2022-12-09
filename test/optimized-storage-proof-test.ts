import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { BigNumber, ethers } from 'ethers';
import { logger } from '../src/utils/logger';
import { SimpleStorage, SimpleStorage__factory } from '../src-gen/types';
import GetProof from '../src/proofHandler/GetProof';
import { TxContractInteractionOptions } from '../src/cli/smart-sync';
import FileHandler from '../src/utils/fileHandler';
import { TestCLI } from './test-utils';

describe('Test storage proof optimization', async () => {
    let deployer: SignerWithAddress;
    let storage: SimpleStorage;
    let provider: JsonRpcProvider;
    let chainConfigs: TxContractInteractionOptions | undefined;

    before(async () => {
        const fh = new FileHandler(TestCLI.defaultTestConfigFile);
        chainConfigs = fh.getJSON<TxContractInteractionOptions>();
        if (!chainConfigs) {
            logger.error(`No config available under ${TestCLI.defaultTestConfigFile}`);
            process.exit(-1);
        }
        provider = new ethers.providers.JsonRpcProvider({ url: chainConfigs.srcChainRpcUrl, timeout: BigNumber.from(chainConfigs.connectionTimeout).toNumber() });
        deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider); // await SignerWithAddress.create(provider.getSigner());
        const Storage = new SimpleStorage__factory(deployer);
        storage = await Storage.deploy();
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
        await proof.optimizedStorageProof([]);
    });
});
