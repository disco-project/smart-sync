import { expect } from 'chai';
import { BaseTrie as Trie } from 'merkle-patricia-tree';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { BigNumber, ethers } from 'ethers';
import { SimpleStorage, SimpleStorage__factory } from '../src-gen/types';
import * as utils from '../src/utils/utils';
import GetProof from '../src/proofHandler/GetProof';
import { TxContractInteractionOptions } from '../src/cli/cross-chain-cli';
import FileHandler from '../src/utils/fileHandler';
import { TestCLI } from './test-utils';
import { logger } from '../src/utils/logger';

describe('Validate old contract state', () => {
    let deployer: SignerWithAddress;
    let storage: SimpleStorage;
    let chainConfigs: TxContractInteractionOptions | undefined;
    let provider: JsonRpcProvider;

    before(async () => {
        const fh = new FileHandler(TestCLI.defaultTestConfigFile);
        chainConfigs = fh.getJSON<TxContractInteractionOptions>();
        if (!chainConfigs) {
            logger.error(`No config available under ${TestCLI.defaultTestConfigFile}`);
            process.exit(-1);
        }
        provider = new ethers.providers.JsonRpcProvider({ url: chainConfigs.srcChainRpcUrl, timeout: BigNumber.from(chainConfigs.connectionTimeout).toNumber() });
        deployer = await SignerWithAddress.create(provider.getSigner());
        const Storage = new SimpleStorage__factory(deployer);
        storage = await Storage.deploy();
    });

    it('Should validate contract state proof', async () => {
        const oldValue = 1;

        await storage.setA(oldValue);

        let keys = await provider.send('parity_listStorageKeys', [
            storage.address, 10, null,
        ]);

        const oldProof = <GetProof> await provider.send('eth_getProof', [storage.address, keys]);

        await storage.setA(1337);

        keys = await provider.send('parity_listStorageKeys', [
            storage.address, 10, null,
        ]);

        const proof = <GetProof> await provider.send('eth_getProof', [storage.address, keys]);

        const trie = new Trie();

        await Promise.all(proof.storageProof.map(async (p) => {
            const storageKey = utils.hexStringToBuffer(ethers.utils.keccak256(ethers.utils.hexZeroPad(p.key, 32)));
            const val = p.value === '0x0' ? Buffer.from([]) : utils.hexStringToBuffer(ethers.BigNumber.from(p.value).toHexString());
            await trie.put(
                storageKey,
                utils.encode(val),
            );
        }));

        expect(proof.storageHash).to.be.equal(`0x${trie.root.toString('hex')}`);

        // reset to old value
        await trie.put(
            utils.hexStringToBuffer(ethers.utils.keccak256(ethers.utils.hexZeroPad('0x0', 32))),
            utils.encode(utils.hexStringToBuffer(ethers.BigNumber.from(oldValue).toHexString())),
        );

        expect(oldProof.storageHash).to.be.equal(`0x${trie.root.toString('hex')}`);
    });
});
