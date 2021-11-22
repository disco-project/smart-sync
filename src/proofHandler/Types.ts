/* eslint-disable import/no-cycle */
import BranchNode from './BranchNode';
import ExtensionNode from './ExtensionNode';
import LeafNode from './LeafNode';
import ProofPathBuilder from './ProofPathBuilder';

export type EmbeddedNode = LeafNode | BranchNode | ExtensionNode;
export type ParentNode = BranchNode | ExtensionNode | ProofPathBuilder;
export type StorageProof = {
    key: string;
    value: string;
    proof: string[];
};
/**
 * Represents a account object
 */
export type Account = {
    nonce: string;
    balance: string;
    storageHash: string;
    codeHash: string;
};
export type BlockHeader = {
    baseFeePerGas?: string;
    difficulty: string;
    extraData: string;
    miner: string;
    gasLimit: string;
    gasUsed: string;
    mixHash?: string;
    transactionsRoot: string;
    receiptsRoot: string;
    logsBloom: string;
    number: string;
    nonce?: string;
    parentHash: string;
    sha3Uncles: string;
    stateRoot: string;
    timestamp: string;
};
/**
 * Represents the result of a [`eth_getProof`](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1186.md) RPC request
 */
export interface IGetProof {
    accountProof: string[];
    address: string;
    balance: string;
    codeHash: string;
    nonce: string;
    storageHash: string;
    storageProof: StorageProof[];
}
