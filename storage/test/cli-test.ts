import { RelayContract__factory, MappingContract, MappingContract__factory, RelayContract } from "../src-gen/types";
import { ethers, network } from "hardhat";
import { expect } from "chai";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Add, Change, Remove, StorageDiffer } from "../src/get-diff";
import { logger } from "../src/logger";
import { HttpNetworkConfig } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { execSync } from "child_process";
import { InitializationResult, TestChainProxy } from "./test-utils";
import { ProxyContractBuilder } from "../src/proxy-contract-builder";
import { PROXY_INTERFACE } from "../src/config";
import { Contract } from "@ethersproject/contracts";
import { getAllKeys } from "../src/utils";
import { GetProof } from "../src/verify-proof";

namespace TestCLI {
    export const ts_node_exec = './node_modules/ts-node/dist/bin-transpile.js';
    export const cli_exec = './src/cli/cross-chain-cli.ts';
    export const default_test_config_file = './test/config/test-cli-config.json';
    export const MAX_VALUE = 1000000;
}

describe("Test CLI", async function () {
    let deployer: SignerWithAddress;
    let srcContract: MappingContract;
    let logicContract: MappingContract;
    let factory: MappingContract__factory;
    let provider: JsonRpcProvider;
    let relayContract: RelayContract;
    let httpConfig: HttpNetworkConfig;
    let differ: StorageDiffer;
    let chainProxy: TestChainProxy;

    before(async () => {
        httpConfig = network.config as HttpNetworkConfig;
        logger.setSettings({ minLevel: 'info', name: 'cli-test.ts' });
        provider = new ethers.providers.JsonRpcProvider(httpConfig.url);
        differ = new StorageDiffer(provider);
        deployer = await SignerWithAddress.create(provider.getSigner());;
        factory = new MappingContract__factory(deployer);
    });

    after(async () => {
    });

    beforeEach(async () => {
        logger.setSettings({ name: 'beforeEach' });
        srcContract = await factory.deploy();
        logicContract = await factory.deploy();
        // deploy the relay contract
        const Relayer = new RelayContract__factory(deployer);
        relayContract = await Relayer.deploy();
        logger.debug(`srcContract: ${srcContract.address}, relayContract: ${relayContract.address}`);
        chainProxy = new TestChainProxy(srcContract, logicContract, httpConfig, deployer, relayContract, provider);
    });

    afterEach(async () => {
    });

    it("should fork", async () => {
        logger.setSettings({ name: 'should fork'});
        
        let forkCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} f ${srcContract.address} ${relayContract.address} -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${forkCommand}`);

        let output = execSync(forkCommand);
        logger.debug(`\n${output}`);

        const matcher = output.toString().match(/[\w\W]+Logic contract address: (0x[\w\d]{40})[\w\W]+Address of proxyContract: (0x[\w\d]{40})/);

        expect(matcher).to.not.be.null;
        if (matcher === null) return false;

        const logicContractAddress = matcher[1];
        const proxyContractAddress = matcher[2];

        logger.debug(`logicAddress: ${logicContractAddress}, proxyContractAddress: ${proxyContractAddress}`);

        const migrated = await relayContract.getMigrationState(proxyContractAddress);
        expect(migrated).to.be.true;

        const proxyProof = await provider.send("eth_getProof", [proxyContractAddress, []]);
        const proxyStorageRoot = proxyProof.storageHash.toLowerCase();
        const srcProof = await provider.send("eth_getProof", [srcContract.address, []]);
        const srcStorageRoot = srcProof.storageHash.toLowerCase();
        expect(proxyStorageRoot).to.equal(srcStorageRoot);

        const compiledProxy = await ProxyContractBuilder.compiledAbiAndBytecode(relayContract.address, logicContractAddress, srcContract.address);
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);
        const proxyContract = proxyFactory.attach(proxyContractAddress);

        const newSrcContractAddress = await proxyContract.getSourceAddress();
        expect(newSrcContractAddress.toLowerCase()).to.equal(srcContract.address.toLowerCase());

        const newLogicContractAddress = await proxyContract.getLogicAddress();
        expect(newLogicContractAddress.toLowerCase()).to.equal(logicContractAddress.toLowerCase());
    });

    it("should fork without relayContract", async () => {
        logger.setSettings({ name: 'should fork without relayContract'});
        
        let forkCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} f ${srcContract.address} -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${forkCommand}`);

        let output = execSync(forkCommand);
        logger.debug(`\n${output}`);

        const matcher = output.toString().match(/[\w\W]+Relay contract address: (0x[\w\d]{40})[\w\W]+Logic contract address: (0x[\w\d]{40})[\w\W]+Address of proxyContract: (0x[\w\d]{40})/);

        expect(matcher).to.not.be.null;
        if (matcher === null) return false;

        const relayContractAddress = matcher[1];
        const logicContractAddress = matcher[2];
        const proxyContractAddress = matcher[3];

        logger.debug(`relayAddress: ${relayContractAddress}, logicAddress: ${logicContractAddress}, proxyContractAddress: ${proxyContractAddress}`);

        const relayFactory = new RelayContract__factory(deployer);
        relayContract = relayFactory.attach(relayContractAddress);
        const migrated = await relayContract.getMigrationState(proxyContractAddress);
        expect(migrated).to.be.true;

        const proxyProof = await provider.send("eth_getProof", [proxyContractAddress, []]);
        const proxyStorageRoot = proxyProof.storageHash.toLowerCase();
        const srcProof = await provider.send("eth_getProof", [srcContract.address, []]);
        const srcStorageRoot = srcProof.storageHash.toLowerCase();
        expect(proxyStorageRoot).to.equal(srcStorageRoot);

        const compiledProxy = await ProxyContractBuilder.compiledAbiAndBytecode(relayContract.address, logicContractAddress, srcContract.address);
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);
        const proxyContract = proxyFactory.attach(proxyContractAddress);

        const newSrcContractAddress = await proxyContract.getSourceAddress();
        expect(newSrcContractAddress.toLowerCase()).to.equal(srcContract.address.toLowerCase());

        const newLogicContractAddress = await proxyContract.getLogicAddress();
        expect(newLogicContractAddress.toLowerCase()).to.equal(logicContractAddress.toLowerCase());
    });

    it("should synch (diff mode = srcTx, changed values)", async () => {
        logger.setSettings({ name: 'should synch w/ srcTx, changed values'});
        const map_size = 10;
        let initialization: InitializationResult;

        try {
            initialization = await chainProxy.initializeProxyContract(map_size, TestCLI.MAX_VALUE);
            expect(initialization.migrationState).to.be.true;
        } catch(e) {
            logger.fatal(e);
            return false;
        }

        // get blocknumber before changing src contract
        const currBlockNr = await provider.getBlockNumber();

        // insert some new values
        const changedValues = await chainProxy.changeValues(10, TestCLI.MAX_VALUE);
        expect(changedValues).to.be.true;

        let synchCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} s ${initialization.proxyContract.address} ${relayContract.address} --src-blocknr ${currBlockNr + 1} -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${synchCommand}`);

        let output = execSync(synchCommand);
        logger.debug(`\n${output}`);

        const proxyProof = await provider.send("eth_getProof", [initialization.proxyContract.address, []]);
        const proxyStorageRoot = proxyProof.storageHash.toLowerCase();
        const srcProof = await provider.send("eth_getProof", [srcContract.address, []]);
        const srcStorageRoot = srcProof.storageHash.toLowerCase();
        expect(proxyStorageRoot).to.equal(srcStorageRoot);
    });

    it("should synch (diff mode = srcTx, added values but not changing merkle tree structure)", async () => {
        logger.setSettings({ name: 'should synch w/ srcTx, added values'});
        const map_size = 3;
        let initialization: InitializationResult;

        try {
            initialization = await chainProxy.initializeProxyContract(map_size, TestCLI.MAX_VALUE);
            expect(initialization.migrationState).to.be.true;
        } catch(e) {
            logger.fatal(e);
            return false;
        }

        // get blocknumber before changing src contract
        const currBlockNr = await provider.getBlockNumber();

        // insert some new values
        const changedValues = await chainProxy.addValueAtIndex(4, TestCLI.MAX_VALUE);
        expect(changedValues).to.be.true;
        
        let synchCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} s ${initialization.proxyContract.address} ${relayContract.address} --src-blocknr ${currBlockNr + 1} -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${synchCommand}`);

        let output = execSync(synchCommand);
        logger.debug(`\n${output}`);

        const proxyProof = await provider.send("eth_getProof", [initialization.proxyContract.address, []]);
        const proxyStorageRoot = proxyProof.storageHash.toLowerCase();
        const srcProof = await provider.send("eth_getProof", [srcContract.address, []]);
        const srcStorageRoot = srcProof.storageHash.toLowerCase();
        expect(proxyStorageRoot).to.equal(srcStorageRoot);
    });

    it("should synch (diff mode = srcTx, deleted values but not changing merkle tree structure)", async () => {
        logger.setSettings({ name: 'should synch w/ srcTx, deleted values'});
        const map_size = 6;
        let initialization: InitializationResult;

        try {
            initialization = await chainProxy.initializeProxyContract(map_size, TestCLI.MAX_VALUE);
            expect(initialization.migrationState).to.be.true;
        } catch(e) {
            logger.fatal(e);
            return false;
        }

        // get blocknumber before changing src contract
        const currBlockNr = await provider.getBlockNumber();

        // insert some new values
        const changedValues = await chainProxy.deleteValueAtIndex(0);
        expect(changedValues).to.be.true;
        
        let synchCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} s ${initialization.proxyContract.address} ${relayContract.address} --src-blocknr ${currBlockNr + 1} -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${synchCommand}`);

        let output = execSync(synchCommand);
        logger.debug(`\n${output}`);

        const proxyProof = await provider.send("eth_getProof", [initialization.proxyContract.address, []]);
        const proxyStorageRoot = proxyProof.storageHash.toLowerCase();
        const srcProof = await provider.send("eth_getProof", [srcContract.address, []]);
        const srcStorageRoot = srcProof.storageHash.toLowerCase();
        expect(proxyStorageRoot).to.equal(srcStorageRoot);
    });

    it("should synch (diff mode = storage, changed values)", async () => {
        logger.setSettings({ name: 'should synch w/ storage, changed values'});
        const map_size = 10;
        let initialization: InitializationResult;

        try {
            initialization = await chainProxy.initializeProxyContract(map_size, TestCLI.MAX_VALUE);
            expect(initialization.migrationState).to.be.true;
        } catch(e) {
            logger.fatal(e);
            return false;
        }

        // get blocknumber before changing src contract
        const currBlockNr = await provider.getBlockNumber();

        // insert some new values
        const changedValues = await chainProxy.changeValues(10, TestCLI.MAX_VALUE);
        expect(changedValues).to.be.true;
        
        let synchCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} s ${initialization.proxyContract.address} ${relayContract.address} --diff-mode storage -c ${TestCLI.default_test_config_file}`;
        logger.debug(`Executing:\n${synchCommand}`);

        let output = execSync(synchCommand);
        logger.debug(`\n${output}`);

        const proxyProof = await provider.send("eth_getProof", [initialization.proxyContract.address, []]);
        const proxyStorageRoot = proxyProof.storageHash.toLowerCase();
        const srcProof = await provider.send("eth_getProof", [srcContract.address, []]);
        const srcStorageRoot = srcProof.storageHash.toLowerCase();
        expect(proxyStorageRoot).to.equal(srcStorageRoot, 'storageHashes of proxy and src are not the same');
    });

    it("should synch (diff mode = storage, added values but not changing merkle tree structure)", async () => {
        logger.setSettings({ name: 'should synch w/ storage, added values'});
        const map_size = 3;
        let initialization: InitializationResult;

        try {
            initialization = await chainProxy.initializeProxyContract(map_size, TestCLI.MAX_VALUE);
            expect(initialization.migrationState).to.be.true;
        } catch(e) {
            logger.fatal(e);
            return false;
        }

        // get blocknumber before changing src contract
        const currBlockNr = await provider.getBlockNumber();

        // insert some new values
        const changedValues = await chainProxy.addValueAtIndex(4, TestCLI.MAX_VALUE);
        expect(changedValues).to.be.true;
        
        let synchCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} s ${initialization.proxyContract.address} ${relayContract.address} --diff-mode storage -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${synchCommand}`);

        let output = execSync(synchCommand);
        logger.debug(`\n${output}`);

        const proxyProof = await provider.send("eth_getProof", [initialization.proxyContract.address, []]);
        const proxyStorageRoot = proxyProof.storageHash.toLowerCase();
        const srcProof = await provider.send("eth_getProof", [srcContract.address, []]);
        const srcStorageRoot = srcProof.storageHash.toLowerCase();
        expect(proxyStorageRoot).to.equal(srcStorageRoot, 'storageHashes of proxy and src are not the same');
    });

    it("should synch (diff mode = storage, deleted values but not changing merkle tree structure)", async () => {
        logger.setSettings({ name: 'should synch w/ storage, deleted values'});
        const map_size = 3;
        let initialization: InitializationResult;

        try {
            initialization = await chainProxy.initializeProxyContract(map_size, TestCLI.MAX_VALUE);
            expect(initialization.migrationState).to.be.true;
        } catch(e) {
            logger.fatal(e);
            return false;
        }

        // get blocknumber before changing src contract
        const currBlockNr = await provider.getBlockNumber();

        // insert some new values
        const changedValues = await chainProxy.deleteValueAtIndex(0);
        expect(changedValues).to.be.true;
        
        let synchCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} s ${initialization.proxyContract.address} ${relayContract.address} --diff-mode storage -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${synchCommand}`);

        let output = execSync(synchCommand);
        logger.debug(`\n${output}`);

        const proxyProof = await provider.send("eth_getProof", [initialization.proxyContract.address, []]);
        const proxyStorageRoot = proxyProof.storageHash.toLowerCase();
        const srcProof = await provider.send("eth_getProof", [srcContract.address, []]);
        const srcStorageRoot = srcProof.storageHash.toLowerCase();
        expect(proxyStorageRoot).to.equal(srcStorageRoot, 'storageHashes of proxy and src are not the same');
    });

    it("should get migration-state", async () => {
        logger.setSettings({ name: 'should get migration-state'});

        // deploy the proxy with the state of the `srcContract`
        const compiledProxy = await ProxyContractBuilder.compiledAbiAndBytecode(relayContract.address, logicContract.address, srcContract.address);
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);
        let cleanSlateProxy: Contract;
        try {
            cleanSlateProxy = await proxyFactory.deploy();
        } catch(e) {
            logger.error(e);
            return false;
        }

        let stateCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} status ${cleanSlateProxy.address} ${relayContract.address} -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${stateCommand}`);
        let output = execSync(stateCommand);

        let result = output.toString().match(/[\w\W]+migration-status: false/);
        expect(result).to.not.be.null;

        const map_size = 1;
        let initialization: InitializationResult;

        try {
            initialization = await chainProxy.initializeProxyContract(map_size, TestCLI.MAX_VALUE);
            expect(initialization.migrationState).to.be.true;
        } catch(e) {
            logger.fatal(e);
            process.exit(-1);
        }

        stateCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} status ${initialization.proxyContract.address} ${relayContract.address} -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${stateCommand}`);
        output = execSync(stateCommand);

        result = output.toString().match(/[\w\W]+migration-status: true/);
        expect(result).to.not.be.null;
    });

    it("should get-diff (diff mode = srcTx, with changed values)", async () => {
        logger.setSettings({ name: 'should get-diff w/ srcTx'});
        const map_size = 10;
        let initialization: InitializationResult;

        try {
            initialization = await chainProxy.initializeProxyContract(map_size, TestCLI.MAX_VALUE);
            expect(initialization.migrationState).to.be.true;
        } catch(e) {
            logger.fatal(e);
            return false;
        }

        let diffCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} diff ${srcContract.address} ${initialization.proxyContract.address} ${relayContract.address} -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${diffCommand}`);
        let output = execSync(diffCommand);
        logger.debug(`\n${output}`);
        let result = output.toString().match(/[\w\W]+Adds: \n\[\][\w\W]+Changes: \n\[\][\w\W]+Deletions: \n\[\]/);
        expect(result).to.not.be.null;

        // get blocknumber before changing src contract
        const currBlockNr = await provider.getBlockNumber();

        // insert some new values
        let changedValues = await chainProxy.changeValues(10, TestCLI.MAX_VALUE);
        expect(changedValues).to.be.true;
        
        diffCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} diff ${srcContract.address} --src-blocknr ${currBlockNr + 1} -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${diffCommand}`);

        output = execSync(diffCommand);
        logger.debug(`\n${output}`);
        result = output.toString().match(/[\w\W]+Changes: \n(\[[\w\W]+\])/);
        expect(result).to.not.be.null;

        const realDiffer = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr + 1);
        realDiffer.changes().forEach((change: Change) => {
            if (result === null) return false;
            const regexr = new RegExp(`key[\\w\\W]+:[\\w\\W]+'${change.key}'[\\w\\W]+targetValue[\\w\\W]+:[\\w\\W]+'${change.targetValue}'`);
            let currResult = regexr.exec(result[1]);
            expect(currResult).to.not.be.null;
        });
    });

    it("should get-diff (diff mode = srcTx, with added values but not changing merkle tree structure)", async () => {
        logger.setSettings({ name: 'should get-diff w/ srcTx, add values'});
        const map_size = 3;
        let initialization: InitializationResult;

        try {
            initialization = await chainProxy.initializeProxyContract(map_size, TestCLI.MAX_VALUE);
            expect(initialization.migrationState).to.be.true;
        } catch(e) {
            logger.fatal(e);
            return false;
        }

        let diffCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} diff ${srcContract.address} ${initialization.proxyContract.address} ${relayContract.address} -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${diffCommand}`);
        let output = execSync(diffCommand);
        logger.debug(`\n${output}`);
        let result = output.toString().match(/[\w\W]+Adds: \n\[\][\w\W]+Changes: \n\[\][\w\W]+Deletions: \n\[\]/);
        expect(result).to.not.be.null;

        // get blocknumber before changing src contract
        const currBlockNr = await provider.getBlockNumber();

        // insert some new values
        let addedValue = await chainProxy.addValueAtIndex(4, TestCLI.MAX_VALUE);
        expect(addedValue).to.be.true;
        
        diffCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} diff ${srcContract.address} --src-blocknr ${currBlockNr + 1} -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${diffCommand}`);

        output = execSync(diffCommand);
        logger.debug(`\n${output}`);
        result = output.toString().match(/[\w\W]+Adds: \n(\[[\w\W]+\])/);
        expect(result).to.not.be.null;

        const realDiffer = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr + 1);
        realDiffer.adds().forEach((add: Add) => {
            if (result === null) return false;
            const regexr = new RegExp(`key[\\w\\W]+:[\\w\\W]+'${add.key}'[\\w\\W]+value[\\w\\W]+:[\\w\\W]+'${add.value}'`);
            let currResult = regexr.exec(result[1]);
            expect(currResult).to.not.be.null;
        });
    });

    it("should get-diff (diff mode = srcTx, with deleted values but not changing merkle tree structure)", async () => {
        logger.setSettings({ name: 'should get-diff w/ srcTx, delete values'});
        const map_size = 3;
        let initialization: InitializationResult;

        try {
            initialization = await chainProxy.initializeProxyContract(map_size, TestCLI.MAX_VALUE);
            expect(initialization.migrationState).to.be.true;
        } catch(e) {
            logger.fatal(e);
            return false;
        }

        let diffCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} diff ${srcContract.address} ${initialization.proxyContract.address} ${relayContract.address} -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${diffCommand}`);
        let output = execSync(diffCommand);
        logger.debug(`\n${output}`);
        let result = output.toString().match(/[\w\W]+Adds: \n\[\][\w\W]+Changes: \n\[\][\w\W]+Deletions: \n\[\]/);
        expect(result).to.not.be.null;

        // get blocknumber before changing src contract
        const currBlockNr = await provider.getBlockNumber();

        // insert some new values
        let deletedValue = await chainProxy.deleteValueAtIndex(0);
        expect(deletedValue).to.be.true;
        
        diffCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} diff ${srcContract.address} --src-blocknr ${currBlockNr + 1} -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${diffCommand}`);

        output = execSync(diffCommand);
        logger.debug(`\n${output}`);
        result = output.toString().match(/[\w\W]+Deletions: \n(\[[\w\W]+\])/);
        expect(result).to.not.be.null;

        const realDiffer = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr + 1);
        realDiffer.removes().forEach((remove: Remove) => {
            if (result === null) return false;
            const regexr = new RegExp(`key[\\w\\W]+:[\\w\\W]+'${remove.key}'[\\w\\W]+value[\\w\\W]+:[\\w\\W]+0`);
            let currResult = regexr.exec(result[1]);
            expect(currResult).to.not.be.null;
        });
    });

    it("should get-diff (diff mode = storage)", async () => {
        logger.setSettings({ name: 'should get-diff w/ storage'});
        const map_size = 10;
        let initialization: InitializationResult;

        try {
            initialization = await chainProxy.initializeProxyContract(map_size, TestCLI.MAX_VALUE);
            expect(initialization.migrationState).to.be.true;
        } catch(e) {
            logger.fatal(e);
            return false;
        }

        let diffCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} diff ${srcContract.address} ${initialization.proxyContract.address} ${relayContract.address} -c ${TestCLI.default_test_config_file} --diff-mode storage -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${diffCommand}`);
        let output = execSync(diffCommand);
        logger.debug(`\n${output}`);
        let result = output.toString().match(/[\w\W]+Adds: \n\[\][\w\W]+Changes: \n\[\][\w\W]+Deletions: \n\[\]/);
        expect(result).to.not.be.null;

        // get blocknumber before changing src contract
        const currBlockNr = await provider.getBlockNumber();

        // insert some new values
        let changedValues = await chainProxy.changeValues(10, TestCLI.MAX_VALUE);
        expect(changedValues).to.be.true;
        
        diffCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} diff ${srcContract.address} ${initialization.proxyContract.address} ${relayContract.address} -c ${TestCLI.default_test_config_file} --diff-mode storage -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${diffCommand}`);

        output = execSync(diffCommand);
        logger.debug(`\n${output}`);
        result = output.toString().match(/[\w\W]+Changes: \n(\[[\w\W]+\])/);
        expect(result).to.not.be.null;

        const realDiffer = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address);
        realDiffer.changes().forEach((change: Change) => {
            if (result === null) return false;
            const regexr = new RegExp(`key[\\w\\W]+:[\\w\\W]+'${change.key}'[\\w\\W]+targetValue[\\w\\W]+:[\\w\\W]+'${change.targetValue}'`);
            let currResult = regexr.exec(result[1]);
            expect(currResult).to.not.be.null;
        });
    });

    it("should get-diff (diff mode = storage, with added values but not changing merkle tree structure)", async () => {
        logger.setSettings({ name: 'should get-diff w/ storage, add values'});
        const map_size = 3;
        let initialization: InitializationResult;

        try {
            initialization = await chainProxy.initializeProxyContract(map_size, TestCLI.MAX_VALUE);
            expect(initialization.migrationState).to.be.true;
        } catch(e) {
            logger.fatal(e);
            return false;
        }

        let diffCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} diff ${srcContract.address} ${initialization.proxyContract.address} ${relayContract.address} -c ${TestCLI.default_test_config_file} --diff-mode storage -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${diffCommand}`);
        let output = execSync(diffCommand);
        logger.debug(`\n${output}`);
        let result = output.toString().match(/[\w\W]+Adds: \n\[\][\w\W]+Changes: \n\[\][\w\W]+Deletions: \n\[\]/);
        expect(result).to.not.be.null;

        // get blocknumber before changing src contract
        const currBlockNr = await provider.getBlockNumber();

        // insert some new values
        let addedValue = await chainProxy.addValueAtIndex(4, TestCLI.MAX_VALUE);
        expect(addedValue).to.be.true;
        
        diffCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} diff ${srcContract.address} ${initialization.proxyContract.address} ${relayContract.address} -c ${TestCLI.default_test_config_file} --diff-mode storage -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${diffCommand}`);

        output = execSync(diffCommand);
        logger.debug(`\n${output}`);
        result = output.toString().match(/[\w\W]+Adds: \n(\[[\w\W]+\])/);
        expect(result).to.not.be.null;

        const realDiffer = await differ.getDiffFromSrcContractTxs(srcContract.address, 'latest', currBlockNr + 1);
        realDiffer.adds().forEach((add: Add) => {
            if (result === null) return false;
            const regexr = new RegExp(`key[\\w\\W]+:[\\w\\W]+'${add.key}'[\\w\\W]+value[\\w\\W]+:[\\w\\W]+'${add.value}'`);
            let currResult = regexr.exec(result[1]);
            expect(currResult).to.not.be.null;
        });
    });

    it("should get-diff (diff mode = storage, with deleted values but not changing merkle tree structure)", async () => {
        logger.setSettings({ name: 'should get-diff w/ storage, delete values'});
        const map_size = 3;
        let initialization: InitializationResult;

        try {
            initialization = await chainProxy.initializeProxyContract(map_size, TestCLI.MAX_VALUE);
            expect(initialization.migrationState).to.be.true;
        } catch(e) {
            logger.fatal(e);
            return false;
        }

        let diffCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} diff ${srcContract.address} ${initialization.proxyContract.address} ${relayContract.address} -c ${TestCLI.default_test_config_file} --diff-mode storage -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${diffCommand}`);
        let output = execSync(diffCommand);
        logger.debug(`\n${output}`);
        let result = output.toString().match(/[\w\W]+Adds: \n\[\][\w\W]+Changes: \n\[\][\w\W]+Deletions: \n\[\]/);
        expect(result).to.not.be.null;

        // get blocknumber before changing src contract
        const currBlockNr = await provider.getBlockNumber();

        // insert some new values
        let deletedValue = await chainProxy.deleteValueAtIndex(0);
        expect(deletedValue).to.be.true;
        
        diffCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} diff ${srcContract.address} ${initialization.proxyContract.address} ${relayContract.address} --src-blocknr latest -c ${TestCLI.default_test_config_file} --diff-mode storage -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${diffCommand}`);

        output = execSync(diffCommand);
        logger.debug(`\n${output}`);
        result = output.toString().match(/[\w\W]+Deletions: \n(\[[\w\W]+\])/);
        expect(result).to.not.be.null;

        const realDiffer = await differ.getDiffFromStorage(srcContract.address, initialization.proxyContract.address, 'latest', 'latest');
        realDiffer.removes().forEach((remove: Remove) => {
            if (result === null) return false;
            const regexr = new RegExp(`key[\\w\\W]+:[\\w\\W]+'${remove.key}'[\\w\\W]+value[\\w\\W]+:[\\w\\W]+${remove.value}`);
            let currResult = regexr.exec(result[1]);
            expect(currResult).to.not.be.null;
        });
    });

    it("should get latest blocknr", async () => {
        logger.setSettings({ name: 'should get latest blocknr'});

        const map_size = 10;
        let initialization: InitializationResult;
        let latestBlock = await provider.send('eth_getBlockByNumber', ['latest', true]);
        logger.debug(`Latest block before exec command: ${latestBlock.number}`);

        try {
            initialization = await chainProxy.initializeProxyContract(map_size, TestCLI.MAX_VALUE);
            expect(initialization.migrationState).to.be.true;
        } catch(e) {
            logger.fatal(e);
            return false;
        }

        let stateCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} blocknr ${relayContract.address} -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${stateCommand}`);
        let output = execSync(stateCommand);
        logger.debug(output.toString());

        const regexr = new RegExp(`[\\w\\W]+Latest block number from src chain: ${ethers.BigNumber.from(latestBlock.number).toNumber() + 1}`);
        let result = regexr.exec(output.toString());
        expect(result).to.not.be.null;
    });

    it("should get latest blocknr from one proxy contract", async () => {
        logger.setSettings({ name: 'should get latest blocknr from one proxy contract'});

        const map_size = 10;
        let initialization: InitializationResult;

        try {
            initialization = await chainProxy.initializeProxyContract(map_size, TestCLI.MAX_VALUE);
            expect(initialization.migrationState).to.be.true;
        } catch(e) {
            logger.fatal(e);
            return false;
        }

        let latestBlock = await relayContract.getCurrentBlockNumber(initialization.proxyContract.address);
        logger.debug(`Latest block before exec command: ${latestBlock}`);
        let stateCommand = `${TestCLI.ts_node_exec} ${TestCLI.cli_exec} blocknr ${relayContract.address} ${initialization.proxyContract.address} -c ${TestCLI.default_test_config_file} -l ${logger.settings.minLevel}`;
        logger.debug(`Executing:\n${stateCommand}`);
        let output = execSync(stateCommand);
        logger.debug(output.toString());

        const regexr = new RegExp(`[\\w\\W]+Latest block number from src chain: ${ethers.BigNumber.from(latestBlock).toNumber()}`);
        let result = regexr.exec(output.toString());
        expect(result).to.not.be.null;
    });
});