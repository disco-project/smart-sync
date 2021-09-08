import { BigNumberish } from 'ethers';
import { DiffKind, StorageKeyDiff } from './Types';

class Remove implements StorageKeyDiff {
    public key: BigNumberish;

    public value: BigNumberish;

    public diffKind: DiffKind = DiffKind.Remove;

    constructor(key: BigNumberish, value: BigNumberish) {
        this.key = key;
        this.value = value;
    }

    kind(): DiffKind {
        return this.diffKind;
    }
}

export default Remove;
