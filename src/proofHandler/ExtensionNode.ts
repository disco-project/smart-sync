import * as rlp from 'rlp';
// eslint-disable-next-line import/no-cycle
import { EmbeddedNode } from './Types';

class ExtensionNode {
    node: Buffer[];

    child: EmbeddedNode | undefined;

    constructor(node: Buffer[], child: EmbeddedNode | undefined) {
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

    encode() {
        if (!this.child) return undefined;
        return [[this.node], [this.child.encode()]];
    }
}

export default ExtensionNode;
