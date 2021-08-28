/* eslint-env mocha */
/* eslint-disable no-unused-expressions */
import { ethers, network } from 'hardhat';
import { expect } from 'chai';
import { BaseTrie as Trie } from 'merkle-patricia-tree';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { HttpNetworkConfig } from 'hardhat/types';
import { JsonRpcProvider } from '@ethersproject/providers';
import { SimpleStorage, SimpleStorage__factory } from '../src-gen/types';
import * as utils from '../src/utils/utils';
import GetProof from '../src/proofHandler/GetProof';

describe('Validate old contract state', () => {
    let deployer: SignerWithAddress;
    let storage: SimpleStorage;
    let httpConfig: HttpNetworkConfig;
    let provider: JsonRpcProvider;

    before(async () => {
        httpConfig = network.config as HttpNetworkConfig;
        provider = new ethers.providers.JsonRpcProvider(httpConfig.url);
        [deployer] = await ethers.getSigners();
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
