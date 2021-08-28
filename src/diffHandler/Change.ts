import { BigNumberish } from 'ethers';
import { DiffKind, StorageKeyDiff } from './Types';

class Change implements StorageKeyDiff {
    public key: BigNumberish;

    public srcValue: BigNumberish;

    public targetValue: BigNumberish;

    public diffKind: DiffKind = DiffKind.Change;

    constructor(key: BigNumberish, srcValue: BigNumberish, targetValue: BigNumberish) {
        this.key = key;
        this.srcValue = srcValue;
        this.targetValue = targetValue;
    }

    kind(): DiffKind {
        return this.diffKind;
    }
}

export default Change;
