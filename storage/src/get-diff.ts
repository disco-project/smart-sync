import {ethers} from "hardhat";
import assert from "assert";
import {toParityQuantity} from "./utils";

export class StorageDiffer {
    /**
     * The provider used to access the source chain
     * @private
     */
    private srcProvider;
    /**
     * The provider used to access the target chain
     * @private
     */
    private targetProvider;
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
    constructor(srcProvider = new ethers.providers.JsonRpcProvider(), targetProvider = srcProvider, batchSize = 50) {
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
    async getDiff(srcAddress, targetAddress?, srcBlock?, targetBlock?): Promise<StorageDiff> {
        assert(ethers.utils.isAddress(srcAddress), "contract address is not a valid address");

        if (!ethers.utils.isAddress(targetAddress)) {
            if (targetBlock) {
                throw new Error(`address ${targetAddress} is not a valid address`)
            }
            return this.getDiff(srcAddress, srcAddress, targetAddress, srcBlock);
        }

        targetAddress = targetAddress ?? srcAddress;
        srcBlock = srcBlock ?? "latest";
        targetBlock = targetBlock ?? "latest";

        if (srcAddress === targetAddress && this.srcProvider.address == this.targetProvider.address && srcBlock === targetBlock) {
            // nothing targetBlock compare
            return new StorageDiff([]);
        }

        srcBlock = toParityQuantity(srcBlock);
        targetBlock = toParityQuantity(targetBlock);

        let toKeys = await this.getAllKeys(targetAddress, targetBlock);
        let fromKeys = await this.getAllKeys(srcAddress, srcBlock);

        const diffs: StorageKeyDiff[] = [];

        for (let i = 0; i < toKeys.length; i++) {
            let key = toKeys[i];
            const index = fromKeys.indexOf(key);
            if (index !== -1) {
                fromKeys.splice(index, 1);
                // check if there are any differences in the values
                let valueFrom = await this.srcProvider.getStorageAt(srcAddress, key, srcBlock);
                let valueTo = await this.srcProvider.getStorageAt(targetAddress, key, targetBlock);
                if (valueFrom !== valueTo) {
                    diffs.push(
                        new Change(key, valueFrom, valueTo)
                    );
                }
            } else {
                // key is only present in `targetAddress`
                diffs.push(new Add(key, await this.srcProvider.getStorageAt(targetAddress, key, targetBlock)));
            }
        }
        // keys that are present in block `srcBlock` but not in `targetBlock`.
        for (let key of fromKeys) {
            diffs.push(new Remove(key, await this.srcProvider.getStorageAt(srcAddress, key, srcBlock)))
        }
        return new StorageDiff(diffs);
    }

    /**
     *
     * @param address the address of the contract
     * @param blockNum the block number to retrieve the storage keys from
     * @returns all the storage keys of the contract with `address` at block `blockNum`
     */
    async getAllKeys(address, blockNum) {
        let keys = [];
        let batch = [];
        let batchCounter = 1;

        do {
            let offset = (batchCounter > 1) ? keys[keys.length - 1] : null;

            batch = await this.srcProvider.send("parity_listStorageKeys", [
                address, this.batchSize * batchCounter, offset, blockNum
            ]);
            keys.push(...batch);
            batchCounter += 1;
        } while (batch.length >= this.batchSize);
        return keys;
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

}

interface StorageKeyDiff {
    /**
     * The storage key
     */
    key();

    /**
     * What kind of change this is
     */
    kind(): DiffKind;
}

export class Add implements StorageKeyDiff {
    public key: any;
    public value: any;

    constructor(key, value) {
        this.key = key;
        this.value = value;
    }

    kind(): DiffKind {
        return DiffKind.Add;
    }
}

export class Remove implements StorageKeyDiff {
    public key: any;
    public value: any;

    constructor(key, value) {
        this.key = key;
        this.value = value;
    }

    kind(): DiffKind {
        return DiffKind.Remove;
    }
}

export class Change implements StorageKeyDiff {
    public key: any;
    public srcValue: any;
    public targetValue: any;

    constructor(key, srcValue, targetValue) {
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