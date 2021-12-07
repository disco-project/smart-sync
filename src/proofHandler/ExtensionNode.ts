import * as rlp from 'rlp';
import { logger } from '../utils/logger';
// eslint-disable-next-line import/no-cycle
import BranchNode from './BranchNode';

class ExtensionNode {
    node: Array<Buffer> | Buffer;

    child?: BranchNode;

    constructor(node: Array<Buffer> | Buffer, child?: BranchNode) {
        this.node = node;
        this.child = child;
    }

    /**
     * returns true if this node equals the rlp-encoded hex string, false otherwise
     * @param node a hex string with '0x' prefix
     * @returns boolean
     */
    nodeEquals(node: string): Boolean {
        return `0x${rlp.encode(this.node).toString('hex')}` === node;
    }

    childEquals(node: Buffer): Boolean {
        if (this.node instanceof Buffer) {
            return false;
        }
        if (!(this.node[1] instanceof Buffer)) {
            logger.error(`You want to compare ${this.node[1]} with ${Buffer}`);
            return false;
        }
        return this.node[1].equals(node);
    }

    encode() {
        if (!this.child) return undefined;
        return [this.node, [this.child.encode()]];
    }
}

export default ExtensionNode;
