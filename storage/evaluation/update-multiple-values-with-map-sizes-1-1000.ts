import {RelayContract__factory, MappingContract, MappingContract__factory, SyncCandidate__factory, CallRelayContract__factory, CallRelayContract, SimpleStorage, SimpleStorage__factory} from "../src-gen/types";
import {ethers} from "hardhat";
import {expect} from "chai";
import {GetProof, encodeBlockHeader} from "../src/verify-proof";
import {getAllKeys} from "../src/utils";
import {StorageDiffer} from "../src/get-diff";
import {DeployProxy} from "../src/deploy-proxy";
import {PROXY_INTERFACE} from "../src/config";
import {Contract} from "ethers";
import { logger } from "../src/logger"
const rlp = require('rlp');
import Web3 from 'web3';
import stringify from 'csv-stringify';
import fs, { write } from 'fs';
import { ChildProcess, exec, spawn } from "child_process";

const KEY_VALUE_PAIR_PER_BATCH = 100;
const MAX_CHANGED_VALUES = 100;

function hex_to_ascii(str1) {
    var hex  = str1.toString();
    var str = '';
    for (var n = 0; n < hex.length; n += 2) {
        str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));
    }
    return str;
}

describe("Test scaling of contract", async function () {
    let deployer;
    let srcContract: MappingContract;
    let logicContract: MappingContract;
    let factory: MappingContract__factory;
    let provider;
    let relayContract;
    let encodedProof;
    let latestBlock;
    let proxyContract: Contract;
    let callRelayContract: CallRelayContract;
    let storageRoot;
    let csv_data: Array<{ 
        map_size: number,
        changed_value_count: number, 
        max_mpt_depth: number, 
        used_gas: number
    }> = [];
    let openethereumChildProcess: ChildProcess;

    before(() => {
        logger.setSettings({minLevel: 'info', name: 'evaluation.ts'});
    });

    after(async () => {
        return new Promise(resolve => {
            let time = new Date().getTime();
            const writeStream = fs.createWriteStream(`./evaluation/csv-files/${time}_measurements-multiple-values-with-map-sizes-1-to-1000.csv`);
            const csvStringifier = stringify(csv_data, { header: true });
    
            csvStringifier.on('end', () => {
                writeStream.end();
                resolve();
            });
            csvStringifier.pipe(writeStream);
        });
    });

    beforeEach(async () => {
        [deployer] = await ethers.getSigners();
        factory = new MappingContract__factory(deployer);
        srcContract = await factory.deploy();
        logicContract = await factory.deploy();
        // deploy the relay contract
        const Relayer = new RelayContract__factory(deployer);
        relayContract = await Relayer.deploy();
        provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
    });

    afterEach(async () => {
    });

    it("Contract with map containing 10 values, update multiple values per iteration", async function() {
        const map_size = 10;
        // insert some random values
        let srcKeys: Array<number> = [];
        let srcValues: Array<number> = [];
        let allValues: Array<number> = [];
        let srcCounter: number = 0;
        for (let i = 0; i < map_size; i++) {
            const value = Math.floor(Math.random() * 10000000);
            srcKeys.push(i);
            srcValues.push(value);
            allValues.push(value);
            srcCounter++;
            if (srcCounter >= KEY_VALUE_PAIR_PER_BATCH) {
                await srcContract.insertMultiple(srcKeys, srcValues);
                srcValues = [];
                srcKeys = [];
                srcCounter = 0;
            } 
        }
        if (srcCounter !== 0) await srcContract.insertMultiple(srcKeys, srcValues);

        let keys = await getAllKeys(srcContract.address, provider);
        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);
        // create a proof of the source contract's storage
        let proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]));
        encodedProof = await proof.encoded(latestBlock.stateRoot);

        // getting depth of mpt
        let max_mpt_depth = 0;
        proof.storageProof.forEach((storageProof) => {
            if (max_mpt_depth < storageProof.proof.length) max_mpt_depth = storageProof.proof.length;
        });

        storageRoot = proof.storageHash;

        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        const compiledProxy = await DeployProxy.compiledAbiAndBytecode(relayContract.address, logicContract.address, srcContract.address);

        // deploy the proxy with the state of the `srcContract`
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);

        proxyContract = await proxyFactory.deploy();

        // migrate storage
        logger.debug('migrating storage');
        let proxykeys: Array<String> = [];
        let proxyValues: Array<String> = [];
        for (const storageProof of proof.storageProof) {
            proxykeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
            if (proxykeys.length >= KEY_VALUE_PAIR_PER_BATCH) {
                await proxyContract.addStorage(proxykeys, proxyValues, { gasLimit: 80000000 });
                proxykeys = [];
                proxyValues = [];
            }
        }
        if (proxykeys.length != 0) await proxyContract.addStorage(proxykeys, proxyValues, { gasLimit: 80000000 });
        logger.debug('done.');

        // validate migration
        //  getting account proof from source contract
        const sourceAccountProof = await proof.optimizedProof(latestBlock.stateRoot, false);

        //  getting account proof from proxy contract
        const proxyProvider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
        const latestProxyChainBlock = await proxyProvider.send('eth_getBlockByNumber', ["latest", false]);
        const proxyChainProof = new GetProof(await proxyProvider.send("eth_getProof", [proxyContract.address, []]));
        const proxyAccountProof = await proxyChainProof.optimizedProof(latestProxyChainBlock.stateRoot, false);

        //  getting encoded block header
        const encodedBlockHeader = encodeBlockHeader(latestProxyChainBlock);

        // need to use web3 here as hardhat/ethers mine another block before actually executing the method on the bc.
        // therefore, block.number - 1 in the function verifyMigrateContract doesn't work anymore.
        const web3 = new Web3('http://localhost:8545');
        const contractInstance = new web3.eth.Contract(compiledProxy.abi, proxyContract.address);
        await contractInstance.methods.verifyMigrateContract(sourceAccountProof, proxyAccountProof, encodedBlockHeader).send({
            from: '0x00ce0c25d2a45e2f22d4416606d928b8c088f8db'
        });

        //  validating
        const migrationValidated = await relayContract.getMigrationState(proxyContract.address);
        expect(migrationValidated).to.be.true;

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        let differ = new StorageDiffer(provider);
        let diff = await differ.getDiff(srcContract.address, proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        for (let i = 1; i < map_size; i++) {
            // always change deepest values first
            let currHeight = max_mpt_depth;
            const value_count = i + 1;
            let valueIndices: Array<number> = [];
            let proofIndices: Array<number> = [];
            let proxyKeys: Array<number> = [];
            let proxyValues: Array<number> = [];
            while (valueIndices.length < value_count) {
                // get a new value
                const proofIndex = proof.storageProof.findIndex((storageProof, index) => {
                    return storageProof.proof.length === currHeight && proofIndices.indexOf(index) === -1;
                });
                if (proofIndex === -1) {
                    // if all values from currHeight already in our array, go one level closer to root
                    currHeight--;
                    continue;
                }
                proofIndices.push(proofIndex);
                const valueIndex = allValues.findIndex((value) => {
                    return ethers.BigNumber.from(proof.storageProof[proofIndex].value).toHexString() === ethers.BigNumber.from(value).toHexString();
                });
                const value = Math.floor(Math.random() * 10000000);
                valueIndices.push(valueIndex)
                proxyKeys.push(valueIndex);
                proxyValues.push(value);
                // change previous synced value in batches
                if (proxyKeys.length >= KEY_VALUE_PAIR_PER_BATCH) {
                    await srcContract.insertMultiple(proxyKeys, proxyValues, { gasLimit: 80000000 });
                    proxykeys = [];
                    proxyValues = [];
                }
            }
            if (proxyKeys.length !== 0) await srcContract.insertMultiple(proxyKeys, proxyValues);

            // get the diff set, the storage keys for the changed values
            diff = await differ.getDiff(srcContract.address, proxyContract.address);
            const changedKeys = diff.diffs.map(c => c.key);

            latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

            // create a proof of the source contract's storage for all the changed keys
            let changedKeysProof = new GetProof(await provider.send("eth_getProof", [srcContract.address, changedKeys]));

            // get depth of value
            let value_mpt_depth = 0;
            changedKeysProof.storageProof.forEach((storageProof) => {
                if (value_mpt_depth < storageProof.proof.length) value_mpt_depth = storageProof.proof.length;
            });

            // compute the optimized storage proof
            const rlpOptimized = changedKeysProof.optimizedStorageProof();

            // ensure that the old contract state equals the last synced storage hash
            try {
                const validated = await proxyContract.verifyOldContractStateProof(rlpOptimized, { gasLimit: 80000000 });
                expect(validated).to.be.true;
            } catch(e) {
                logger.error('something went wrong');
                const regexr = new RegExp(/Reverted 0x(.*)/);
                const checker = regexr.exec(e.data);
                if (checker) {
                    logger.error(`'${hex_to_ascii(checker[1])}'`);
                    logger.fatal(e);
                }
                else logger.fatal(e);
            }

            const rlpProof = await changedKeysProof.optimizedProof(latestBlock.stateRoot);
            await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

            // update the proxy storage
            let txResponse;
            let receipt;
            try {
                txResponse = await proxyContract.updateStorage(rlpProof, { gasLimit: 80000000 });
                receipt = await txResponse.wait();
            } catch (e) {
                logger.error('something went wrong');
                const regexr = new RegExp(/Reverted 0x(.*)/);
                const checker = regexr.exec(e.data);
                if (checker) {
                    logger.error(`'${hex_to_ascii(checker[1])}'`);
                    logger.fatal(e);
                }
                else logger.fatal(e);
            }
            logger.info(`Gas used for updating ${value_count} values in contract with max depth ${max_mpt_depth}: `, receipt.gasUsed.toNumber());

            // add data to csv
            csv_data.push({
                map_size: map_size,
                used_gas: receipt.gasUsed.toNumber(),
                changed_value_count: value_count,
                max_mpt_depth
            });

            // after update storage layouts are equal, no diffs
            diff = await differ.getDiff(srcContract.address, proxyContract.address);
            expect(diff.isEmpty()).to.be.true;
        }
    });

    it("Contract with map containing 100 values, update multiple values per iteration", async function() {
        const map_size = 100;
        // insert some random values
        let srcKeys: Array<number> = [];
        let srcValues: Array<number> = [];
        let allValues: Array<number> = [];
        let srcCounter: number = 0;
        for (let i = 0; i < map_size; i++) {
            const value = Math.floor(Math.random() * 10000000);
            srcKeys.push(i);
            srcValues.push(value);
            allValues.push(value);
            srcCounter++;
            if (srcCounter >= KEY_VALUE_PAIR_PER_BATCH) {
                await srcContract.insertMultiple(srcKeys, srcValues);
                srcValues = [];
                srcKeys = [];
                srcCounter = 0;
            } 
        }
        if (srcCounter !== 0) await srcContract.insertMultiple(srcKeys, srcValues);

        let keys = await getAllKeys(srcContract.address, provider);
        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);
        // create a proof of the source contract's storage
        let proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]));
        encodedProof = await proof.encoded(latestBlock.stateRoot);

        // getting depth of mpt
        let max_mpt_depth = 0;
        proof.storageProof.forEach((storageProof) => {
            if (max_mpt_depth < storageProof.proof.length) max_mpt_depth = storageProof.proof.length;
        });

        storageRoot = proof.storageHash;

        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        const compiledProxy = await DeployProxy.compiledAbiAndBytecode(relayContract.address, logicContract.address, srcContract.address);

        // deploy the proxy with the state of the `srcContract`
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);

        proxyContract = await proxyFactory.deploy();

        // migrate storage
        logger.debug('migrating storage');
        let proxykeys: Array<String> = [];
        let proxyValues: Array<String> = [];
        for (const storageProof of proof.storageProof) {
            proxykeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
            if (proxykeys.length >= KEY_VALUE_PAIR_PER_BATCH) {
                await proxyContract.addStorage(proxykeys, proxyValues, { gasLimit: 80000000 });
                proxykeys = [];
                proxyValues = [];
            }
        }
        if (proxykeys.length != 0) await proxyContract.addStorage(proxykeys, proxyValues, { gasLimit: 80000000 });
        logger.debug('done.');

        // validate migration
        //  getting account proof from source contract
        const sourceAccountProof = await proof.optimizedProof(latestBlock.stateRoot, false);

        //  getting account proof from proxy contract
        const proxyProvider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
        const latestProxyChainBlock = await proxyProvider.send('eth_getBlockByNumber', ["latest", false]);
        const proxyChainProof = new GetProof(await proxyProvider.send("eth_getProof", [proxyContract.address, []]));
        const proxyAccountProof = await proxyChainProof.optimizedProof(latestProxyChainBlock.stateRoot, false);

        //  getting encoded block header
        const encodedBlockHeader = encodeBlockHeader(latestProxyChainBlock);

        // need to use web3 here as hardhat/ethers mine another block before actually executing the method on the bc.
        // therefore, block.number - 1 in the function verifyMigrateContract doesn't work anymore.
        const web3 = new Web3('ws://localhost:8546');
        const contractInstance = new web3.eth.Contract(compiledProxy.abi, proxyContract.address);
        await contractInstance.methods.verifyMigrateContract(sourceAccountProof, proxyAccountProof, encodedBlockHeader).send({
            from: '0x00ce0c25d2a45e2f22d4416606d928b8c088f8db'
        });

        //  validating
        const migrationValidated = await relayContract.getMigrationState(proxyContract.address);
        expect(migrationValidated).to.be.true;

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        let differ = new StorageDiffer(provider);
        let diff = await differ.getDiff(srcContract.address, proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        for (let i = 1; i < MAX_CHANGED_VALUES; i++) {
            // always change deepest values first
            let currHeight = max_mpt_depth;
            const value_count = i + 1;
            let valueIndices: Array<number> = [];
            let newValues: Array<number> = [];
            let newKeys: Array<number> = [];
            let proofIndices: Array<number> = [];
            let proxyKeys: Array<number> = [];
            let proxyValues: Array<number> = [];
            while (valueIndices.length < value_count) {
                // get a new value
                const proofIndex = proof.storageProof.findIndex((storageProof, index) => {
                    return storageProof.proof.length === currHeight && proofIndices.indexOf(index) === -1;
                });
                if (proofIndex === -1) {
                    // if all values from currHeight already in our array, go one level closer to root
                    currHeight--;
                    continue;
                }
                proofIndices.push(proofIndex);
                const valueIndex = allValues.findIndex((value) => {
                    return ethers.BigNumber.from(proof.storageProof[proofIndex].value).toHexString() === ethers.BigNumber.from(value).toHexString();
                });
                const value = Math.floor(Math.random() * 10000000);
                valueIndices.push(valueIndex)
                proxyKeys.push(valueIndex);

                newValues.push(value);
                newKeys.push(valueIndex);

                proxyValues.push(value);
                // change previous synced value in batches
                if (proxyKeys.length >= KEY_VALUE_PAIR_PER_BATCH) {
                    await srcContract.insertMultiple(proxyKeys, proxyValues, { gasLimit: 80000000 });
                    proxykeys = [];
                    proxyValues = [];
                }
            }
            if (proxyKeys.length !== 0) await srcContract.insertMultiple(proxyKeys, proxyValues, { gasLimit: 80000000 });

            // get the diff set, the storage keys for the changed values
            diff = await differ.getDiff(srcContract.address, proxyContract.address);
            const changedKeys = diff.diffs.map(c => c.key);

            latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

            // create a proof of the source contract's storage for all the changed keys
            let changedKeysProof = new GetProof(await provider.send("eth_getProof", [srcContract.address, changedKeys]));

            // get depth of value
            let value_mpt_depth = 0;
            changedKeysProof.storageProof.forEach((storageProof) => {
                if (value_mpt_depth < storageProof.proof.length) value_mpt_depth = storageProof.proof.length;
            });

            // compute the optimized storage proof
            const rlpOptimized = changedKeysProof.optimizedStorageProof();

            // ensure that the old contract state equals the last synced storage hash
            try {
                const validated = await proxyContract.verifyOldContractStateProof(rlpOptimized, { gasLimit: 80000000 });
                expect(validated).to.be.true;
            } catch(e) {
                logger.error('something went wrong');
                const regexr = new RegExp(/Reverted 0x(.*)/);
                const checker = regexr.exec(e.data);
                if (checker) {
                    logger.error(`'${hex_to_ascii(checker[1])}'`);
                    logger.fatal(e);
                }
                else logger.fatal(e);
            }

            const rlpProof = await changedKeysProof.optimizedProof(latestBlock.stateRoot);
            await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

            // update the proxy storage
            let txResponse;
            let receipt;
            try {
                txResponse = await proxyContract.updateStorage(rlpProof, { gasLimit: 80000000 });
                receipt = await txResponse.wait();
            } catch (e) {
                logger.error('something went wrong');
                const regexr = new RegExp(/Reverted 0x(.*)/);
                const checker = regexr.exec(e.data);
                // if (checker) {
                //     logger.error(`'${hex_to_ascii(checker[1])}'`);
                //     logger.fatal(e);
                // }
                // else logger.fatal(e);
            }
            logger.info(`Gas used for updating ${value_count} values in contract with max depth ${max_mpt_depth}: `, receipt.gasUsed.toNumber());

            // add data to csv
            csv_data.push({
                map_size: map_size,
                used_gas: receipt.gasUsed.toNumber(),
                changed_value_count: value_count,
                max_mpt_depth
            });

            // after update storage layouts are equal, no diffs
            diff = await differ.getDiff(srcContract.address, proxyContract.address);
            expect(diff.isEmpty()).to.be.true;
        }
    });

    it("Contract with map containing 1000 values, update multiple values per iteration", async function() {
        const map_size = 1000;
        // insert some random values
        let srcKeys: Array<number> = [];
        let srcValues: Array<number> = [];
        let allValues: Array<number> = [];
        let srcCounter: number = 0;
        for (let i = 0; i < map_size; i++) {
            const value = Math.floor(Math.random() * 10000000);
            srcKeys.push(i);
            srcValues.push(value);
            allValues.push(value);
            srcCounter++;
            if (srcCounter >= KEY_VALUE_PAIR_PER_BATCH) {
                await srcContract.insertMultiple(srcKeys, srcValues);
                srcValues = [];
                srcKeys = [];
                srcCounter = 0;
            } 
        }
        if (srcCounter !== 0) await srcContract.insertMultiple(srcKeys, srcValues);

        let keys = await getAllKeys(srcContract.address, provider);
        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);
        // create a proof of the source contract's storage
        let proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]));
        encodedProof = await proof.encoded(latestBlock.stateRoot);

        // getting depth of mpt
        let max_mpt_depth = 0;
        proof.storageProof.forEach((storageProof) => {
            if (max_mpt_depth < storageProof.proof.length) max_mpt_depth = storageProof.proof.length;
        });

        storageRoot = proof.storageHash;

        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        const compiledProxy = await DeployProxy.compiledAbiAndBytecode(relayContract.address, logicContract.address, srcContract.address);

        // deploy the proxy with the state of the `srcContract`
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);

        proxyContract = await proxyFactory.deploy();

        // migrate storage
        logger.debug('migrating storage');
        let proxykeys: Array<String> = [];
        let proxyValues: Array<String> = [];
        for (const storageProof of proof.storageProof) {
            proxykeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
            if (proxykeys.length >= KEY_VALUE_PAIR_PER_BATCH) {
                await proxyContract.addStorage(proxykeys, proxyValues, { gasLimit: 80000000 });
                proxykeys = [];
                proxyValues = [];
            }
        }
        if (proxykeys.length != 0) await proxyContract.addStorage(proxykeys, proxyValues, { gasLimit: 80000000 });
        logger.debug('done.');

        // validate migration
        //  getting account proof from source contract
        const sourceAccountProof = await proof.optimizedProof(latestBlock.stateRoot, false);

        //  getting account proof from proxy contract
        const proxyProvider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
        const latestProxyChainBlock = await proxyProvider.send('eth_getBlockByNumber', ["latest", false]);
        const proxyChainProof = new GetProof(await proxyProvider.send("eth_getProof", [proxyContract.address, []]));
        const proxyAccountProof = await proxyChainProof.optimizedProof(latestProxyChainBlock.stateRoot, false);

        //  getting encoded block header
        const encodedBlockHeader = encodeBlockHeader(latestProxyChainBlock);

        // need to use web3 here as hardhat/ethers mine another block before actually executing the method on the bc.
        // therefore, block.number - 1 in the function verifyMigrateContract doesn't work anymore.
        const web3 = new Web3('ws://localhost:8546');
        const contractInstance = new web3.eth.Contract(compiledProxy.abi, proxyContract.address);
        await contractInstance.methods.verifyMigrateContract(sourceAccountProof, proxyAccountProof, encodedBlockHeader).send({
            from: '0x00ce0c25d2a45e2f22d4416606d928b8c088f8db'
        });

        //  validating
        const migrationValidated = await relayContract.getMigrationState(proxyContract.address);
        expect(migrationValidated).to.be.true;

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        let differ = new StorageDiffer(provider);
        let diff = await differ.getDiff(srcContract.address, proxyContract.address);
        expect(diff.isEmpty()).to.be.true;

        for (let i = 1; i < MAX_CHANGED_VALUES; i++) {
            // always change deepest values first
            let currHeight = max_mpt_depth;
            const value_count = i + 1;
            let valueIndices: Array<number> = [];
            let newValues: Array<number> = [];
            let newKeys: Array<number> = [];
            let proofIndices: Array<number> = [];
            let proxyKeys: Array<number> = [];
            let proxyValues: Array<number> = [];
            while (valueIndices.length < value_count) {
                // get a new value
                const proofIndex = proof.storageProof.findIndex((storageProof, index) => {
                    return storageProof.proof.length === currHeight && proofIndices.indexOf(index) === -1;
                });
                if (proofIndex === -1) {
                    // if all values from currHeight already in our array, go one level closer to root
                    currHeight--;
                    continue;
                }
                proofIndices.push(proofIndex);
                const valueIndex = allValues.findIndex((value) => {
                    return ethers.BigNumber.from(proof.storageProof[proofIndex].value).toHexString() === ethers.BigNumber.from(value).toHexString();
                });
                const value = Math.floor(Math.random() * 10000000);
                valueIndices.push(valueIndex)
                proxyKeys.push(valueIndex);

                newValues.push(value);
                newKeys.push(valueIndex);

                proxyValues.push(value);
                // change previous synced value in batches
                if (proxyKeys.length >= KEY_VALUE_PAIR_PER_BATCH) {
                    await srcContract.insertMultiple(proxyKeys, proxyValues, { gasLimit: 80000000 });
                    proxykeys = [];
                    proxyValues = [];
                }
            }
            if (proxyKeys.length !== 0) await srcContract.insertMultiple(proxyKeys, proxyValues, { gasLimit: 80000000 });

            // get the diff set, the storage keys for the changed values
            diff = await differ.getDiff(srcContract.address, proxyContract.address);
            const changedKeys = diff.diffs.map(c => c.key);

            latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

            // create a proof of the source contract's storage for all the changed keys
            let changedKeysProof = new GetProof(await provider.send("eth_getProof", [srcContract.address, changedKeys]));

            // get depth of value
            let value_mpt_depth = 0;
            changedKeysProof.storageProof.forEach((storageProof) => {
                if (value_mpt_depth < storageProof.proof.length) value_mpt_depth = storageProof.proof.length;
            });

            // compute the optimized storage proof
            const rlpOptimized = changedKeysProof.optimizedStorageProof();

            // ensure that the old contract state equals the last synced storage hash
            try {
                const validated = await proxyContract.verifyOldContractStateProof(rlpOptimized, { gasLimit: 80000000 });
                expect(validated).to.be.true;
            } catch(e) {
                logger.error('something went wrong');
                const regexr = new RegExp(/Reverted 0x(.*)/);
                const checker = regexr.exec(e.data);
                if (checker) {
                    logger.error(`'${hex_to_ascii(checker[1])}'`);
                    logger.fatal(e);
                }
                else logger.fatal(e);
            }

            const rlpProof = await changedKeysProof.optimizedProof(latestBlock.stateRoot);
            await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

            // update the proxy storage
            let txResponse;
            let receipt;
            try {
                txResponse = await proxyContract.updateStorage(rlpProof, { gasLimit: 80000000 });
                receipt = await txResponse.wait();
            } catch (e) {
                logger.error('something went wrong');
                const regexr = new RegExp(/Reverted 0x(.*)/);
                const checker = regexr.exec(e.data);
                // if (checker) {
                //     logger.error(`'${hex_to_ascii(checker[1])}'`);
                //     logger.fatal(e);
                // }
                // else logger.fatal(e);
            }
            logger.info(`Gas used for updating ${value_count} values in contract with max depth ${max_mpt_depth}: `, receipt.gasUsed.toNumber());

            // add data to csv
            csv_data.push({
                map_size: map_size,
                used_gas: receipt.gasUsed.toNumber(),
                changed_value_count: value_count,
                max_mpt_depth
            });

            // after update storage layouts are equal, no diffs
            diff = await differ.getDiff(srcContract.address, proxyContract.address);
            expect(diff.isEmpty()).to.be.true;
        }
    });
});