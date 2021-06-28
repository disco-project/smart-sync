import { BigNumberish, ethers} from "ethers";
import { network } from "hardhat";
import { HttpNetworkConfig } from "hardhat/types";
import * as rlp from "rlp";
import * as fs from 'fs';
import { logger } from "./logger";
import { Block, TransactionResponse, TransactionReceipt } from '@ethersproject/abstract-provider';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Input } from 'rlp';

const BLOCKNUMBER_TAGS = ["latest", "earliest", "pending"];

export namespace EVMOpcodes {
    export const contractByteCodeDeploymentPreamble = '608060405234801561001057600080fd5b50';
    export const PUSH1 = '60';
    export const DUP1 = '80';
    export const CODECOPY = '39';
    export const RETURN = 'F3';
    export const STOP = '00';
    export const SSTORE = '55';
}

export function toParityQuantity(val: BigNumberish): string {
    if (typeof(val) === 'string' && BLOCKNUMBER_TAGS.indexOf(val) > -1) {
        return val;
    }
    return ethers.BigNumber.from(val).toHexString();
}

export async function toBlockNumber(val: BigNumberish, provider: JsonRpcProvider = new ethers.providers.JsonRpcProvider((network.config as HttpNetworkConfig).url)): Promise<number> {
    if (typeof(val) === 'string' && BLOCKNUMBER_TAGS.indexOf(val) > -1) {
        return (await provider.getBlock(val)).number;
    } 
    try { 
        return ethers.BigNumber.from(val).toNumber();
    } catch(e) {
        logger.error(`Given val (${val}) is not a valid block identifier.`);
        logger.error(e);
        throw new Error();
    }
}

export function encode(input: Input): Buffer {
    return (input === '0x0')
        ? rlp.encode(Buffer.alloc(0))
        : rlp.encode(input)
}

export function hexlify(input: string): string {
    const val = ethers.utils.hexlify(input);
    return (val === '0x') ? "0x0" : val;
}

// binary search for block where contract was deployed
export async function findDeploymentBlock(contract_address: string, provider: JsonRpcProvider = new ethers.providers.JsonRpcProvider((network.config as HttpNetworkConfig).url)): Promise<number> {
    let low: number = 0;
    let high: number = await provider.getBlockNumber();

    let mid: number;
    while (low <= high) {
        mid = Math.trunc((low + high) / 2);

        const curr_code = await provider.getCode(contract_address, mid);
        // return mid if the smart contract was deployed on that block (previousBlock.getCode(smartContract) === none)
        if (curr_code.length > 3 && (mid === 0 || (await provider.getCode(contract_address, mid - 1)).length < 4) ) return mid;
        
        else if (curr_code.length > 3) high = mid - 1;
        
        else low = mid + 1;
    }

    return -1;
};

/**
 *
 * @param address The address of the contract
 * @param provider The provider to use when sending an RPC request
 * @param blockNum the block number to retrieve the storage keys from
 * @param batchSize how many keys to retrieve per request [parity_liststoragekeys](https://openethereum.github.io/JSONRPC-parity-module#parity_liststoragekeys)
 * @returns all the storage keys of the contract with `address` at block `blockNum`
 */
export async function getAllKeys(contractAddress: string, provider = new ethers.providers.JsonRpcProvider((network.config as HttpNetworkConfig).url), blockNum: number | string = "latest", batchSize: number = 50): Promise<BigNumberish[]> {
    let keys: Array<BigNumberish> = [];
    let batch: Array<BigNumberish> = [];
    let batchCounter = 1;
    blockNum = toParityQuantity(blockNum);

    do {
        let offset = (batchCounter > 1) ? keys[keys.length - 1] : null;

        batch = await provider.send("parity_listStorageKeys", [
            contractAddress, batchSize * batchCounter, offset, blockNum
        ]);
        keys.push(...batch);
        batchCounter += 1;
    } while (batch.length >= batchSize);
    return keys;
}

export class FileHandler {
    private filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
        try {
            if (!fs.statSync(this.filePath).isFile) {
                logger.error(`Given filePath ${this.filePath} does not lead to a file`);
            }
        } catch(e) {
            logger.error(e);
        }
    }

    getJSON<T>(): T | undefined {
        try {
            return JSON.parse(this.read() ?? '{}');
        } catch (e) {
            logger.error(e);
            return undefined;
        }
    }

    read(): string | undefined {
        try {
            return fs.readFileSync(this.filePath).toString('utf-8');
        } catch (e) {
            logger.error(e);
            return undefined;
        }
    }
}

export class TransactionHandler {
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
        let i = 0;
        for (const tx of txs) {
            const txStorage = await this.replayTransaction(tx, i++);
            if (txStorage) {
                logger.debug('srcTx txStorage: ', txStorage);

                for (const key in txStorage) {
                    if (!(txStorage[key] === '0x0000000000000000000000000000000000000000000000000000000000000000')) {
                        contractStorage[key] = txStorage[key];
                    }
                }
            }
        }

        return contractStorage;
    }

    async replayTransaction(transaction: string, id: number): Promise<undefined | { [ key: string ]: string }> {
        try {
            const response: ParityResponseData = await this.provider.send('trace_replayTransaction', [transaction, ['stateDiff']]);
            // Ensure the state has been changed
            if (response.stateDiff.hasOwnProperty(this.contractAddress.toLowerCase())) {
                const tx = response.stateDiff[this.contractAddress.toLowerCase()];
                logger.debug('tx: ', transaction);
                if (tx) {
                    const txStorage = tx.storage;
                    const keys = Object.keys(txStorage);
                    let obj: { [ key: string ]: string } = {};
                    keys.forEach(key => {
                        // First case: normal tx
                        // Second case: deploying tx
                        let keyObject: KeyObject = txStorage[key];
                        if(keyObject['*'] !== undefined)
                            obj[key] = keyObject['*'].to;
                        else if (keyObject['+'] !== undefined)
                            obj[key] = keyObject['+']
                    });
                    return obj;
                }
            }
            logger.debug(id, ' closed');
        } catch(err) {
            logger.error(err);
        }
        return undefined;
    };
    
    async getTransactions(latest_block_number: number | string, earliest_block_number?: number | string): Promise<Array<string>> {
        logger.debug('Called getTransactions');
        const contract_address: string = this.contractAddress.toUpperCase();
        let relatedTransactions: Array<string> = [];
        if (typeof(latest_block_number) === 'string')
            latest_block_number = await toBlockNumber(latest_block_number);
        
        // first find deployment block for more efficiently
        earliest_block_number = earliest_block_number ? earliest_block_number : await findDeploymentBlock(this.contractAddress);
        earliest_block_number = earliest_block_number === 'earliest' ? await findDeploymentBlock(this.contractAddress) : earliest_block_number;
        if (typeof(earliest_block_number) === 'string')
            earliest_block_number = await toBlockNumber(earliest_block_number);
        
        if (latest_block_number < earliest_block_number) {
            logger.debug('Given latest block number older than earliest block number.');
            return [];
        }

        // gather all transactions
        for(let i = earliest_block_number; i <= latest_block_number; i++) {
            const block: Block = await this.provider.getBlock(i);
            const transactions: Array<string> = block.transactions;
    
            for (const txHash of transactions) {
                const tx: TransactionResponse = await this.provider.getTransaction(txHash);
                if(tx.to) {
                    if(tx.to.toUpperCase() === contract_address) {
                        relatedTransactions.push(txHash);
                    }
                } else {
                    const receipt: TransactionReceipt = await this.provider.getTransactionReceipt(txHash);
                    if(receipt.contractAddress && receipt.contractAddress.toUpperCase() === contract_address) {
                        relatedTransactions.push(txHash);
                        logger.debug('receipt address: ', receipt.contractAddress);
                    }
                }
            }
        }
        return relatedTransactions;
    }

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

type KeyObject = {
    '*'?: {
        'to': string
    },
    '+'?: string
}