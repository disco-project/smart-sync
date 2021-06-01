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

    beforeEach(async () => {
        [deployer] = await ethers.getSigners();
        factory = new MappingContract__factory(deployer);
        srcContract = await factory.deploy();
        logicContract = await factory.deploy();
        // deploy the relay contract
        const Relayer = new RelayContract__factory(deployer);
        relayContract = await Relayer.deploy();
        provider = new ethers.providers.JsonRpcProvider();

        logger.setSettings({minLevel: 'info', name: 'scale_test.ts'});
    });

    it("Contract with map containing 1 value, update 1 value", async function () {
        // insert some random values
        await srcContract.insert(421, 9000);

        let keys = await getAllKeys(srcContract.address, provider);
        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

        // create a proof of the source contract's storage
        let proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]));
        encodedProof = await proof.encoded(latestBlock.stateRoot);

        storageRoot = proof.storageHash;

        let response = await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        const compiledProxy = await DeployProxy.compiledAbiAndBytecode(relayContract.address, logicContract.address, srcContract.address);

        // deploy the proxy with the state of the `srcContract`
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);

        proxyContract = await proxyFactory.deploy();

        let proxyKeys: Array<string> = [];
        let proxyValues: Array<string> = [];
        for (const storageProof of proof.storageProof) {
            proxyKeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
        }
        await proxyContract.addStorage(proxyKeys, proxyValues, { gasLimit: 8000000 });

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

        // change all the previous synced values
        response = await srcContract.insert(421, 200);

        // get the diff set, the storage keys for the changed values
        diff = await differ.getDiff(srcContract.address, proxyContract.address);
        const changedKeys = diff.diffs.map(c => c.key);

        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

        // create a proof of the source contract's storage for all the changed keys
        proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, changedKeys]));

        // compute the optimized storage proof
        const rlpOptimized = proof.optimizedStorageProof();

        // ensure that the old contract state equals the last synced storage hash
        try {
            const validated = await proxyContract.verifyOldContractStateProof(rlpOptimized);
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
            return;
        }

        const rlpProof = await proof.optimizedProof(latestBlock.stateRoot);
        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        // update the proxy storage
        let txResponse;
        try {
            txResponse = await proxyContract.updateStorage(rlpProof);
        } catch(e) {
            const regexr = new RegExp(/Reverted 0x(.*)/);
            const checker = regexr.exec(e.data);
            if (checker) {
                logger.error(`${hex_to_ascii(checker[1])}`);
                logger.fatal(e);
            }
            else logger.fatal(e);
        }
        let receipt = await txResponse.wait();
        logger.info("Gas used for updating 1 value in map with 1 value: ", receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiff(srcContract.address, proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });

    it("Contract with map containing 10 values, update 1 value", async function() {
        // insert some random values
        for (let i = 0; i < 10; i++) {
            const value = Math.floor(Math.random() * 10000000);
            await srcContract.insert(i, value);
        }

        let keys = await getAllKeys(srcContract.address, provider);
        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);
        // create a proof of the source contract's storage
        let proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]));
        encodedProof = await proof.encoded(latestBlock.stateRoot);

        storageRoot = proof.storageHash;

        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        const compiledProxy = await DeployProxy.compiledAbiAndBytecode(relayContract.address, logicContract.address, srcContract.address);

        // deploy the proxy with the state of the `srcContract`
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);

        proxyContract = await proxyFactory.deploy();

        let proxyKeys: Array<string> = [];
        let proxyValues: Array<string> = [];
        for (const storageProof of proof.storageProof) {
            proxyKeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
        }
        await proxyContract.addStorage(proxyKeys, proxyValues, { gasLimit: 8000000 });

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

        // change previous synced value
        const value = Math.floor(Math.random() * 10000000);
        await srcContract.insert(0, value);

        // get the diff set, the storage keys for the changed values
        diff = await differ.getDiff(srcContract.address, proxyContract.address);
        const changedKeys = diff.diffs.map(c => c.key);

        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

        // create a proof of the source contract's storage for all the changed keys
        proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, changedKeys]));

        // compute the optimized storage proof
        const rlpOptimized = proof.optimizedStorageProof();

        // ensure that the old contract state equals the last synced storage hash
        try {
            const validated = await proxyContract.verifyOldContractStateProof(rlpOptimized);
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

        const rlpProof = await proof.optimizedProof(latestBlock.stateRoot);
        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        // update the proxy storage
        let txResponse;
        let receipt;
        try {
            txResponse = await proxyContract.updateStorage(rlpProof);
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
        logger.info("Gas used for updating first value in map with 10 values: ", receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiff(srcContract.address, proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });

    it("Contract with map containing 10 values, update first 5 values", async function() {
        // insert some random values
        for (let i = 0; i < 10; i++) {
            const value = Math.floor(Math.random() * 10000000);
            await srcContract.insert(i, value);
        }

        let keys = await getAllKeys(srcContract.address, provider);
        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);
        // create a proof of the source contract's storage
        let proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]));
        encodedProof = await proof.encoded(latestBlock.stateRoot);

        storageRoot = proof.storageHash;

        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        const compiledProxy = await DeployProxy.compiledAbiAndBytecode(relayContract.address, logicContract.address, srcContract.address);

        // deploy the proxy with the state of the `srcContract`
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);

        proxyContract = await proxyFactory.deploy();

        let proxyKeys: Array<string> = [];
        let proxyValues: Array<string> = [];
        for (const storageProof of proof.storageProof) {
            proxyKeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
        }
        await proxyContract.addStorage(proxyKeys, proxyValues, { gasLimit: 8000000 });

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

        // change all the previous synced values
        for (let i = 0; i < 5; i++) {
            const value = Math.floor(Math.random() * 10000000);
            await srcContract.insert(i, value);
        }

        // get the diff set, the storage keys for the changed values
        diff = await differ.getDiff(srcContract.address, proxyContract.address);
        const changedKeys = diff.diffs.map(c => c.key);

        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

        // create a proof of the source contract's storage for all the changed keys
        proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, changedKeys]));

        // compute the optimized storage proof
        const rlpOptimized = proof.optimizedStorageProof();

        // ensure that the old contract state equals the last synced storage hash
        const validated = await proxyContract.verifyOldContractStateProof(rlpOptimized);
        expect(validated).to.be.true;

        const rlpProof = await proof.optimizedProof(latestBlock.stateRoot);
        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        // update the proxy storage
        let txResponse = await proxyContract.updateStorage(rlpProof);
        let receipt = await txResponse.wait();
        logger.info("Gas used for updating first 5 values in map with 10 values: ", receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiff(srcContract.address, proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });

    it("Contract with map containing 10 values, update last 5 values", async function() {
        // insert some random values
        for (let i = 0; i < 10; i++) {
            const value = Math.floor(Math.random() * 10000000);
            await srcContract.insert(i, value);
        }

        let keys = await getAllKeys(srcContract.address, provider);
        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);
        // create a proof of the source contract's storage
        let proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]));
        encodedProof = await proof.encoded(latestBlock.stateRoot);

        storageRoot = proof.storageHash;

        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        const compiledProxy = await DeployProxy.compiledAbiAndBytecode(relayContract.address, logicContract.address, srcContract.address);

        // deploy the proxy with the state of the `srcContract`
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);

        proxyContract = await proxyFactory.deploy();

        let proxyKeys: Array<string> = [];
        let proxyValues: Array<string> = [];
        for (const storageProof of proof.storageProof) {
            proxyKeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
        }
        await proxyContract.addStorage(proxyKeys, proxyValues, { gasLimit: 8000000 });

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

        // change all the previous synced values
        for (let i = 5; i < 10; i++) {
            const value = Math.floor(Math.random() * 10000000);
            await srcContract.insert(i, value);
        }

        // get the diff set, the storage keys for the changed values
        diff = await differ.getDiff(srcContract.address, proxyContract.address);
        const changedKeys = diff.diffs.map(c => c.key);

        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

        // create a proof of the source contract's storage for all the changed keys
        proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, changedKeys]));

        // compute the optimized storage proof
        const rlpOptimized = proof.optimizedStorageProof();

        // ensure that the old contract state equals the last synced storage hash
        const validated = await proxyContract.verifyOldContractStateProof(rlpOptimized);
        expect(validated).to.be.true;

        const rlpProof = await proof.optimizedProof(latestBlock.stateRoot);
        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        // update the proxy storage
        let txResponse = await proxyContract.updateStorage(rlpProof);
        let receipt = await txResponse.wait();
        logger.info("Gas used for updating last 5 values in map with 10 values: ", receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiff(srcContract.address, proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });

    it("Contract with map containing 10 values, update 10 values", async function() {
        // insert some random values
        for (let i = 0; i < 10; i++) {
            const value = Math.floor(Math.random() * 10000000);
            await srcContract.insert(i, value);
        }

        let keys = await getAllKeys(srcContract.address, provider);
        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);
        // create a proof of the source contract's storage
        let proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]));
        encodedProof = await proof.encoded(latestBlock.stateRoot);

        storageRoot = proof.storageHash;

        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        const compiledProxy = await DeployProxy.compiledAbiAndBytecode(relayContract.address, logicContract.address, srcContract.address);

        // deploy the proxy with the state of the `srcContract`
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);

        proxyContract = await proxyFactory.deploy();

        let proxyKeys: Array<string> = [];
        let proxyValues: Array<string> = [];
        for (const storageProof of proof.storageProof) {
            proxyKeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
        }
        await proxyContract.addStorage(proxyKeys, proxyValues, { gasLimit: 8000000 });

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

        // change all the previous synced values
        for (let i = 0; i < 10; i++) {
            const value = Math.floor(Math.random() * 10000000);
            await srcContract.insert(i, value);
        }

        // get the diff set, the storage keys for the changed values
        diff = await differ.getDiff(srcContract.address, proxyContract.address);
        const changedKeys = diff.diffs.map(c => c.key);

        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

        // create a proof of the source contract's storage for all the changed keys
        proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, changedKeys]));

        // compute the optimized storage proof
        const rlpOptimized = proof.optimizedStorageProof();

        // ensure that the old contract state equals the last synced storage hash
        const validated = await proxyContract.verifyOldContractStateProof(rlpOptimized);
        expect(validated).to.be.true;

        const rlpProof = await proof.optimizedProof(latestBlock.stateRoot);
        await relayContract.updateBlock(latestBlock.stateRoot, latestBlock.number);

        // update the proxy storage
        let txResponse = await proxyContract.updateStorage(rlpProof);
        let receipt = await txResponse.wait();
        logger.info("Gas used for updating 10 values in map with 10 values: ", receipt.gasUsed.toNumber());

        // after update storage layouts are equal, no diffs
        diff = await differ.getDiff(srcContract.address, proxyContract.address);
        expect(diff.isEmpty()).to.be.true;
    });
})