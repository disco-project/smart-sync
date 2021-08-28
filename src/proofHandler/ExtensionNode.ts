import { EmbeddedNode } from './Types';

class ExtensionNode {
    node: Buffer[];

    child: EmbeddedNode | undefined;

    constructor(node: Buffer[], child: EmbeddedNode | undefined) {
        this.node = node;
        this.child = child;
    }

    encode() {
        if (!this.child) return undefined;
        return [[this.node], [this.child.encode()]];
    }
}

export default ExtensionNode;
