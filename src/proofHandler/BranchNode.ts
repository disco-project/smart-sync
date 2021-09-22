import * as rlp from 'rlp';
import LeafNode from './LeafNode';
// eslint-disable-next-line import/no-cycle
import { EmbeddedNode } from './Types';

class BranchNode {
    // [[path, hash]]
    node: Buffer[];

    commonNodes: [];

    children: (EmbeddedNode | null)[];

    constructor(node: Buffer[], storageKey: string | undefined) {
        this.node = node;
        this.children = new Array(17).fill(null);
        this.commonNodes = [];
        if (storageKey) {
            this.children[16] = new LeafNode(rlp.decode(this.node[16]) as any, storageKey);
        }
    }

    /**
     * returns true if this node equals the rlp-encoded hex string, false otherwise
     * @param node a hex string with '0x' prefix
     * @returns boolean
     */
    equals(node: string): Boolean {
        return `0x${rlp.encode(this.node).toString('hex')}` === node;
    }

    hasLeaf() {
        for (let i = 0; i < this.children.length; i += 1) {
            if (this.children[i] instanceof LeafNode) {
                return true;
            }
        }
        return false;
    }

    /**
     * Encodes the branch node as [[common branches... node], children]
     */
    encode() {
        const nodes = this.children.map((n) => {
            if (n) {
                return n.encode();
            }
            return [];
        });
        return [[...this.commonNodes, this.node], nodes];
    }
}

export default BranchNode;
