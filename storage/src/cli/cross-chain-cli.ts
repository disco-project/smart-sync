#!/usr/bin/env ts-node-transpile-only

import { BigNumber } from '@ethersproject/bignumber';
import { ConnectionInfo } from '@ethersproject/web';
import { Command, Option } from 'commander';
import { TLogLevelName } from 'tslog';
import { ChainProxy, ContractAddressMap, RPCConfig, GetDiffMethod } from '../chain-proxy';
import { logger } from '../logger';
import { FileHandler } from '../utils';


const DEFAULT_CONFIG_FILE_PATH = './config/cli-config.json';
const program = new Command();

// get options from config to insert them as default
const fileHandler = new FileHandler(DEFAULT_CONFIG_FILE_PATH);
let defaultOptions: ConfigTypish | undefined = fileHandler.getJSON<ConfigTypish>();
if (!defaultOptions) {
    logger.fatal(`default config file in variable DEFAULT_CONFIG_FILE_PATH does not exist: ${DEFAULT_CONFIG_FILE_PATH}`);
    process.exit(-1);
}

// general information
program
    .version('0.1.0')
    .description('cross chain contracts CLI')

// fork command
let fork: Command = program.command('fork') as Command;
fork = commonOptions(fork);
fork
    .alias('f')
    .description('Migrates a given contract address to a target chain and deploys a proxy contract.')
    .arguments('<src_contract_address>')
    .addOption(
        new Option('--diff-mode <mode>', 'Diff function to use')
            .choices(['storage', 'srcTx'])
    )
    .option('--gas-limit <limit>', 'gas limit for tx on target chain')
    .action(async (srcContract: string, options: TxContractInteractionOptions) => {
        // override options here if config file was added
        if (options.configFile) {
            options = overrideOptions<TxContractInteractionOptions>(options.configFile, options);
        }
        logger.setSettings({ minLevel: options.logLevel });

        const contractAddressMap: ContractAddressMap = {
            srcContract,
            relayContract: options.relayContractAddress
        };
        const srcConnectionInfo: ConnectionInfo = {
            url: options.srcChainUrl,
            timeout: BigNumber.from(options.connectionTimeout).toNumber()
        };
        const targetConnectionInfo: ConnectionInfo = {
            url: options.targetChainUrl,
            timeout: BigNumber.from(options.connectionTimeout).toNumber()
        };
        const rpcConfig: RPCConfig = {
            gasLimit: options.gasLimit
        };
        const chainProxy = new ChainProxy(contractAddressMap, srcConnectionInfo, targetConnectionInfo, rpcConfig);
        await chainProxy.init();
        // todo check for return value
        await chainProxy.migrateSrcContract();
    });

let migrationStatus = program.command('migration-status') as Command;
migrationStatus = commonOptions(migrationStatus);
migrationStatus
    .alias('status')
    .arguments('<proxy_contract_address>')
    .action(async (proxyContractAddress, options) => {
        // override options here if config file was added
        if (options.configFile) {
            options = overrideOptions<TxContractInteractionOptions>(options.configFile, options);
        }
        logger.setSettings({ minLevel: options.logLevel });

        const contractAddressMap: ContractAddressMap = {
            proxyContract: proxyContractAddress,
            relayContract: options.relayContractAddress
        };
        const srcConnectionInfo: ConnectionInfo = {
            url: options.srcChainUrl,
            timeout: BigNumber.from(options.connectionTimeout).toNumber()
        };
        const targetConnectionInfo: ConnectionInfo = {
            url: options.targetChainUrl,
            timeout: BigNumber.from(options.connectionTimeout).toNumber()
        };
        const rpcConfig: RPCConfig = {
            gasLimit: options.gasLimit
        };
        const chainProxy = new ChainProxy(contractAddressMap, srcConnectionInfo, targetConnectionInfo, rpcConfig);
        await chainProxy.init();

        logger.info(`migration-status: ${chainProxy.migrationState}`);
    });

let get_curr_block_number = program.command('get-curr-blocknr') as Command;
get_curr_block_number = commonOptions(get_curr_block_number);
get_curr_block_number
    .alias('blocknr')
    .description('Get latest synched block number from src chain')
    .action(async (options) => {
        // override options here if config file was added
        if (options.configFile) {
            options = overrideOptions<TxContractInteractionOptions>(options.configFile, options);
        }
        logger.setSettings({ minLevel: options.logLevel });

        const contractAddressMap: ContractAddressMap = {
            relayContract: options.relayContractAddress
        };
        const srcConnectionInfo: ConnectionInfo = {
            url: options.srcChainUrl,
            timeout: BigNumber.from(options.connectionTimeout).toNumber()
        };
        const targetConnectionInfo: ConnectionInfo = {
            url: options.targetChainUrl,
            timeout: BigNumber.from(options.connectionTimeout).toNumber()
        };
        const rpcConfig: RPCConfig = {
            gasLimit: options.gasLimit
        };
        const chainProxy = new ChainProxy(contractAddressMap, srcConnectionInfo, targetConnectionInfo, rpcConfig);
        await chainProxy.init();
        const latestBlockNumber = await chainProxy.getLatestBlockNumber();
        logger.info(`Latest block number from src chain: ${latestBlockNumber.toNumber()}`);
    });

let state_diff = program.command('state-diff') as Command;
state_diff = commonOptions(state_diff);
state_diff
    .alias('diff')
    .arguments('<source_contract_address> [proxy_contract_address]')
    .description('If diff-mode == storage, proxy_contract_address has to be provided.')
    .addOption(
        new Option('--diff-mode <mode>', 'Diff function to use. When using storage, option --src-BlockNr equals block on srcChain and --target-BlockNr block on targetChain. When using srcTx --src-BlockNr describes block from where to replay tx until --target-blockNr. If no blocks are given when using srcTx, then only the latest block is examined.')
            .choices(['storage', 'srcTx'])
    )
    .option('--target-blocknr <number>', 'see --diff-mode for further explanation')
    .action(async (srcContractAddress, proxyContractAddress, options) => {
        // override options here if config file was added
        if (options.configFile) {
            options = overrideOptions<TxContractInteractionOptions>(options.configFile, options);
        }
        logger.setSettings({ minLevel: options.logLevel });

        const contractAddressMap: ContractAddressMap = {
            srcContract: srcContractAddress,
            proxyContract: proxyContractAddress,
            relayContract: options.relayContractAddress
        };
        const srcConnectionInfo: ConnectionInfo = {
            url: options.srcChainUrl,
            timeout: BigNumber.from(options.connectionTimeout).toNumber()
        };
        const targetConnectionInfo: ConnectionInfo = {
            url: options.targetChainUrl,
            timeout: BigNumber.from(options.connectionTimeout).toNumber()
        };
        const rpcConfig: RPCConfig = {
            gasLimit: options.gasLimit
        };
        const chainProxy = new ChainProxy(contractAddressMap, srcConnectionInfo, targetConnectionInfo, rpcConfig);
        await chainProxy.init();

        const diff = await chainProxy.getDiff((options.diffMode ?? 'srcTx') as GetDiffMethod, { srcBlock: options.srcBlocknr, targetBlock: options.targetBlocknr });

        if (diff === undefined) return;
        logger.info('Adds:', diff.adds().map((add) => { return { key: add.key, value: add.value }; }));
        logger.info('Changes:', diff.changes().map((change) => { return { key: change.key, srcValue: change.srcValue, targetValue: change.targetValue }; }));
        logger.info('Deletions:', diff.removes().map((remove) => { return { key: remove.key, value: remove.value }; }));
    });

let synchronize: Command = program.command('synchronize') as Command;
synchronize = commonOptions(synchronize);
synchronize
    .alias('s')
    .arguments('<proxy_contract_address>')
    .addOption(
        new Option('--diff-mode <mode>', 'Diff function to use. When using storage, option --src-BlockNr equals block on srcChain and --target-BlockNr block on targetChain. When using srcTx --src-BlockNr describes block from where to replay tx until --target-blockNr.')
            .choices(['storage', 'srcTx'])
    )
    .option('--target-blocknr <number>', 'see --diff-mode for further explanation')
    .option('--gas-limit <limit>', 'gas limit for tx on target chain')
    .action(async (proxyContract: string, options: TxContractInteractionOptions) => {
        // override options here if config file was added
        if (options.configFile) {
            options = overrideOptions<TxContractInteractionOptions>(options.configFile, options);
        }
        logger.setSettings({ minLevel: options.logLevel });

        const contractAddressMap: ContractAddressMap = {
            proxyContract,
            relayContract: options.relayContractAddress
        };
        const srcConnectionInfo: ConnectionInfo = {
            url: options.srcChainUrl,
            timeout: BigNumber.from(options.connectionTimeout).toNumber()
        };
        const targetConnectionInfo: ConnectionInfo = {
            url: options.targetChainUrl,
            timeout: BigNumber.from(options.connectionTimeout).toNumber()
        };
        const rpcConfig: RPCConfig = {
            gasLimit: options.gasLimit
        };
        const chainProxy = new ChainProxy(contractAddressMap, srcConnectionInfo, targetConnectionInfo, rpcConfig);
        await chainProxy.init();
        const changedKeys = await chainProxy.getDiff((options.diffMode ?? 'srcTx') as GetDiffMethod, { srcBlock: options.srcBlocknr, targetBlock: options.targetBlocknr });
        if (!changedKeys) {
            logger.error('Could not get changed keys');
            return;
        }
        await chainProxy.migrateChangesToProxy(changedKeys.getKeys());
    });

program
    .parse(process.argv);

function commonOptions(command: Command): Command {
    if (!defaultOptions) {
        logger.error(`default config file in variable DEFAULT_CONFIG_FILE_PATH does not exist: ${DEFAULT_CONFIG_FILE_PATH}`);
        process.exit(-1);
    }

    // todo add options and insert default values from config file
    command.addOption(
        new Option('-l, --log-level <level>', 'verbose level of logging')
            .default(defaultOptions.logLevel)
            .choices(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silly'])
    );
    command.option('-s, --src-chain-rpc-host <url>', 'url of src chain rpc');
    command.option('-t, --target-chain-rpc-url <url>', 'url of target chain rpc');
    command.option('-c, --config-file <path>', 'path to the config file', DEFAULT_CONFIG_FILE_PATH);
    command.option('--connection-timeout <timeout>', 'connection timeout in ms');
    command.option('--src-blocknr <number>', 'block number of src chain to use');
    command.option('--relay-contract-address <address>', 'Contract address of relay contract');
    return command;
}

function overrideOptions<T>(filePath: string, options: ConfigTypish): T {
    const fileHandler = new FileHandler(filePath);
    let newOptions: T | undefined = fileHandler.getJSON<T>();
    if (!newOptions) {
        logger.fatal(`Given filepath ${filePath} does not lead to a config file.`);
        process.exit(-1);
    }

    return Object.assign(newOptions, options) as T;
}

interface GeneralOptions {
    srcChainUrl: string;
    targetChainUrl: string;
    connectionTimeout?: string;
    logLevel?: TLogLevelName;
    srcBlocknr?: string;
    targetBlocknr?: string;
    configFile: string;
}

interface TxContractInteractionOptions extends ViewContractInteractionOptions {
    diffMode?: string;
    gasLimit?: string;
}

interface ViewContractInteractionOptions extends GeneralOptions {
    relayContractAddress: string;
}

type ConfigTypish = GeneralOptions | TxContractInteractionOptions | ViewContractInteractionOptions;