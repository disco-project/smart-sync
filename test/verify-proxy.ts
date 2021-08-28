/* eslint-env mocha */
/* eslint-disable no-unused-expressions */
import { ethers, network } from 'hardhat';
import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { HttpNetworkConfig } from 'hardhat/types';
import { JsonRpcProvider } from '@ethersproject/providers';
import { SimpleStorage, SimpleStorage__factory } from '../src-gen/types';
import { verifyEthGetProof } from './test-utils';
import GetProof from '../src/proofHandler/GetProof';

describe('Verify State proof', () => {
    let deployer: SignerWithAddress;
    let storage: SimpleStorage;
    let provider: JsonRpcProvider;
    let httpConfig: HttpNetworkConfig;

    before(async () => {
        httpConfig = network.config as HttpNetworkConfig;
        provider = new ethers.providers.JsonRpcProvider(httpConfig.url);
        [deployer] = await ethers.getSigners();
    });

    it('Should deploy and return default values', async () => {
        const Storage = new SimpleStorage__factory(deployer);
        storage = await Storage.deploy();

        expect(await storage.getA()).to.equal(0);
        expect(await storage.getB()).to.equal(42);
        expect(await storage.getValue(deployer.address)).to.equal(0);
    });

    it('Should read correct storage after transactions', async () => {
        // assign a value to `a`
        const newValue = 1337;
        expect(await storage.setA(newValue)).to.exist;
        const keys = await provider.send('parity_listStorageKeys', [
            storage.address, 5, null,
        ]);
        // now there should be 2 storage keys
        expect(keys.length).to.equal(2);

        // `a` is the first field of the contract and its value is stored at slot 0
        const aValue = await provider.getStorageAt(storage.address, 0);
        expect(aValue).to.equal(ethers.BigNumber.from(newValue));
    });

    it('Should read correct mapping storage', async () => {
        const value = 1000;
        expect(await storage.setValue(value)).to.exist;
        const keys = await provider.send('parity_listStorageKeys', [
            storage.address, 5, null,
        ]);
        // after setting `a` and inserting a value in the mapping there should be 3 storage keys
        expect(keys.length).to.equal(3);
        const storageKey = ethers.BigNumber.from(keys[1]);

        // the `storageKey` of the `value` is the hash of the `key` of `value` in the mapping
        // concatenated with the slot of the mapping in the contract: `keccak256(key . slot)`
        const location = ethers.utils.hexConcat([
            ethers.utils.hexZeroPad(deployer.address, 32), ethers.utils.hexZeroPad('0x03', 32),
        ]);
        expect(ethers.utils.keccak256(location)).to.equal(keys[1]);

        const storedValue = await provider.getStorageAt(storage.address, storageKey);
        expect(ethers.BigNumber.from(storedValue).toNumber()).to.equal(value);
    });

    it('Should return a valid proof', async () => {
        const keys = await provider.send('parity_listStorageKeys', [
            storage.address, 5, null,
        ]);
        // [`eth_getProof`](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1186.md) implemented at
        // https://github.com/openethereum/openethereum/blob/27a0142af14730bcb50eeacc84043dc6f49395e8/rpc/src/v1/impls/eth.rs#L677
        const proof = <GetProof> await provider.send('eth_getProof', [storage.address, keys]);

        // get the latest block
        const block = await provider.send('eth_getBlockByNumber', ['latest', true]);

        // verify the proof against the block's state root
        expect(await verifyEthGetProof(proof, block.stateRoot)).to.be.true;
    });
});
