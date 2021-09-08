import { BigNumberish } from 'ethers';
import { DiffKind, StorageKeyDiff } from './Types';

class Add implements StorageKeyDiff {
    public key: BigNumberish;

    public value: BigNumberish;

    public diffKind: DiffKind = DiffKind.Add;

    constructor(key: BigNumberish, value: BigNumberish) {
        this.key = key;
        this.value = value;
    }

    kind(): DiffKind {
        return this.diffKind;
    }
}

export default Add;
