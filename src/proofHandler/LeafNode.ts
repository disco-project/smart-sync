import * as rlp from 'rlp';
import { ethers } from 'ethers';

class LeafNode {
    storageKey: Buffer;

    node: Buffer;

    constructor(node, storageKey) {
        this.node = node;
        this.storageKey = storageKey;
    }

    /**
     *
     * @param node a hex string with '0x' prefix
     * @returns true if this node equals the rlp-encoded hex string, false otherwise
     */
    equals(node: string): Boolean {
        return `0x${rlp.encode(this.node).toString('hex')}` === node;
    }

    encode() {
        return [ethers.utils.hexZeroPad(this.storageKey, 32), this.node[0], this.node[1]];
    }
}

export default LeafNode;
