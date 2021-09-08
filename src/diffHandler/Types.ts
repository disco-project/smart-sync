import { BigNumberish } from 'ethers';

export type ProcessedParameters = {
    srcAddress: string;
    srcBlock: number;
    targetAddress: string;
    targetBlock: number;
};

/* eslint-disable no-shadow */
/* eslint-disable no-unused-vars */
export enum DiffKind {
    Add,
    Remove,
    Change,
}
/* eslint-enable no-shadow */
/* eslint-enable no-unused-vars */

export interface StorageKeyDiff {
    /**
     * The storage key
     */
    key: BigNumberish;

    /**
     * What kind of change this is
     */
    kind(): DiffKind;
}
