import { JsonRpcProvider } from '@ethersproject/providers';
import * as CliProgress from 'cli-progress';
import { logger } from './logger';
import {
    findDeploymentBlock, isDebug, toBlockNumber, toParityQuantity,
} from './utils';

type KeyObject = {
    '*'?: {
        'to': string
    },
    '+'?: string
};

export type ParityResponseData = {
    stateDiff: {
        [ contractAddress: string ]: {
            storage: {
                [ key: string ] : KeyObject
            }
        };
    }
};

class TransactionHandler {
    private contractAddress: string;

    private provider: JsonRpcProvider;

    private batch: number;

    constructor(contractAddress: string, provider: JsonRpcProvider, batch: number = 50) {
        this.contractAddress = contractAddress;
        this.provider = provider;
        this.batch = batch;
    }

    async getContractStorageFromTxs(latestBlockNumber: string | number = 'latest', earliest_block_number?: string | number): Promise<{ [ key: string ]: string }> {
        const txs = await this.getTransactions(latestBlockNumber, earliest_block_number);
        const contractStorage: { [key: string]: string } = {};

        // getting all tx from srcAddress
        const txStoragePromises: Array<Promise<undefined | { [ key: string ]: string }>> = [];
        let txStorages: Array<{ [ key: string ]: string } | undefined> = [];

        logger.debug(`Replaying ${txs.length} transactions...`);
        let replayBar: CliProgress.SingleBar | undefined;
        if (!isDebug(logger.settings.minLevel)) {
            replayBar = new CliProgress.SingleBar({}, CliProgress.Presets.shades_classic);
            replayBar.start(txs.length, 0);
        }
        while (txs.length > 0) {
            const currTx = txs.pop();
            if (currTx) {
                txStoragePromises.push(this.replayTransaction(currTx));
                if (txStoragePromises.length >= this.batch) {
                    // eslint-disable-next-line no-await-in-loop
                    txStorages = txStorages.concat(await Promise.all(txStoragePromises));
                    replayBar?.increment(this.batch);
                }
            }
        }
        replayBar?.stop();
        logger.debug('Done.');
        txStorages.forEach((storage) => {
            if (storage) {
                logger.debug('srcTx txStorage: ', storage);

                Object.entries(storage).forEach(([key, value]) => {
                    if (!key.match(/0x0{64}/)) contractStorage[key] = value;
                });
            }
        });

        return contractStorage;
    }

    async replayTransaction(transaction: string): Promise<undefined | { [ key: string ]: string }> {
        try {
            const response: ParityResponseData = await this.provider.send('trace_replayTransaction', [transaction, ['stateDiff']]);
            // Ensure the state has been changed

            if (Object.prototype.hasOwnProperty.call(response.stateDiff, this.contractAddress.toLowerCase())) {
                const tx = response.stateDiff[this.contractAddress.toLowerCase()];
                logger.debug('tx: ', transaction);
                if (tx) {
                    logger.debug(tx.storage);
                    const txStorage = tx.storage;
                    const keys = Object.keys(txStorage);
                    const obj: { [ key: string ]: string } = {};
                    keys.forEach((key) => {
                        // First case: normal tx
                        // Second case: deploying tx
                        const keyObject: KeyObject = txStorage[key];
                        if (keyObject['*'] !== undefined) obj[key] = keyObject['*'].to;
                        else if (keyObject['+'] !== undefined) obj[key] = keyObject['+'];
                    });
                    return obj;
                }
            }
        } catch (err) {
            logger.error(err);
        }
        return undefined;
    }

    async getTransactions(latest_block_number: number | string, earliest_block_number?: number | string): Promise<Array<string>> {
        logger.debug('Called getTransactions');
        let latest = latest_block_number;
        if (typeof (latest) === 'string') latest = await toBlockNumber(latest, this.provider);

        // first find deployment block for more efficiency
        let earliest = (earliest_block_number && earliest_block_number !== 'earliest') ? earliest_block_number : await findDeploymentBlock(this.contractAddress, this.provider);
        if (typeof (earliest) === 'string') earliest = await toBlockNumber(earliest, this.provider);

        if (latest < earliest) {
            logger.debug(`Given latest block number ${latest} older than earliest block number ${earliest}.`);
            return [];
        }

        // gather all transactions
        logger.info(`Getting all txs related to ${this.contractAddress} from ${latest - earliest + 1} blocks...`);
        const relatedTxs = await this.provider.send('trace_filter', [{ fromBlock: toParityQuantity(earliest), toBlock: toParityQuantity(latest), toAddress: [this.contractAddress] }]);
        logger.debug(`Got ${relatedTxs.length} related txs.`);
        logger.info('Done.');

        return [...new Set<string>(relatedTxs.map(({ transactionHash }) => transactionHash))];
    }
}

export default TransactionHandler;
