import { Block, TransactionResponse, TransactionReceipt } from '@ethersproject/abstract-provider';
import { JsonRpcProvider } from '@ethersproject/providers';
import { ethers } from 'ethers';
import { network } from 'hardhat';
import { HttpNetworkConfig } from 'hardhat/types';
import { logger } from './logger';
import { findDeploymentBlock, toBlockNumber } from './utils';

type KeyObject = {
    '*'?: {
        'to': string
    },
    '+'?: string
}

export type ParityResponseData = {
    stateDiff: {
        [ contract_address: string ]: {
            storage: {
                [ key: string ] : KeyObject
            }
        };
    }
}

class TransactionHandler {
    private contractAddress: string;

    private provider: JsonRpcProvider;

    constructor(contractAddress: string, provider = new ethers.providers.JsonRpcProvider((network.config as HttpNetworkConfig).url)) {
        this.contractAddress = contractAddress;
        this.provider = provider;
    }

    async getContractStorageFromTxs(latestBlockNumber: string | number = 'latest', earliest_block_number?: string | number): Promise<{ [ key: string ]: string }> {
        const txs = await this.getTransactions(latestBlockNumber, earliest_block_number);
        const contractStorage: { [key: string]: string } = {};

        // getting all tx from srcAddress
        const txStorages = await Promise.all(txs.map((tx, index) => this.replayTransaction(tx, index)));
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

    async replayTransaction(transaction: string, id: number): Promise<undefined | { [ key: string ]: string }> {
        try {
            const response: ParityResponseData = await this.provider.send('trace_replayTransaction', [transaction, ['stateDiff']]);
            // Ensure the state has been changed

            if (Object.prototype.hasOwnProperty.call(response.stateDiff, this.contractAddress.toLowerCase())) {
                const tx = response.stateDiff[this.contractAddress.toLowerCase()];
                logger.debug('tx: ', transaction);
                if (tx) {
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
            logger.debug(id, ' closed');
        } catch (err) {
            logger.error(err);
        }
        return undefined;
    }

    async getTransactions(latest_block_number: number | string, earliest_block_number?: number | string): Promise<Array<string>> {
        logger.debug('Called getTransactions');
        const contract_address: string = this.contractAddress.toUpperCase();
        const relatedTransactions: Array<string> = [];
        let latest = latest_block_number;
        if (typeof (latest) === 'string') latest = await toBlockNumber(latest);

        // first find deployment block for more efficiency
        let earliest = (earliest_block_number && earliest_block_number !== 'earliest') ? earliest_block_number : await findDeploymentBlock(this.contractAddress);
        if (typeof (earliest) === 'string') earliest = await toBlockNumber(earliest);

        if (latest < earliest) {
            logger.debug('Given latest block number older than earliest block number.');
            return [];
        }

        // gather all transactions
        const blockPromises: Array<Promise<Block>> = [];
        for (let i = earliest; i <= latest; i += 1) {
            blockPromises.push(this.provider.getBlock(i));
        }

        const blocks = await Promise.all(blockPromises);
        const transactionPromises: Array<Promise<TransactionResponse>> = [];
        blocks.forEach(({ transactions }) => {
            transactions.forEach((txHash) => {
                transactionPromises.push(this.provider.getTransaction(txHash));
            });
        });

        const transactions = await Promise.all(transactionPromises);
        const receiptPromises: Array<Promise<TransactionReceipt>> = [];
        transactions.forEach((tx) => {
            if (tx.to) {
                if (tx.to.toUpperCase() === contract_address) {
                    relatedTransactions.push(tx.hash);
                }
            } else {
                receiptPromises.push(this.provider.getTransactionReceipt(tx.hash));
            }
        });

        const receipts = await Promise.all(receiptPromises);
        receipts.forEach((receipt) => {
            if (receipt.contractAddress && receipt.contractAddress.toUpperCase() === contract_address) {
                relatedTransactions.push(receipt.transactionHash);
                logger.debug('receipt address: ', receipt.contractAddress);
            }
        });

        return relatedTransactions;
    }
}

export default TransactionHandler;
