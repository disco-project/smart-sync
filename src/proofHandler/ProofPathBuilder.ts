/* eslint-disable import/no-cycle */
import { ethers } from 'ethers';
import { Logger } from 'tslog';
import * as rlp from 'rlp';
import { logger } from '../utils/logger';
import { hexStringToBuffer } from '../utils/utils';
import BranchNode from './BranchNode';
import ExtensionNode from './ExtensionNode';
import LeafNode from './LeafNode';
import { EmbeddedNode, ParentNode, StorageProof } from './Types';

class ProofPathBuilder {
    root: EmbeddedNode;

    logger: Logger;

    constructor(root: Array<Buffer> | Buffer, storageKey?: string) {
        this.logger = logger.getChildLogger({ name: 'ProofPathBuilder' });
        if (root.length === 2 && storageKey) {
            // root is leaf
            this.root = new LeafNode(root, [storageKey]);
        } else if (root.length === 2) {
            // root is extension
            this.logger.trace('extension as root');
            this.root = new ExtensionNode(root);
        } else {
            // root is branch
            this.logger.trace('branch as root');
            this.root = new BranchNode(root, storageKey);
        }
    }

    /**
     * returns true if this node equals the rlp-encoded hex string, false otherwise
     * @param node a hex string with '0x' prefix
     * @returns boolean
     */
    nodeEquals(node: string): Boolean {
        return this.root.nodeEquals(node);
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
            }
            if (childBranch.childEquals(nodeRef)) {
                // child already exists
                return childBranch.child;
            }
            return this.insertChild(childBranch.child as BranchNode, node, parentNode, storageKey, isLeaf);
        }

        for (let i = 0; i < childBranch.children.length; i += 1) {
            if (childBranch.childEquals(nodeRef, i)) {
                if (isLeaf && storageKey) {
                    // insert leaf
                    childBranch.children[i] = new LeafNode(node, [storageKey]);
                } else if (isLeaf) {
                    logger.error(`Storagekey for ${nodeRef} not defined.`);
                    throw new Error();
                } else if (node.length === 2 && !childBranch.children[i]) {
                    // insert extension
                    childBranch.children[i] = new ExtensionNode(node, undefined);
                } else if (!childBranch.children[i]) {
                    // insert branch
                    childBranch.children[i] = new BranchNode(node, storageKey);
                } else if (storageKey && !((childBranch.children[i] as BranchNode).children[16])) {
                    logger.debug('value at branch');
                    (childBranch.children[i] as BranchNode).children[16] = new LeafNode(rlp.decode(node[16]) as any, [storageKey]);
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

        if (this.root instanceof LeafNode) {
            if (this.root instanceof LeafNode) {
                logger.error('Change of mt not yet implemented.');
                throw new Error();
            }
        }

        // find the parent node
        if (this.root instanceof ExtensionNode) {
            // root is extension node
            if (!this.root.child) {
                this.root.child = new BranchNode(node, storageKey);
                return this.root.child;
            }
            if (this.root.childEquals(nodeRef)) {
                // if already exists
                return this.root.child;
            }
            // -> check nested
            return this.insertChild(this.root.child, node, parentNode, storageKey, isLeaf);
        }

        // root is branch node
        for (let i = 0; i < this.root.children.length; i += 1) {
            if (this.root.childEquals(nodeRef, i)) {
                if (isLeaf && storageKey) {
                    // insert leaf
                    this.root.children[i] = new LeafNode(node, [storageKey]);
                } else if (isLeaf) {
                    logger.error(`Storagekey for ${nodeRef} not defined.`);
                    throw new Error();
                } else if (node.length === 2 && !this.root.children[i]) {
                    // insert extension
                    this.root.children[i] = new ExtensionNode(node, undefined);
                } else if (!this.root.children[i]) {
                    // insert branch
                    this.root.children[i] = new BranchNode(node, storageKey);
                } else if (storageKey && !((this.root.children[i] as BranchNode).children[16])) {
                    logger.debug('value at branch');
                    (this.root.children[i] as BranchNode).children[16] = new LeafNode(rlp.decode(node[16]) as any, [storageKey]);
                }
                return this.root.children[i];
            }
            // check nested
            if (this.root.children[i]) {
                if (this.root.children[i] instanceof BranchNode || this.root.children[i] instanceof ExtensionNode) {
                    const newNode = this.insertChild(this.root.children[i] as ParentNode, node, parentNode, storageKey, isLeaf);
                    if (newNode !== undefined) {
                        return newNode;
                    }
                }
            }
        }

        return undefined;
    }

    encode(): Buffer | null {
        return rlp.encode(this.root.encode());
    }
}

// todo this needs testing with other smart contracts than the simple MappingContract
export function addDeletedValue(parentNode: ParentNode, storageProof: StorageProof): LeafNode | undefined {
    if (parentNode instanceof ExtensionNode) {
        logger.error('Can not add deleted value to ExtensionNode');
        return undefined;
    }
    if (parentNode instanceof LeafNode) {
        logger.error('ParentNode is a leaf node');
        return undefined;
    }
    const path = ethers.utils.keccak256(ethers.utils.hexZeroPad(storageProof.key, 32));
    let pathPtr = 2; // starts at 2 because of '0x'
    for (let i = 0; i < storageProof.proof.length; i += 1) {
        const node = rlp.decode(storageProof.proof[i]) as Buffer[];
        if (node.length === 17) pathPtr += 1;
        else if (node.length === 2) {
            const stringRep = node[0].toString('hex');
            if ((stringRep[0] + stringRep[1]) === '00') {
                pathPtr += stringRep.length - 2;
            } else {
                pathPtr += stringRep.length - 1;
            }
        }
    }
    // calc rest of key for leaf creation
    const even = (pathPtr % 2) === 0;
    let adjustedPath: Buffer;
    if (even) {
        // eslint-disable-next-line no-bitwise
        adjustedPath = Buffer.from((2 << 4).toString(16) + path.substring(pathPtr), 'hex');
    } else {
        adjustedPath = Buffer.from(path.substring(pathPtr - 1), 'hex');
        // eslint-disable-next-line no-bitwise
        adjustedPath[0] = (3 << 4) + (adjustedPath[0] % 16);
    }
    logger.debug(adjustedPath);
    const artificialNode = [adjustedPath, Buffer.from([0x0])];
    const pathNibble = parseInt(path[pathPtr - 1], 16);
    if (parentNode instanceof BranchNode) {
        parentNode.children[pathNibble] = new LeafNode(artificialNode, [storageProof.key]);
        return parentNode.children[pathNibble] as LeafNode ?? undefined;
    }
    if (!(parentNode.root instanceof BranchNode)) {
        logger.error('Cannot add deleted value to anything else than BranchNode at the moment.');
        return undefined;
    }
    parentNode.root.children[pathNibble] = new LeafNode(artificialNode, [storageProof.key]);
    return parentNode.root.children[pathNibble] as LeafNode ?? undefined;
}

export default ProofPathBuilder;
