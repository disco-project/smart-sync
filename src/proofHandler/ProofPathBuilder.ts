/* eslint-disable import/no-cycle */
import { BigNumber, ethers } from 'ethers';
import { Logger } from 'tslog';
import * as rlp from 'rlp';
import { logger } from '../utils/logger';
import { hexStringToBuffer } from '../utils/utils';
import BranchNode from './BranchNode';
import ExtensionNode from './ExtensionNode';
import LeafNode from './LeafNode';
import { EmbeddedNode, ParentNode, StorageProof } from './Types';

class ProofPathBuilder {
    root: LeafNode | any;

    children: EmbeddedNode | EmbeddedNode[] | undefined;

    logger: Logger;

    constructor(root: Buffer, storageKey?: string) {
        this.logger = logger.getChildLogger({ name: 'ProofPathBuilder' });
        if (root.length === 2 && storageKey) {
            // root is leaf
            this.root = new LeafNode(root, storageKey);
        } else if (root.length === 2) {
            // root is extension
            this.logger.trace('extension as root');
            this.root = root;
        } else {
            // root is branch
            this.logger.trace('branch as root');
            this.root = root;
            this.children = Array(17).fill(null);
        }
    }

    /**
     * returns true if this node equals the rlp-encoded hex string, false otherwise
     * @param node a hex string with '0x' prefix
     * @returns boolean
     */
    equals(node: string): Boolean {
        return `0x${rlp.encode(this.root).toString('hex')}` === node;
    }

    addValue(storageKey: string, leafNode, parentNode: ParentNode): LeafNode | undefined {
        return this.insert(leafNode, parentNode, storageKey, true) as LeafNode;
    }

    addBranch(branchNode, parentNode: ParentNode, storageKey: string | undefined): BranchNode | undefined {
        return this.insert(branchNode, parentNode, storageKey, false) as BranchNode;
    }

    addExtension(extensionNode, parentNode: ParentNode): ExtensionNode | undefined {
        return this.insert(extensionNode, parentNode, undefined, false) as ExtensionNode;
    }

    insertChild(childBranch: ParentNode, node, parentNode: ParentNode, storageKey: string | undefined, isLeaf: Boolean): EmbeddedNode | undefined | null {
        const nodeRef = hexStringToBuffer(ethers.utils.keccak256(rlp.encode(node)));
        if (childBranch instanceof ProofPathBuilder) {
            this.logger.debug('not possible to be proofpathbuilder in insertChild');
            process.exit(-1);
        } else if (childBranch instanceof ExtensionNode) {
            // todo extension root and first child.
            if (!childBranch.child) {
                childBranch.child = new BranchNode(node, storageKey);
                return childBranch.child;
            } if (childBranch.node[1].equals(nodeRef)) {
                // child already exists
                return childBranch.child;
            }
            return this.insertChild(childBranch.child as BranchNode, node, parentNode, storageKey, isLeaf);
        }

        for (let i = 0; i < childBranch.children.length; i += 1) {
            if (childBranch.node[i].equals(nodeRef)) {
                if (isLeaf) {
                    // insert leaf
                    childBranch.children[i] = new LeafNode(node, storageKey);
                } else if (node.length === 2 && !childBranch.children[i]) {
                    // insert extension
                    childBranch.children[i] = new ExtensionNode(node, undefined);
                } else if (!childBranch.children[i]) {
                    // insert branch
                    childBranch.children[i] = new BranchNode(node, storageKey);
                } else if (storageKey && !((childBranch.children[i] as BranchNode).children[16])) {
                    logger.debug('value at branch');
                    (childBranch.children[i] as BranchNode).children[16] = new LeafNode(rlp.decode(node[16]) as any, storageKey);
                }
                return childBranch.children[i];
            }
            // check nested
            if (childBranch.children[i]) {
                if (childBranch.children[i] instanceof BranchNode || childBranch.children[i] instanceof ExtensionNode) {
                    const newNode = this.insertChild(childBranch.children[i] as ParentNode, node, parentNode, storageKey, isLeaf);
                    if (newNode !== undefined) {
                        return newNode;
                    }
                }
            }
        }
        return undefined;
    }

    insert(node, parentNode: ParentNode, storageKey: string | undefined, isLeaf: Boolean): EmbeddedNode | undefined | null {
        const nodeRef = hexStringToBuffer(ethers.utils.keccak256(rlp.encode(node)));
        // const parentRef = ethers.utils.keccak256(rlp.encode(parentNode));

        // find the parent node
        if (!(this.children instanceof Array)) {
            // root is extension node
            if (!this.children) {
                this.children = new BranchNode(node, storageKey);
                return this.children;
            } if (this.root[1].equals(nodeRef)) {
                return this.children;
            }
            // -> check nested
            return this.insertChild(this.children as BranchNode, node, parentNode, storageKey, isLeaf);
        }

        // root is branch node
        for (let i = 0; i < this.children.length; i += 1) {
            if (this.root[i].equals(nodeRef)) {
                if (isLeaf) {
                    // insert leaf
                    this.children[i] = new LeafNode(node, storageKey);
                } else if (node.length === 2 && !this.children[i]) {
                    // insert extension
                    this.children[i] = new ExtensionNode(node, undefined);
                } else if (!this.children[i]) {
                    // insert branch
                    this.children[i] = new BranchNode(node, storageKey);
                } else if (storageKey && !((this.children[i] as BranchNode).children[16])) {
                    logger.debug('value at branch');
                    (this.children[i] as BranchNode).children[16] = new LeafNode(rlp.decode(node[16]) as any, storageKey);
                }
                return this.children[i];
            }
            // check nested
            if (this.children[i]) {
                if (this.children[i] instanceof BranchNode || this.children[i] instanceof ExtensionNode) {
                    const newNode = this.insertChild(this.children[i] as ParentNode, node, parentNode, storageKey, isLeaf);
                    if (newNode !== undefined) {
                        return newNode;
                    }
                }
            }
        }

        return undefined;
    }

    encode(): Buffer | null {
        if (this.root instanceof LeafNode) return rlp.encode(this.root.encode());
        if (!this.children) return null;

        if (this.children instanceof Array) {
            // its a branch as a root
            const nodes = this.children.map((n) => {
                if (n) {
                    return n.encode();
                }
                return [];
            });

            return rlp.encode([[this.root], nodes]);
        }

        // its an extension
        return rlp.encode([[this.root], [this.children.encode()]]);
    }
}

// todo this needs testing with other smart contracts than the simple MappingContract
export function addDeletedValue(parentNode: ParentNode, storageProof: StorageProof): LeafNode | undefined {
    if (parentNode instanceof ExtensionNode) {
        logger.error('Can not add deleted value to ExtensionNode');
        return undefined;
    }
    if (!parentNode.children) {
        logger.error('ParentNode is a leaf node');
        return undefined;
    }
    const path = ethers.utils.keccak256(ethers.utils.hexZeroPad(storageProof.key, 32));
    let pathPtr = 2;
    for (let i = 0; i < storageProof.proof.length - 1; i += 1) {
        const node = rlp.decode(storageProof.proof[i]) as Buffer[];
        if (node.length === 17) pathPtr += 1;
        else if (node.length === 2) {
            const extension = BigNumber.from(node[0]).toHexString().length - 2;
            pathPtr += extension;
        }
    }
    const adjustedPath = Buffer.from(path.substring(2), 'hex');
    // comment on why change the first slot: the hashed keys in the leafs of a mt on the bc have a leading nibble of 0011.
    adjustedPath[0] = 48 + (adjustedPath[0] % 16);
    const artificialNode = [adjustedPath, Buffer.from([0x0])];
    const pathNibble = parseInt(path[pathPtr], 16);
    parentNode.children[pathNibble] = new LeafNode(artificialNode, storageProof.key);
    return parentNode.children[pathNibble] as LeafNode ?? undefined;
}

export default ProofPathBuilder;
