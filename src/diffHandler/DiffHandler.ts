import { ethers } from 'ethers';
import assert from 'assert';
import { JsonRpcProvider } from '@ethersproject/providers';
import { BigNumberish } from '@ethersproject/bignumber';
import {
    getAllKeys, toBlockNumber,
} from '../utils/utils';
import { logger } from '../utils/logger';
import TransactionHandler from '../utils/transactionHandler';
import StorageDiff from './StorageDiff';
import Remove from './Remove';
import Change from './Change';
import Add from './Add';
import { ProcessedParameters, StorageKeyDiff } from './Types';

async function processParameters(srcAddress: string, srcProvider: JsonRpcProvider, srcBlock?: string | number, targetAddress?: string, targetProvider?: JsonRpcProvider, targetBlock?: string | number): Promise<ProcessedParameters> {
    assert(ethers.utils.isAddress(srcAddress), 'contract address is not a valid address');

    if (targetAddress !== undefined && !ethers.utils.isAddress(targetAddress)) {
        throw new Error(`address ${targetAddress} is not a valid address`);
    } else if (targetAddress !== undefined && !targetProvider) {
        throw new Error('targetProvider needs to be defined');
    }

    const realTargetAddress = targetAddress ?? srcAddress;
    let realSrcBlock = srcBlock ?? 'latest';
    let realTargetBlock = targetBlock ?? 'latest';

    realSrcBlock = await toBlockNumber(realSrcBlock, srcProvider);
    if (targetProvider) realTargetBlock = await toBlockNumber(realTargetBlock, targetProvider);

    return {
        srcAddress,
        srcBlock: realSrcBlock,
        targetAddress: realTargetAddress,
        targetBlock: realTargetBlock,
    };
}

class DiffHandler {
    /**
     * The provider used to access the source chain
     * @private
     */
    private readonly srcProvider: JsonRpcProvider;

    /**
     * The provider used to access the target chain
     * @private
     */
    private readonly targetProvider: JsonRpcProvider;

    /**
     * How many keys to retrieve at once
     * @See [`eth_getProof`](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1186.md)
     * @private
     */
    private readonly batchSize: number;

    /**
     *
     * @param srcProvider an `ethers` JsonRpcProvider used to connect to the source chain
     * @param targetProvider an `ethers` JsonRpcProvider used to connect to the target chain
     * @param batchSize how many keys to retrieve per request [parity_liststoragekeys](https://openethereum.github.io/JSONRPC-parity-module#parity_liststoragekeys)
     */
    constructor(srcProvider: JsonRpcProvider, targetProvider: JsonRpcProvider = srcProvider, batchSize = 50) {
        this.srcProvider = srcProvider;
        this.targetProvider = targetProvider;
        this.batchSize = batchSize;
    }

    /**
     * Create a diff of the `srcAddress` and `targetAddress` storage between block `srcBlock` and `targetBlock`.
     * The Diff will is from the point of view of `srcAddress` at block `srcBlock`.
     * If `targetAddress` contains an additional storage key and value, this is represented as `Add`.
     * If `srcAddress` contains an additional storage key and value, this is represented as `Remove`.
     * If both contracts contain the storage key in question but its value differs in `srcAddress` and `targetAddress`,
     * this is represented as a `Change` where the `Change` `srcValue` is set to the value of the `srcAddress`'s storage.
     * @param srcAddress the address of the contract to get the diff for
     * @param targetAddress the address of the contract that `srcAddress` is compared against
     * @param targetBlock the block number of the targeted block of this comparison
     * @param srcBlock the number of the block that is the base for this comparison
     * @returns the diff between the storage of the two contracts at their specific blocks as list of `StorageDiff`
     */
    async getDiffFromStorage(srcAddress: string, targetAddress?: string, srcBlock?: string | number, targetBlock?: string | number): Promise<StorageDiff> {
        let processedParameters: ProcessedParameters;
        try {
            processedParameters = await processParameters(srcAddress, this.srcProvider, srcBlock, targetAddress, this.targetProvider, targetBlock);
        } catch (e) {
            logger.error(e);
            return new StorageDiff([]);
        }

        const toKeys: Array<BigNumberish> = await getAllKeys(processedParameters.targetAddress, this.targetProvider, processedParameters.targetBlock, this.batchSize);
        const fromKeys: Array<BigNumberish> = await getAllKeys(processedParameters.srcAddress, this.srcProvider, processedParameters.srcBlock, this.batchSize);

        const diffs: StorageKeyDiff[] = [];

        /* eslint-disable no-await-in-loop */
        for (let i = 0; i < fromKeys.length; i += 1) {
            const key: BigNumberish = fromKeys[i];
            const index: number = toKeys.indexOf(key);
            if (index !== -1) {
                toKeys.splice(index, 1);
                // check if there are any differences in the values
                const valueFrom = await this.srcProvider.getStorageAt(processedParameters.srcAddress, key, processedParameters.srcBlock);
                const valueTo = await this.targetProvider.getStorageAt(processedParameters.targetAddress, key, processedParameters.targetBlock);
                if (valueFrom !== valueTo) {
                    diffs.push(new Change(key, valueFrom, valueTo));
                }
            } else {
                // key is only present in `sourceAddress`
                diffs.push(new Add(key, await this.srcProvider.getStorageAt(processedParameters.srcAddress, key, processedParameters.srcBlock)));
            }
        }
        // keys that are present in block `srcBlock` but not in `targetBlock`.
        /* eslint-disable no-restricted-syntax */
        for (const key of toKeys) {
            diffs.push(new Remove(key, await this.targetProvider.getStorageAt(processedParameters.targetAddress, key, processedParameters.targetBlock)));
        }
        /* eslint-enable no-await-in-loop */
        /* eslint-enable no-restricted-syntax */
        return new StorageDiff(diffs);
    }

    async getDiffFromSrcContractTxs(srcAddress: string, latestSrcBlock?: string | number, earliestSrcBlock?: string | number): Promise<StorageDiff> {
        let processedParameters: ProcessedParameters;
        try {
            processedParameters = await processParameters(srcAddress, this.srcProvider, earliestSrcBlock, srcAddress, this.srcProvider, latestSrcBlock);
        } catch (e) {
            logger.error(e);
            return new StorageDiff([]);
        }

        const diffs: StorageKeyDiff[] = [];
        const srcTxHandler = new TransactionHandler(processedParameters.srcAddress, this.srcProvider);

        // getting all tx from srcAddress
        const txs = await srcTxHandler.getTransactions(processedParameters.targetBlock, processedParameters.srcBlock);
        const oldKeys = await getAllKeys(srcAddress, this.srcProvider, processedParameters.srcBlock - 1);

        const changedStorage: { [ key: string ]: string } = {};

        // replay storage changes
        const txStorages = await Promise.all(txs.map((tx, index) => srcTxHandler.replayTransaction(tx, index)));
        txStorages.forEach((storage) => {
            if (storage) {
                logger.debug('srcTx txStorage: ', storage);

                Object.entries(storage).forEach(([key, value]) => {
                    changedStorage[key] = value;
                });
            }
        });

        // gather diffs
        const newKeys = Object.keys(changedStorage);
        newKeys.forEach((key) => {
            const oldIndex = oldKeys.indexOf(key);
            if (oldIndex === -1) {
                // newly added key
                diffs.push(new Add(key, changedStorage[key]));
            } else if (!changedStorage[key].match(/0x[0]{64}/g)) {
                // changed key
                diffs.push(new Change(key, 0, changedStorage[key]));
            } else {
                // removed key
                diffs.push(new Remove(key, 0));
            }
        });

        return new StorageDiff(diffs);
    }
}

export default DiffHandler;
