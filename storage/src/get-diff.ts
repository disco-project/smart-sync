import {ethers, network} from "hardhat";
import assert from "assert";
import {getAllKeys, toParityQuantity, TransactionHandler } from "./utils";
import { HttpNetworkConfig } from "hardhat/types";
import { JsonRpcProvider } from '@ethersproject/providers';
import { BigNumberish } from "@ethersproject/bignumber";

export class StorageDiffer {
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
    constructor(srcProvider = new ethers.providers.JsonRpcProvider((network.config as HttpNetworkConfig).url), targetProvider = srcProvider, batchSize = 50) {
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
    async getDiffFromStorage(srcAddress: string, targetAddress?: string, srcBlock?: string | number,  targetBlock?: string | number): Promise<StorageDiff> {
        const processedParameters: ProcessedParameters = this.processParameters(srcAddress, srcBlock, targetAddress, targetBlock);

        let toKeys: Array<BigNumberish> = await getAllKeys(processedParameters.targetAddress, this.targetProvider, processedParameters.targetBlock, this.batchSize);
        let fromKeys: Array<BigNumberish> = await getAllKeys(processedParameters.srcAddress, this.srcProvider, processedParameters.srcBlock, this.batchSize);

        const diffs: StorageKeyDiff[] = [];

        for (let i = 0; i < toKeys.length; i++) {
            let key: BigNumberish = toKeys[i];
            const index: number = fromKeys.indexOf(key);
            if (index !== -1) {
                fromKeys.splice(index, 1);
                // check if there are any differences in the values
                let valueFrom = await this.srcProvider.getStorageAt(processedParameters.srcAddress, key, processedParameters.srcBlock);
                let valueTo = await this.targetProvider.getStorageAt(processedParameters.targetAddress, key, processedParameters.targetBlock);
                if (valueFrom !== valueTo) {
                    diffs.push(
                        new Change(key, valueFrom, valueTo)
                    );
                }
            } else {
                // key is only present in `targetAddress`
                diffs.push(new Add(key, await this.targetProvider.getStorageAt(processedParameters.targetAddress, key, processedParameters.targetBlock)));
            }
        }
        // keys that are present in block `srcBlock` but not in `targetBlock`.
        for (let key of fromKeys) {
            diffs.push(new Remove(key, await this.srcProvider.getStorageAt(processedParameters.srcAddress, key, processedParameters.srcBlock)))
        }
        return new StorageDiff(diffs);
    }
    
    /**
     * @dev Creates a storage diff for the respective contracts based on the txs up until the respective block numbers
     * @param srcAddress the address of the contract to get the diff for
     * @param latestSrcBlock replay txs until this block number for the comparison
     * @param targetAddress the address of the contract that `srcAddress` is compared against
     * @param latestSrcBlock replay txs until this block number for the comparison
     * @returns the diff between the storage of the two contracts at their specific blocks as list of `StorageDiff`
     */
    async getDiffFromTxs(srcAddress: string, targetAddress?: string, latestSrcBlock?: string | number, latestTargetBlock?: string | number): Promise<StorageDiff> {
        const processedParameters: ProcessedParameters = this.processParameters(srcAddress, latestSrcBlock, targetAddress, latestTargetBlock);

        const diffs: StorageKeyDiff[] = [];
        const srcTxHandler = new TransactionHandler(processedParameters.srcAddress, this.srcProvider);
        const srcStorage: { [key: string]: string } = await srcTxHandler.getContractStorageFromTxs(processedParameters.srcBlock);
        const srcKeys = Object.keys(srcStorage);

        const targetTxHandler = new TransactionHandler(processedParameters.targetAddress, this.targetProvider);
        const targetStorage: { [key: string]: string } = await targetTxHandler.getContractStorageFromTxs(processedParameters.targetBlock);

        for (const targetKey in targetStorage) {
            const srcValue = srcStorage[targetKey];
            const targetValue = targetStorage[targetKey];
            if (srcValue) {
                if (srcValue !== targetValue) {
                    // value of respective key changed
                    diffs.push(new Change(targetKey, srcValue, targetValue));
                }
                srcKeys.splice(srcKeys.indexOf(targetKey), 1);
            } else if (!srcValue) {
                // key is only present in `targetAddress`
                diffs.push(new Add(targetKey, targetValue));
            }
        }

        // keys that are present in block `srcBlock` but not in `targetBlock`.
        for (const srcKey of srcKeys) {
            diffs.push(new Remove(srcKey, srcStorage[srcKey]));
        }

        return new StorageDiff(diffs);
    }

    private processParameters(srcAddress: string, srcBlock?: string | number, targetAddress?: string, targetBlock?: string | number): ProcessedParameters {
        assert(ethers.utils.isAddress(srcAddress), "contract address is not a valid address");

        if (targetAddress !== undefined && !ethers.utils.isAddress(targetAddress)) {
            throw new Error(`address ${targetAddress} is not a valid address`);
        }

        targetAddress = targetAddress ?? srcAddress;
        srcBlock = srcBlock ?? "latest";
        targetBlock = targetBlock ?? "latest";

        srcBlock = toParityQuantity(srcBlock);
        targetBlock = toParityQuantity(targetBlock);

        return {
            srcAddress,
            srcBlock,
            targetAddress,
            targetBlock
        }
    }
}

export class StorageDiff {
    public diffs: StorageKeyDiff[];

    constructor(diffs: StorageKeyDiff[]) {
        this.diffs = diffs;
    }

    /**
     * @returns true if there are no differences, false otherwise
     */
    isEmpty(): boolean {
        return this.diffs.length === 0;
    }

    /**
     * @returns all additional keys
     */
    adds(): Add[] {
        return this.diffs.filter(diff => diff.kind() === DiffKind.Add) as Add[];
    }

    /**
     * @returns all keys that were deleted
     */
    removes(): Remove[] {
        return this.diffs.filter(diff => diff.kind() === DiffKind.Remove) as Remove[];
    }

    /**
     * @returns all keys that changed their values
     */
    changes(): Change[] {
        return this.diffs.filter(diff => diff.kind() === DiffKind.Change) as Change[];
    }

    /**
     * 
     * @returns all keys
     */
    getKeys(): Array<BigNumberish> {
        return this.diffs.map((diff) => diff.key);
    }

}

interface StorageKeyDiff {
    /**
     * The storage key
     */
    key: BigNumberish;

    /**
     * What kind of change this is
     */
    kind(): DiffKind;
}

export class Add implements StorageKeyDiff {
    public key: BigNumberish;
    public value: BigNumberish;

    constructor(key: BigNumberish, value: BigNumberish) {
        this.key = key;
        this.value = value;
    }

    kind(): DiffKind {
        return DiffKind.Add;
    }
}

export class Remove implements StorageKeyDiff {
    public key: BigNumberish;
    public value: BigNumberish;

    constructor(key: BigNumberish, value: BigNumberish) {
        this.key = key;
        this.value = value;
    }

    kind(): DiffKind {
        return DiffKind.Remove;
    }
}

export class Change implements StorageKeyDiff {
    public key: BigNumberish;
    public srcValue: BigNumberish;
    public targetValue: BigNumberish;

    constructor(key: BigNumberish, srcValue: BigNumberish, targetValue: BigNumberish) {
        this.key = key;
        this.srcValue = srcValue;
        this.targetValue = targetValue;
    }

    kind(): DiffKind {
        return DiffKind.Change;
    }
}

export enum DiffKind {
    Add,
    Remove,
    Change
}

interface ProcessedParameters {
    srcAddress: string;
    srcBlock: string;
    targetAddress: string;
    targetBlock: string;
}