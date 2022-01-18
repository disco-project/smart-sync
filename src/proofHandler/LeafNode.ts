import * as rlp from 'rlp';
import { ethers } from 'ethers';

class LeafNode {
    storageKeys: Array<string>;

    node: Array<Buffer> | Buffer;

    constructor(node: Array<Buffer> | Buffer, storageKeys: Array<string>) {
        this.node = node;
        this.storageKeys = storageKeys;
    }

    /**
     *
     * @param node a hex string with '0x' prefix
     * @returns true if this node equals the rlp-encoded hex string, false otherwise
     */
    nodeEquals(node: string): Boolean {
        return `0x${rlp.encode(this.node).toString('hex')}` === node;
    }

    encode() {
        return [this.storageKeys.map((storageKey) => ethers.utils.hexZeroPad(storageKey, 32)), this.node[0], this.node[1]];
    }
}

export default LeafNode;
