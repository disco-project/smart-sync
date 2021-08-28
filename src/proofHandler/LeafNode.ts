import { ethers } from 'ethers';

class LeafNode {
    storageKey: Buffer;

    node: Buffer[];

    constructor(node: Buffer[], storageKey) {
        this.node = node;
        this.storageKey = storageKey;
    }

    encode() {
        return [ethers.utils.hexZeroPad(this.storageKey, 32), this.node[0], this.node[1]];
    }
}

export default LeafNode;
