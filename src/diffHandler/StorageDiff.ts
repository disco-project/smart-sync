import { BigNumberish } from 'ethers';
import Add from './Add';
import Change from './Change';
import Remove from './Remove';
import { DiffKind, StorageKeyDiff } from './Types';

class StorageDiff {
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
        return this.diffs.filter((diff) => diff.kind() === DiffKind.Add) as Add[];
    }

    /**
     * @returns all keys that were deleted
     */
    removes(): Remove[] {
        return this.diffs.filter((diff) => diff.kind() === DiffKind.Remove) as Remove[];
    }

    /**
     * @returns all keys that changed their values
     */
    changes(): Change[] {
        return this.diffs.filter((diff) => diff.kind() === DiffKind.Change) as Change[];
    }

    /**
     *
     * @returns all keys
     */
    getKeys(): Array<BigNumberish> {
        return this.diffs.map((diff) => diff.key);
    }
}

export default StorageDiff;
