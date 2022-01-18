import * as rlp from 'rlp';
import { logger } from '../utils/logger';
import LeafNode from './LeafNode';
// eslint-disable-next-line import/no-cycle
import { EmbeddedNode } from './Types';

class BranchNode {
    // [[path, hash]]
    node: Array<Buffer> | Buffer;

    children: (EmbeddedNode | null)[];

    constructor(node: Array<Buffer> | Buffer, storageKey: string | undefined) {
        this.node = node;
        this.children = new Array(17).fill(null);
        if (storageKey) {
            this.children[16] = new LeafNode(rlp.decode(this.node[16]) as any, [storageKey]);
        }
    }

    /**
     * returns true if this node equals the rlp-encoded hex string, false otherwise
     * @param node a hex string with '0x' prefix
     * @returns boolean
     */
    nodeEquals(node: string): Boolean {
        return `0x${rlp.encode(this.node).toString('hex')}` === node;
    }

    childEquals(node: Buffer, pos: number): Boolean {
        if (this.node instanceof Buffer) {
            return false;
        }
        if (!(this.node[pos] instanceof Buffer)) {
            logger.error(`You want to compare ${this.node[pos].constructor} with ${Buffer}`);
            return false;
        }
        return (this.node[pos] as Buffer).equals(node);
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
        return [this.node, nodes];
    }
}

export default BranchNode;
