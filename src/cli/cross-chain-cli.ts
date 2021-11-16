#!/usr/bin/env node

import { BigNumber } from '@ethersproject/bignumber';
import { ConnectionInfo } from '@ethersproject/web';
import { Command, Option } from 'commander';
import { TLogLevelName } from 'tslog';
import * as CRON from 'node-cron';
import { SIGTERM } from 'constants';
import * as CliProgress from 'cli-progress';
import {
    ChainProxy, ContractAddressMap, RPCConfig, GetDiffMethod,
} from '../chain-proxy';
import FileHandler from '../utils/fileHandler';
import { logger } from '../utils/logger';
import { isDebug, toBlockNumber } from '../utils/utils';

const DEFAULT_CONFIG_FILE_PATH = `${__dirname}/../../config/cli-config.json`;
const program = new Command();

interface GeneralOptions {
    srcChainRpcUrl: string;
    targetChainRpcUrl: string;
    connectionTimeout?: string;
    logLevel?: TLogLevelName;
    srcBlocknr?: string;
    targetBlocknr?: string;
    configFile: string;
}

interface ViewContractInteractionOptions extends GeneralOptions {
    relayContractAddress: string;
}

export interface TxContractInteractionOptions extends ViewContractInteractionOptions {
    diffMode?: string;
    gasLimit?: string;
    batchSize?: string;
    batchPerSynch?: string;
    targetAccountEncryptedJson?: string;
    targetAccountPassword?: string;
    blockBatchSize?: string;
    keyValuePairPerBatch?: string;
}

export type ConfigTypish = GeneralOptions | TxContractInteractionOptions | ViewContractInteractionOptions;

// get options from config to insert them as default
const fileHandler = new FileHandler(DEFAULT_CONFIG_FILE_PATH);
let defaultOptions: ConfigTypish | any | undefined = fileHandler.getJSON<ConfigTypish>();
if (!defaultOptions) {
    defaultOptions = {};
}

function commonOptions(command: Command): Command {
    if (!defaultOptions) {
        defaultOptions = {};
    }

    // todo add options and insert default values from config file
    command.addOption(
        new Option('-l, --log-level <level>', 'verbose level of logging')
            .default(defaultOptions.logLevel)
            .choices(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silly']),
    );
    command.option('-s, --src-chain-rpc-url <url>', 'URL of src chain rpc.');
    command.option('-t, --target-chain-rpc-url <url>', 'URL of target chain rpc.');
    command.option('-c, --config-file <path>', 'path to the config file', DEFAULT_CONFIG_FILE_PATH);
    command.option('--connection-timeout <timeout>', 'connection timeout in ms');
    command.option('--src-blocknr <number>', 'block number of src chain to use');
    return command;
}

/**
 *
 * @param filePath path to config file that needs to be extracted
 * @param options config object that overrides the config file
 * @returns config object
 */
function overrideFileOptions<T>(filePath: string, options: ConfigTypish): T {
    const fh = new FileHandler(filePath);
    const newOptions: T | undefined = fh.getJSON<T>();
    if (!newOptions) {
        logger.fatal(`Given filepath ${filePath} does not lead to a config file.`);
        process.exit(-1);
    }

    return Object.assign(newOptions, options) as T;
}

// general information
program
    .version('0.2.0')
    .description('cross chain contracts CLI');

// continuous state update command
let continuousSynch: Command = program.command('continuous-synch') as Command;
continuousSynch = commonOptions(continuousSynch);
continuousSynch
    .alias('c')
    .description('Periodically synch state updates.')
    .argument('<proxy_contract_address>')
    .argument('<period>', 'Define the updating period. Be sure to pass the period within " (Example: "*/2 * * * *"). The crontab syntax is based on the GNU crontab syntax. For information visit https://www.npmjs.com/package/node-cron.')
    .option('--gas-limit <limit>')
    .addOption(
        new Option('--diff-mode <mode>', 'Diff function to use. When using storage, option --src-BlockNr equals block on srcChain and --target-BlockNr block on targetChain. When using srcTx --src-BlockNr describes block from where to replay tx until --target-blockNr.')
            .choices(['storage', 'srcTx', 'getProof'])
            .default('srcTx'),
    )
    .option('--target-blocknr <number>', 'see --diff-mode for further explanation')
    .option('-b, --batch-size <number>', 'Define how many blocks/txs should be pulled at once', '50')
    .option('--block-batch-size <number>', 'Block counter how many blocks should be synched at once', Number.MAX_SAFE_INTEGER.toString())
    .option('--target-account-encrypted-json <file_path>', 'Encrypted json file path of account to use at target chain to sign txs')
    .option('--target-account-password <target_account_password', 'Password to decrypt account json file')
    .action(async (proxyContract: string, period: string, options: TxContractInteractionOptions) => {
        if (!CRON.validate(period)) {
            logger.error(`No valid period given (${period}). See --help for more information (description of argument period)`);
            process.exit(-1);
        }
        let adjustedOptions = options;
        // override options here if config file was added
        if (adjustedOptions.configFile) {
            adjustedOptions = overrideFileOptions<TxContractInteractionOptions>(adjustedOptions.configFile, adjustedOptions);
        }
        if (!adjustedOptions.targetAccountEncryptedJson || !adjustedOptions.targetAccountPassword) {
            logger.error('No target account given for signing txs.');
            process.exit(-1);
        }
        logger.setSettings({ minLevel: adjustedOptions.logLevel });

        const contractAddressMap: ContractAddressMap = {
            proxyContract,
        };
        const srcConnectionInfo: ConnectionInfo = {
            url: adjustedOptions.srcChainRpcUrl,
            timeout: BigNumber.from(adjustedOptions.connectionTimeout).toNumber(),
        };
        const targetConnectionInfo: ConnectionInfo = {
            url: adjustedOptions.targetChainRpcUrl,
            timeout: BigNumber.from(adjustedOptions.connectionTimeout).toNumber(),
        };
        const targetRPCConfig: RPCConfig = {
            gasLimit: adjustedOptions.gasLimit,
            blockNr: adjustedOptions.targetBlocknr,
            targetAccountEncryptedJsonPath: adjustedOptions.targetAccountEncryptedJson,
            targetAccountPassword: adjustedOptions.targetAccountPassword,
        };
        const srcRPCConfig: RPCConfig = {
            blockNr: adjustedOptions.srcBlocknr,
        };
        const batchSize = adjustedOptions.batchSize ? BigNumber.from(adjustedOptions.batchSize).toNumber() : 50;
        const blockBatchSize = adjustedOptions.blockBatchSize ? BigNumber.from(adjustedOptions.blockBatchSize) : BigNumber.from(Number.MAX_SAFE_INTEGER.toString());

        const chainProxy = new ChainProxy(contractAddressMap, srcConnectionInfo, srcRPCConfig, targetConnectionInfo, targetRPCConfig, batchSize);
        await chainProxy.init();

        adjustedOptions.srcBlocknr = adjustedOptions.srcBlocknr !== undefined ? BigNumber.from(await toBlockNumber(adjustedOptions.srcBlocknr, chainProxy.srcProvider)).toString() : (await chainProxy.getCurrentBlockNumber()).add(1).toString();
        if (adjustedOptions.diffMode === 'srcTx') {
            adjustedOptions.targetBlocknr = adjustedOptions.targetBlocknr !== undefined ? BigNumber.from(await toBlockNumber(adjustedOptions.targetBlocknr, chainProxy.srcProvider)).toString() : BigNumber.from(await toBlockNumber('latest', chainProxy.srcProvider)).toString();
        } else {
            adjustedOptions.targetBlocknr = adjustedOptions.targetBlocknr !== undefined ? BigNumber.from(await toBlockNumber(adjustedOptions.targetBlocknr, chainProxy.targetProvider)).toString() : BigNumber.from(await toBlockNumber('latest', chainProxy.targetProvider)).toString();
        }

        // if cli is called as a child process, this will be used to kill it.
        process.on('message', (m) => {
            if (m === SIGTERM) {
                process.exit(0);
            }
        });

        // todo adjust batches according to gas estimation and gas-limit
        CRON.schedule(period, async () => {
            // do synch
            let srcBlock = adjustedOptions.diffMode !== 'srcTx' ? BigNumber.from(1) : BigNumber.from(adjustedOptions.srcBlocknr);
            const targetBlock = adjustedOptions.diffMode !== 'srcTx' ? BigNumber.from(2) : BigNumber.from(adjustedOptions.targetBlocknr);
            let batchProgress: CliProgress.SingleBar | undefined;
            if (!isDebug(logger.settings.minLevel)) {
                batchProgress = new CliProgress.SingleBar({}, CliProgress.Presets.shades_classic);
                batchProgress.start(targetBlock.sub(srcBlock).toNumber(), 0);
            }
            do {
                // eslint-disable-next-line no-await-in-loop
                const changedKeys = await chainProxy.getDiff((adjustedOptions.diffMode ?? 'srcTx') as GetDiffMethod, { srcBlock: adjustedOptions.srcBlocknr, targetBlock: adjustedOptions.targetBlocknr });
                if (!changedKeys) {
                    logger.error('Could not get changed keys');
                    return;
                }

                // eslint-disable-next-line no-await-in-loop
                const synchronized = await chainProxy.migrateChangesToProxy(changedKeys.getKeys(), (adjustedOptions.diffMode === 'srcTx') ? adjustedOptions.targetBlocknr : adjustedOptions.srcBlocknr);
                if (synchronized) {
                    logger.info('Synchronization of the following keys successful:', changedKeys.getKeys());
                } else {
                    logger.error('Could not synch changes.');
                }
                const synchronizedBlockAmount = blockBatchSize.gt(targetBlock.sub(srcBlock)) ? targetBlock.sub(srcBlock).toNumber() : blockBatchSize.toNumber();
                batchProgress?.increment(synchronizedBlockAmount);
                srcBlock = srcBlock.add(synchronizedBlockAmount);
            } while (adjustedOptions.diffMode !== 'srcTx' && targetBlock.gt(srcBlock));
            batchProgress?.stop();

            // update compared blocks
            adjustedOptions.srcBlocknr = adjustedOptions.diffMode === 'srcTx' ? (await chainProxy.getCurrentBlockNumber()).add(1).toString() : 'latest';
            adjustedOptions.targetBlocknr = adjustedOptions.diffMode === 'srcTx' ? BigNumber.from(await toBlockNumber('latest', chainProxy.srcProvider)).toString() : 'latest';
        });
    });

// fork command
let fork: Command = program.command('fork') as Command;
fork = commonOptions(fork);
fork
    .alias('f')
    .description('Migrates a given contract address to a target chain and deploys a proxy contract. If no relay contract is provided, a relay contract will be deployed too.')
    .arguments('<src_contract_address> [relay_contract_address]')
    .option('--gas-limit <limit>', 'gas limit for tx on target chain')
    .option('--target-account-encrypted-json <file_path>', 'Encrypted json file path of account to use at target chain to sign txs')
    .option('--target-account-password <target_account_password', 'Password to decrypt account json file')
    .action(async (srcContract: string, relayContractAddress: string | undefined, options: TxContractInteractionOptions) => {
        let adjustedOptions = options;
        // override options here if config file was added
        if (adjustedOptions.configFile) {
            adjustedOptions = overrideFileOptions<TxContractInteractionOptions>(adjustedOptions.configFile, adjustedOptions);
        }
        if (!adjustedOptions.targetAccountEncryptedJson || !adjustedOptions.targetAccountPassword) {
            logger.error('No target account given for signing txs.');
            process.exit(-1);
        }
        logger.setSettings({ minLevel: adjustedOptions.logLevel });

        const contractAddressMap: ContractAddressMap = {
            srcContract,
            relayContract: relayContractAddress || adjustedOptions.relayContractAddress,
        };
        const srcConnectionInfo: ConnectionInfo = {
            url: adjustedOptions.srcChainRpcUrl,
            timeout: BigNumber.from(adjustedOptions.connectionTimeout).toNumber(),
        };
        const targetConnectionInfo: ConnectionInfo = {
            url: adjustedOptions.targetChainRpcUrl,
            timeout: BigNumber.from(adjustedOptions.connectionTimeout).toNumber(),
        };
        const targetRPCConfig: RPCConfig = {
            gasLimit: adjustedOptions.gasLimit,
            blockNr: adjustedOptions.targetBlocknr,
            targetAccountEncryptedJsonPath: adjustedOptions.targetAccountEncryptedJson,
            targetAccountPassword: adjustedOptions.targetAccountPassword,
        };
        const srcRPCConfig: RPCConfig = {
            blockNr: adjustedOptions.srcBlocknr,
        };
        const chainProxy = new ChainProxy(contractAddressMap, srcConnectionInfo, srcRPCConfig, targetConnectionInfo, targetRPCConfig);
        await chainProxy.init();
        // todo check for return value
        const migrated = await chainProxy.migrateSrcContract(adjustedOptions.srcBlocknr, adjustedOptions.keyValuePairPerBatch ? BigNumber.from(adjustedOptions.keyValuePairPerBatch).toNumber() : undefined);
        if (migrated) {
            logger.info('Migration successfull.');
        } else {
            logger.error('Could not migrate source contract.');
        }
    });

let migrationStatus = program.command('migration-status') as Command;
migrationStatus = commonOptions(migrationStatus);
migrationStatus
    .alias('status')
    .description('Checks if the storage root of the proxy contract equals the current storage root of the source contract in the relay contract on the target chain.')
    .arguments('<proxy_contract_address>')
    .action(async (proxyContractAddress: string, options: TxContractInteractionOptions) => {
        let adjustedOptions = options;
        // override options here if config file was added
        if (adjustedOptions.configFile) {
            adjustedOptions = overrideFileOptions<TxContractInteractionOptions>(adjustedOptions.configFile, adjustedOptions);
        }
        logger.setSettings({ minLevel: adjustedOptions.logLevel });

        const contractAddressMap: ContractAddressMap = {
            proxyContract: proxyContractAddress,
        };
        const srcConnectionInfo: ConnectionInfo = {
            url: adjustedOptions.srcChainRpcUrl,
            timeout: BigNumber.from(adjustedOptions.connectionTimeout).toNumber(),
        };
        const targetConnectionInfo: ConnectionInfo = {
            url: adjustedOptions.targetChainRpcUrl,
            timeout: BigNumber.from(adjustedOptions.connectionTimeout).toNumber(),
        };
        const targetRPCConfig: RPCConfig = {
            gasLimit: adjustedOptions.gasLimit,
            blockNr: adjustedOptions.targetBlocknr,
            targetAccountEncryptedJsonPath: adjustedOptions.targetAccountEncryptedJson,
            targetAccountPassword: adjustedOptions.targetAccountPassword,
        };
        const srcRPCConfig: RPCConfig = {
            blockNr: adjustedOptions.srcBlocknr,
        };
        const chainProxy = new ChainProxy(contractAddressMap, srcConnectionInfo, srcRPCConfig, targetConnectionInfo, targetRPCConfig);
        await chainProxy.init();

        logger.info(`migration-status: ${chainProxy.migrationState}`);
    });

let getCurrBlockNumber = program.command('get-curr-blocknr') as Command;
getCurrBlockNumber = commonOptions(getCurrBlockNumber);
getCurrBlockNumber
    .alias('blocknr')
    .description('Get the synched block number of src chain for the provided proxy contract.')
    .arguments('<proxy_contract_address>')
    .action(async (proxyContractAddress: string | undefined, options: TxContractInteractionOptions) => {
        let adjustedOptions = options;
        // override options here if config file was added
        if (adjustedOptions.configFile) {
            adjustedOptions = overrideFileOptions<TxContractInteractionOptions>(adjustedOptions.configFile, adjustedOptions);
        }
        logger.setSettings({ minLevel: adjustedOptions.logLevel });

        const contractAddressMap: ContractAddressMap = {
            proxyContract: proxyContractAddress,
        };
        const srcConnectionInfo: ConnectionInfo = {
            url: adjustedOptions.srcChainRpcUrl,
            timeout: BigNumber.from(adjustedOptions.connectionTimeout).toNumber(),
        };
        const targetConnectionInfo: ConnectionInfo = {
            url: adjustedOptions.targetChainRpcUrl,
            timeout: BigNumber.from(adjustedOptions.connectionTimeout).toNumber(),
        };
        const targetRPCConfig: RPCConfig = {
            gasLimit: adjustedOptions.gasLimit,
            blockNr: adjustedOptions.targetBlocknr,
            targetAccountEncryptedJsonPath: adjustedOptions.targetAccountEncryptedJson,
            targetAccountPassword: adjustedOptions.targetAccountPassword,
        };
        const srcRPCConfig: RPCConfig = {
            blockNr: adjustedOptions.srcBlocknr,
        };
        const chainProxy = new ChainProxy(contractAddressMap, srcConnectionInfo, srcRPCConfig, targetConnectionInfo, targetRPCConfig);
        await chainProxy.init();
        const latestBlockNumber = await chainProxy.getCurrentBlockNumber();
        logger.info(`Current synched block number: ${latestBlockNumber.toNumber()}`);
    });

let stateDiff = program.command('state-diff') as Command;
stateDiff = commonOptions(stateDiff);
stateDiff
    .alias('diff')
    .arguments('<source_contract_address> [proxy_contract_address]')
    .description('Shows the state diff between source contract and proxy contract on target chain. If diff-mode == storage, proxy_contract_address has to be provided.')
    .addOption(
        new Option('--diff-mode <mode>', 'Diff function to use. When using storage, option --src-BlockNr equals block on srcChain and --target-BlockNr block on targetChain. When using srcTx --src-BlockNr describes block from where to replay tx until --target-blockNr. If no blocks are given when using srcTx, then only the latest block is examined.')
            .choices(['storage', 'srcTx', 'getProof'])
            .default('srcTx'),
    )
    .option('-b, --batch-size <number>', 'Define how many blocks/txs should be pulled at once', '50')
    .option('--target-blocknr <number>', 'see --diff-mode for further explanation')
    .action(async (srcContractAddress: string, proxyContractAddress: string | undefined, options: TxContractInteractionOptions) => {
        let adjustedOptions = options;
        // override options here if config file was added
        if (adjustedOptions.configFile) {
            adjustedOptions = overrideFileOptions<TxContractInteractionOptions>(adjustedOptions.configFile, adjustedOptions);
        }
        logger.setSettings({ minLevel: adjustedOptions.logLevel });

        const contractAddressMap: ContractAddressMap = {
            srcContract: srcContractAddress,
            proxyContract: proxyContractAddress,
        };
        const srcConnectionInfo: ConnectionInfo = {
            url: adjustedOptions.srcChainRpcUrl,
            timeout: BigNumber.from(adjustedOptions.connectionTimeout).toNumber(),
        };
        const targetConnectionInfo: ConnectionInfo = {
            url: adjustedOptions.targetChainRpcUrl,
            timeout: BigNumber.from(adjustedOptions.connectionTimeout).toNumber(),
        };
        const targetRPCConfig: RPCConfig = {
            gasLimit: adjustedOptions.gasLimit,
            blockNr: adjustedOptions.targetBlocknr,
            targetAccountEncryptedJsonPath: adjustedOptions.targetAccountEncryptedJson,
            targetAccountPassword: adjustedOptions.targetAccountPassword,
        };
        const srcRPCConfig: RPCConfig = {
            blockNr: adjustedOptions.srcBlocknr,
        };
        const batchSize = adjustedOptions.batchSize ? BigNumber.from(adjustedOptions.batchSize).toNumber() : 50;
        const chainProxy = new ChainProxy(contractAddressMap, srcConnectionInfo, srcRPCConfig, targetConnectionInfo, targetRPCConfig, batchSize);
        if (adjustedOptions.diffMode === 'srcTx') {
            await chainProxy.init();
        } else {
            await chainProxy.lightInit();
        }

        const diff = await chainProxy.getDiff((adjustedOptions.diffMode ?? 'srcTx') as GetDiffMethod, { srcBlock: adjustedOptions.srcBlocknr, targetBlock: adjustedOptions.targetBlocknr });

        if (diff === undefined) return;
        logger.info('Adds:', diff.adds().map((add) => ({ key: add.key, value: add.value })));
        logger.info('Changes:', diff.changes().map((change) => ({ key: change.key, srcValue: change.srcValue, targetValue: change.targetValue })));
        logger.info('Deletions:', diff.removes().map((remove) => ({ key: remove.key, value: remove.value })));
    });

let synchronize: Command = program.command('synchronize') as Command;
synchronize = commonOptions(synchronize);
synchronize
    .alias('s')
    .description('Synchronizes the storage of a proxy contract with its source contracts storage up to an optionally provided block nr on the source chain.')
    .arguments('<proxy_contract_address>')
    .addOption(
        new Option('--diff-mode <mode>', 'Diff function to use. When using storage, option --src-BlockNr equals block on srcChain and --target-BlockNr block on targetChain. When using srcTx --src-BlockNr describes block from where to replay tx until --target-blockNr.')
            .choices(['storage', 'srcTx', 'getProof'])
            .default('srcTx'),
    )
    .option('--target-blocknr <number>', 'see --diff-mode for further explanation')
    .option('--gas-limit <limit>', 'gas limit for tx on target chain')
    .option('-b, --batch-size <number>', 'Define how many blocks/txs should be pulled at once', '50')
    .option('--block-batch-size <number>', 'Block counter how many blocks should be synched at once', Number.MAX_SAFE_INTEGER.toString())
    .option('--target-account-encrypted-json <file_path>', 'Encrypted json file path of account to use at target chain to sign txs')
    .option('--target-account-password <target_account_password', 'Password to decrypt account json file')
    .action(async (proxyContract: string, options: TxContractInteractionOptions) => {
        let adjustedOptions = options;
        // override options here if config file was added
        if (adjustedOptions.configFile) {
            adjustedOptions = overrideFileOptions<TxContractInteractionOptions>(adjustedOptions.configFile, adjustedOptions);
        }
        if (!adjustedOptions.targetAccountEncryptedJson || !adjustedOptions.targetAccountPassword) {
            logger.error('No target account given for signing txs.');
            process.exit(-1);
        }
        logger.setSettings({ minLevel: adjustedOptions.logLevel });
        const contractAddressMap: ContractAddressMap = {
            proxyContract,
        };
        const srcConnectionInfo: ConnectionInfo = {
            url: adjustedOptions.srcChainRpcUrl,
            timeout: BigNumber.from(adjustedOptions.connectionTimeout).toNumber(),
        };
        const targetConnectionInfo: ConnectionInfo = {
            url: adjustedOptions.targetChainRpcUrl,
            timeout: BigNumber.from(adjustedOptions.connectionTimeout).toNumber(),
        };
        const targetRPCConfig: RPCConfig = {
            gasLimit: adjustedOptions.gasLimit,
            blockNr: adjustedOptions.targetBlocknr,
            targetAccountEncryptedJsonPath: adjustedOptions.targetAccountEncryptedJson,
            targetAccountPassword: adjustedOptions.targetAccountPassword,
        };
        const srcRPCConfig: RPCConfig = {
            blockNr: undefined,
        };
        const batchSize = adjustedOptions.batchSize ? BigNumber.from(adjustedOptions.batchSize).toNumber() : 50;

        const chainProxy = new ChainProxy(contractAddressMap, srcConnectionInfo, srcRPCConfig, targetConnectionInfo, targetRPCConfig, batchSize);
        await chainProxy.init();

        // prepare for possible batch synch
        if (adjustedOptions.blockBatchSize !== Number.MAX_SAFE_INTEGER.toString() && adjustedOptions.diffMode === 'storage') {
            logger.error('The option blockBatchSize is not supported with diffmode storage.');
            process.exit(-1);
        } else if (adjustedOptions.diffMode === 'srcTx') {
            adjustedOptions.targetBlocknr = adjustedOptions.targetBlocknr !== undefined ? BigNumber.from(await toBlockNumber(adjustedOptions.targetBlocknr, chainProxy.srcProvider)).toString() : BigNumber.from(await toBlockNumber('latest', chainProxy.srcProvider)).toString();
        } else {
            adjustedOptions.targetBlocknr = adjustedOptions.targetBlocknr !== undefined ? BigNumber.from(await toBlockNumber(adjustedOptions.targetBlocknr, chainProxy.targetProvider)).toString() : BigNumber.from(await toBlockNumber('latest', chainProxy.targetProvider)).toString();
        }
        adjustedOptions.srcBlocknr = adjustedOptions.srcBlocknr !== undefined ? BigNumber.from(await toBlockNumber(adjustedOptions.srcBlocknr, chainProxy.srcProvider)).toString() : (await chainProxy.getCurrentBlockNumber()).add(1).toString();

        // todo add test for batching blocks
        const blockBatchSize = adjustedOptions.blockBatchSize ? BigNumber.from(adjustedOptions.blockBatchSize) : BigNumber.from(Number.MAX_SAFE_INTEGER.toString());

        // do synch
        let srcBlock = BigNumber.from(adjustedOptions.srcBlocknr);
        const targetBlock = BigNumber.from(adjustedOptions.targetBlocknr);
        let batchProgress: CliProgress.SingleBar | undefined;
        if (!isDebug(logger.settings.minLevel)) {
            batchProgress = new CliProgress.SingleBar({}, CliProgress.Presets.shades_classic);
            batchProgress.start(targetBlock.sub(srcBlock).toNumber(), 0);
        }
        do {
            // eslint-disable-next-line no-await-in-loop
            const changedKeys = await chainProxy.getDiff((adjustedOptions.diffMode ?? 'srcTx') as GetDiffMethod, { srcBlock: adjustedOptions.srcBlocknr, targetBlock: adjustedOptions.targetBlocknr });
            if (!changedKeys) {
                logger.error('Could not get changed keys');
                return;
            }

            // eslint-disable-next-line no-await-in-loop
            const synchronized = await chainProxy.migrateChangesToProxy(changedKeys.getKeys(), (adjustedOptions.diffMode === 'srcTx') ? adjustedOptions.targetBlocknr : adjustedOptions.srcBlocknr);
            if (synchronized) {
                logger.info('Synchronization of the following keys successful:', changedKeys.getKeys());
            } else {
                logger.error('Could not synch changes.');
            }
            batchProgress?.increment(blockBatchSize.gt(targetBlock.sub(srcBlock)) ? targetBlock.sub(srcBlock).toNumber() : blockBatchSize.toNumber());
            srcBlock = srcBlock.add(blockBatchSize);
        } while (adjustedOptions.diffMode !== 'srcTx' && targetBlock.gt(srcBlock));
        batchProgress?.stop();
    });

program
    .parse(process.argv);
