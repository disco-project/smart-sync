import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { BigNumber, ethers } from 'ethers';
import DiffHandler from '../src/diffHandler/DiffHandler';
import { SimpleStorage, SimpleStorage__factory } from '../src-gen/types';
import { logger } from '../src/utils/logger';
import { TxContractInteractionOptions } from '../src/cli/cross-chain-cli';
import FileHandler from '../src/utils/fileHandler';
import { TestCLI } from './test-utils';

describe('Get contract storage diff', () => {
    let deployer: SignerWithAddress;
    let storageSrc: SimpleStorage;
    let storageTarget: SimpleStorage;
    let differ: DiffHandler;
    let provider: JsonRpcProvider;
    let chainConfigs: TxContractInteractionOptions | undefined;

    before(async () => {
        const fh = new FileHandler(TestCLI.defaultTestConfigFile);
        chainConfigs = fh.getJSON<TxContractInteractionOptions>();
        if (!chainConfigs) {
            logger.error(`No config available under ${TestCLI.defaultTestConfigFile}`);
            process.exit(-1);
        }
        provider = new ethers.providers.JsonRpcProvider({ url: chainConfigs.srcChainUrl, timeout: BigNumber.from(chainConfigs.connectionTimeout).toNumber() });
        deployer = await SignerWithAddress.create(provider.getSigner());
        logger.setSettings({ minLevel: 'info', name: 'get-diff-test.ts' });
    });

    beforeEach(async () => {
        differ = new DiffHandler(provider);
        const Storage = new SimpleStorage__factory(deployer);
        storageSrc = await Storage.deploy();
        storageTarget = await Storage.deploy();

        expect(storageSrc.address).to.not.equal(storageTarget.address);
    });

    it('Should get an empty diff for same contract with getDiffFromStorage', async () => {
        const diff = await differ.getDiffFromStorage(storageSrc.address);
        expect(diff.isEmpty()).to.be.true;
    });

    it('Should get a single additional key in diff.getDiffFromStorage after setting a value', async () => {
    // set value at storage slot 0
        const tx = await storageSrc.setA(1337);
        const blockNum = tx.blockNumber ?? await provider.getBlockNumber();
        // compare the second latest block against the block
        // that includes the tx that set the value of storage key 0
        let diff = await differ.getDiffFromStorage(storageSrc.address, storageSrc.address, 'latest', blockNum - 1);
        // the diff includes an additional key
        expect(diff.diffs.length).to.equal(1);
        const adds = diff.adds();
        expect(adds.length).to.equal(1);
        expect(ethers.BigNumber.from(adds[0].key)).to.equal(ethers.BigNumber.from(0));

        // comparing the latest block against the second latest ('latest' - 1)
        // results in a diff with a removed key
        diff = await differ.getDiffFromStorage(storageSrc.address, storageSrc.address, blockNum - 1, 'latest');
        expect(diff.diffs.length).to.equal(1);
        const removes = diff.removes();
        expect(removes.length).to.equal(1);
        expect(ethers.BigNumber.from(removes[0].key)).to.equal(ethers.BigNumber.from(0));
    });

    it('Should get a single additional key in diff.getDiffFromSrcContractTxs after setting a value', async () => {
    // set value at storage slot 0
        let tx = await storageSrc.setA(1337);
        let blockNum = tx.blockNumber ?? await provider.getBlockNumber();
        // check for changes in srcContract tx
        let diff = await differ.getDiffFromSrcContractTxs(storageSrc.address, blockNum, blockNum);
        // the diff includes an additional key
        expect(diff.diffs.length).to.equal(1);
        const adds = diff.adds();
        expect(adds.length).to.equal(1);
        expect(ethers.BigNumber.from(adds[0].key)).to.equal(ethers.BigNumber.from(0));

        // cannot differentiate between add, change and remove
        tx = await storageSrc.setA(0x0);
        blockNum = tx.blockNumber ?? await provider.getBlockNumber();
        // results in a diff with a removed key
        diff = await differ.getDiffFromSrcContractTxs(storageSrc.address, blockNum, blockNum);
        expect(diff.diffs.length).to.equal(1);
        const removes = diff.removes();
        expect(removes.length).to.equal(1);
        expect(ethers.BigNumber.from(removes[0].key)).to.equal(ethers.BigNumber.from(0));
    });

    it('Should get a single changed key in diff.getDiffFromStorage after changing a value in the same contract', async () => {
    // set value at storage slot 0
        await storageSrc.setA(1337);
        const tx = await storageSrc.setA(42);
        const blockNum = tx.blockNumber ?? await provider.getBlockNumber();

        const diff = await differ.getDiffFromStorage(storageSrc.address, storageSrc.address, blockNum - 1);
        expect(diff.diffs.length).to.equal(1);
        const changed = diff.changes();
        expect(changed.length).to.equal(1);
        expect(ethers.BigNumber.from(changed[0].key)).to.equal(ethers.BigNumber.from(0));

        // value was changed from 1337 to 42, so the srcValue represents the old value...
        expect(ethers.BigNumber.from(changed[0].srcValue)).to.equal(ethers.BigNumber.from(1337));

        // ...and the target value the new value
        expect(ethers.BigNumber.from(changed[0].targetValue)).to.equal(ethers.BigNumber.from(42));
    });

    it('Should get a single changed key in diff.getDiffFromSrcContractTxs after changing a value in the same contract', async () => {
    // set value at storage slot 0
        await storageSrc.setA(1337);
        const tx = await storageSrc.setA(42);
        const blockNum = tx.blockNumber ?? await provider.getBlockNumber();

        const diff = await differ.getDiffFromSrcContractTxs(storageSrc.address, blockNum, blockNum);
        expect(diff.diffs.length).to.equal(1);
        const changed = diff.changes();
        expect(changed.length).to.equal(1);
        expect(ethers.BigNumber.from(changed[0].key)).to.equal(ethers.BigNumber.from(0));
    });

    it('Should get correct diff.getDiffFromStorage between different contracts', async () => {
        await storageSrc.setA(42);
        await storageTarget.setA(42);
        // state of both contracts is now identical for the latest block
        let diff = await differ.getDiffFromStorage(storageSrc.address, storageTarget.address, 'latest');
        expect(diff.isEmpty()).to.be.true;

        // changing each value in both contracts results in a single diff
        await storageSrc.setA(1337);
        await storageTarget.setA(9000);

        diff = await differ.getDiffFromStorage(storageSrc.address, storageTarget.address, 'latest');
        expect(diff.diffs.length).to.equal(1);
        const changed = diff.changes();
        expect(changed.length).to.equal(1);
        expect(ethers.BigNumber.from(changed[0].key)).to.equal(ethers.BigNumber.from(0));

        expect(ethers.BigNumber.from(changed[0].srcValue)).to.equal(ethers.BigNumber.from(1337));

        expect(ethers.BigNumber.from(changed[0].targetValue)).to.equal(ethers.BigNumber.from(9000));
    });

    it('Should get all new changes through getDiffFromSrcBlockTxs', async () => {
    // insert some values to fill the contract
        const inserts: any = [];
        for (let i = 0; i < 10; i += 1) {
            inserts.push(storageSrc.insert(i, 20));
        }
        await Promise.all(inserts);
        const currBlockNr = await provider.getBlockNumber() + 1;
        // change some of those values
        const changes: any = [];
        for (let i = 0; i < 5; i += 1) {
            changes.push(storageSrc.insert(i, 30));
        }
        await Promise.all(changes);

        const diff = await differ.getDiffFromSrcContractTxs(storageSrc.address, 'latest', currBlockNr);
        expect(diff.diffs.length).to.equal(5);
        const changed = diff.changes();
        expect(changed.length).to.equal(5);
    });
});
