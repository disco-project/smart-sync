import {Proof} from "merkle-patricia-tree/dist.browser/baseTrie";
import {ethers} from "ethers";
import * as rlp from "rlp";
import {BaseTrie as Trie} from "merkle-patricia-tree";
import assert from "assert";
import * as utils from "./utils";
import {formatPathStack} from "./build-proof";
import { exit } from "process";
import { Logger } from "tslog";

export async function testStorageProof(storageProof: StorageProof, storageRoot) {
    const trie = new Trie(null, hexStringToBuffer(storageRoot));
    const storageNodes = format_proof_nodes(storageProof.proof);
    const storageTrie = await Trie.fromProof(storageNodes, trie);
    const storageKey = hexStringToBuffer(ethers.utils.keccak256(ethers.utils.hexZeroPad(storageProof.key, 32)));
    const path = await storageTrie.findPath(storageKey) as any;
    let parentNodes = formatPathStack(path);
    return rlp.encode(parentNodes)
}

export async function verifyStorageProof(storageProof: StorageProof, root) {
    const storageTrieKey = hexStringToBuffer(ethers.utils.keccak256(ethers.utils.hexZeroPad(storageProof.key, 32)));
    const storageTrieRoot = hexStringToBuffer(root);

    const proofValue = await Trie.verifyProof(storageTrieRoot, storageTrieKey, format_proof_nodes(storageProof.proof));

    if (proofValue === null) {
        throw new Error(`Invalid storage proof: No storage value found for key: ${storageTrieKey.toString("hex")}`);
    }

    const val = storageProof.value === "0x0" ? Buffer.from([]) : hexStringToBuffer(ethers.BigNumber.from(storageProof.value).toHexString());
    const rlpValue = utils.encode(val);

    if (!rlpValue.equals(proofValue)) {
        throw new Error("Invalid storage proof");
    }
    return true;
}

/**
 * Verifies inclusion proofs
 * @param proof, the proof as returned by `eth_getProof`
 * @param root, rootHash for the merkle proof
 * @throws If account or storage proofs are found to be invalid
 * @returns true if merkle proof could be verified, false otherwise
 * @see also [web3.py](https://github.com/ethereum/web3.py/blob/master/docs/web3.eth.rst)
 */
export async function verify_eth_getProof(proof: GetProof, root: string | Buffer): Promise<boolean> {
    if (typeof (root) === "string") {
        return verify_eth_getProof(proof, hexStringToBuffer(root));
    }

    const acc = <Account>{
        nonce: proof.nonce,
        balance: proof.balance,
        storageHash: proof.storageHash,
        codeHash: proof.codeHash
    };

    const rlpAccount = encodeAccount(acc);
    let trieKey = hexStringToBuffer(ethers.utils.keccak256(proof.address));

    const proofAcc = await Trie.verifyProof(root, trieKey, format_proof_nodes(proof.accountProof));

    if (proofAcc === null) {
        throw new Error(`Invalid account proof: No account value found for key: ${trieKey.toString("hex")}`);
    }
    if (!rlpAccount.equals(proofAcc)) {
        throw new Error("Invalid account proof: accounts do not match");
    }

    for (let storageProof of proof.storageProof) {
        if (!await verifyStorageProof(storageProof, proof.storageHash)) {
            return false;
        }
    }
    return true;
}

/**
 * Convert an Array of hex strings into a proof
 * @param proof
 */
export function format_proof_nodes(proof: string[]): Proof {
    return proof.map(hexStringToBuffer);
}

export function encodeAccount(element: Account): Buffer {
    const keys = [
        // nonce and balance are returned as integer
        ethers.BigNumber.from(element.nonce).toNumber(),
        ethers.BigNumber.from(element.balance).toNumber(),
        hexStringToBuffer(element.storageHash),
        hexStringToBuffer(element.codeHash),
    ];
    return utils.encode(keys);
}

export function decodeAccount(buf: Buffer): Account {
    const it = rlp.decode(buf) as any;
    assert(it.length === 4, "Rlp encoded account requires exactly 4 entries");
    return {
        nonce: utils.hexlify(it[0]),
        balance: utils.hexlify(it[1]),
        storageHash: utils.hexlify(it[2]),
        codeHash: utils.hexlify(it[3]),
    };
}

function encodeStringObject(element): Buffer {
    const keys = Object.values(element).map(val => hexStringToBuffer(<string>val));
    return utils.encode(keys);
}

/**
 * Converts a string to a Buffer
 * Leading `0x` is stripped
 * @param hexString
 */
export function hexStringToBuffer(hexString: string): Buffer {
    if (ethers.utils.isHexString(hexString)) {
        hexString = hexString.substring(2);
    }
    return Buffer.from(hexString, "hex")
}

/**
 * Represents a account object
 */
export interface Account {
    nonce: string;
    balance: string;
    storageHash: string;
    codeHash: string;
}

/**
 * Represents the result of a [`eth_getProof`](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1186.md) RPC request
 */
interface IGetProof {
    accountProof: string[];
    address: string;
    balance: string;
    codeHash: string;
    nonce: string;
    storageHash: string;
    storageProof: StorageProof[];
}

export class GetProof implements IGetProof {
    accountProof: string[];
    address: string;
    balance: string;
    codeHash: string;
    nonce: string;
    storageHash: string;
    storageProof: StorageProof[];
    logger: Logger;

    /**
     *
     * @param buf
     * @param address
     */
    static decode(buf: Buffer, address, logger: Logger) {
        const it = rlp.decode(buf);
        assert(it.length === 3, "Rlp encoded Proof requires exactly 3 entries");
        const account = decodeAccount(it[0] as any);
        const accountProof = (rlp.decode(it[1]) as any).map(p => utils.hexlify(p))
        const storageProof = (rlp.decode(it[2]) as any).map(p => decodeStorageProof(p));

        return new GetProof({
            accountProof,
            address,
            balance: account.balance,
            codeHash: account.codeHash,
            nonce: account.nonce,
            storageHash: account.storageHash,
            storageProof
        }, logger);
    }

    constructor(proof, logger: Logger) {
        this.accountProof = proof.accountProof;
        this.address = proof.address;
        this.balance = proof.balance;
        this.codeHash = proof.codeHash;
        this.nonce = proof.nonce;
        this.codeHash = proof.codeHash;
        this.storageHash = proof.storageHash;
        this.storageProof = proof.storageProof;
        this.logger = logger.getChildLogger({ name: 'GetProof' });
    }

    async optimizedProof(stateRoot) {
        const account = encodeAccount(this.account());
        const accountNodes = await this.encodeParentNodes(stateRoot);
        const storage = this.optimizedStorageProof();
        return utils.encode(
            [
                account, accountNodes, storage
            ]
        );
    }

    /**
     * optimize the storage proof paths
     */
    optimizedStorageProof() {
        let pathNodes: ProofPathBuilder | undefined = undefined;
        let rootNode;
        for (let storageProof of this.storageProof) {
            let parentNode: ParentNode | undefined = undefined;
            // loop over all proof nodes
            for (let i = 0; i < storageProof.proof.length; i++) {
                let proofNode = storageProof.proof[i];
                const node = rlp.decode(hexStringToBuffer(proofNode));
                
                if (!pathNodes) {
                    if (i === storageProof.proof.length - 1) { // node.length === 2
                        // only one node in the tree
                        this.logger.debug('Leaf as root');
                        pathNodes = new ProofPathBuilder(node, this.logger, storageProof.key);
                    } else {
                        // its an extension or branch
                        pathNodes = new ProofPathBuilder(node, this.logger);
                    }
                    rootNode = proofNode;
                }
                if (rootNode === proofNode) {
                    // skip root
                    parentNode = pathNodes;
                    continue;
                }
                if (!pathNodes || !parentNode) {
                    this.logger.debug('not possible.');
                    process.exit(-1);
                }
                if (node.length === 17) {
                    // branch node
                    if (i === storageProof.proof.length - 1) {
                        // terminating
                        this.logger.debug('terminating branch');
                        parentNode = pathNodes.addBranch(node, parentNode, storageProof.key);
                    } else {
                        this.logger.debug('branch');
                        parentNode = pathNodes.addBranch(node, parentNode, null);
                    }
                } else if (node.length === 2) {
                    if (i === storageProof.proof.length - 1) {
                        this.logger.debug('leaf');
                        // leaf
                        pathNodes.addValue(storageProof.key, node, parentNode);
                    } else {
                        // extension
                        this.logger.debug('extension');
                        parentNode = pathNodes.addExtension(node, parentNode);
                    }
                }
            }
        }
        // return the encoded proof
        return pathNodes ? pathNodes.encode() : undefined;
    }

    async encoded(stateRoot): Promise<Buffer> {
        const account = encodeAccount(this.account());
        const accountNodes = await this.encodeParentNodes(stateRoot);
        const storage = await this.encodedStorageProofs();
        return utils.encode([
                account, 
                accountNodes, 
                storage
            ]
        );
    }

    /**
     * @return rlp encoded list of rlp encoded storage proofs
     */
    async encodedStorageProofs(): Promise<Buffer> {
        const storage = await Promise.all(this.storageProof.map((p) => {
                return encodeStorageProof(p, this.storageHash, this.logger);
            }));
        return utils.encode(storage)
    }

    private async encodeParentNodes(stateRoot): Promise<Buffer> {
        const trie = new Trie(null, hexStringToBuffer(stateRoot));
        const accountProofNodes = format_proof_nodes(this.accountProof);
        const accountTrie = await Trie.fromProof(accountProofNodes, trie);
        const accountKey = hexStringToBuffer(ethers.utils.keccak256(this.address));
        const path = await accountTrie.findPath(accountKey) as any;
        let parentNodes = formatPathStack(path);
        return rlp.encode(parentNodes)
    }

    account(): Account {
        return {
            nonce: this.nonce,
            balance: this.balance,
            storageHash: this.storageHash,
            codeHash: this.codeHash,
        };
    }
}


class ProofPathBuilder {
    root: LeafNode | any;
    children: EmbeddedNode | EmbeddedNode[] | undefined;
    logger: Logger;

    constructor(root, logger: Logger, storageKey?) {
        this.logger = logger.getChildLogger({ name: 'ProofPathBuilder' });
        if (root.length === 2 && storageKey) {
            // root is leaf
            this.root = new LeafNode(root, storageKey);
        } else if (root.length === 2) {
            // root is extension
            this.logger.debug('extension as root');
            this.root = root;
        } else {
            // root is branch
            this.logger.debug('branch as root');
            this.root = root;
            this.children = Array(17).fill(null);
        }
    }

    addValue(storageKey, leafNode, parentNode: ParentNode): LeafNode | undefined {
        return this.insert(leafNode, parentNode, storageKey, true) as LeafNode;
    }

    addBranch(branchNode, parentNode: ParentNode, storageKey): BranchNode | undefined {
        return this.insert(branchNode, parentNode, storageKey, false) as BranchNode;
    }

    addExtension(extensionNode, parentNode: ParentNode): ExtensionNode | undefined {
        return this.insert(extensionNode, parentNode, undefined, false) as ExtensionNode;
    }

    insertChild(childBranch: ParentNode, node, parentNode: ParentNode, storageKey, isLeaf): EmbeddedNode | undefined | null {
        const nodeRef = hexStringToBuffer(ethers.utils.keccak256(rlp.encode(node)));
        if (childBranch instanceof ProofPathBuilder) {
            this.logger.debug('not possible to be proofpathbuilder in insertChild');
            process.exit(-1);
        } else if (childBranch instanceof ExtensionNode) {
            // todo extension root and first child.
            if (!childBranch.child) {
                childBranch.child = new BranchNode(node, storageKey);
                return childBranch.child;
            } else if (childBranch.node[1].equals(nodeRef)) {
                // child already exists
                return childBranch.child;
            }
            return this.insertChild(childBranch.child as BranchNode, node, parentNode, storageKey, isLeaf);
        }

        for (let i = 0; i < childBranch.children.length; i++) {
            if (childBranch.node[i].equals(nodeRef)) {
                if (isLeaf) {
                    // insert leaf
                    childBranch.children[i] = new LeafNode(node, storageKey);
                } else if (node.length === 2 && !childBranch.children[i]) {
                    // insert extension
                    childBranch.children[i] = new ExtensionNode(node, undefined);
                } else {
                    if (!childBranch.children[i]) {
                        // insert branch
                        childBranch.children[i] = new BranchNode(node, storageKey);
                    } else if (storageKey && !((childBranch.children[i] as BranchNode).children[16])) {
                        (childBranch.children[i] as BranchNode).children[16] = new LeafNode(rlp.decode(node[16]) as any, storageKey);
                    }
                }
                return childBranch.children[i];
            }
            // check nested
            if (childBranch.children[i]) {
                if (childBranch.children[i] instanceof BranchNode || childBranch.children[i] instanceof ExtensionNode) {
                    let newNode = this.insertChild(childBranch.children[i] as ParentNode, node, parentNode, storageKey, isLeaf);
                    if (newNode !== undefined) {
                        this.logger.debug('new subnode');
                        return newNode;
                    }
                }
            }
        }
        return undefined;
    }

    insert(node, parentNode: ParentNode, storageKey, isLeaf): EmbeddedNode | undefined | null {
        const nodeRef = hexStringToBuffer(ethers.utils.keccak256(rlp.encode(node)));
        // const parentRef = ethers.utils.keccak256(rlp.encode(parentNode));

        // find the parent node
        if (!(this.children instanceof Array)) {
            // root is extension node
            if (!this.children) {
                this.children = new BranchNode(node, storageKey);
                return this.children;
            }
            // -> check nested
            return this.insertChild(this.children as BranchNode, node, parentNode, storageKey, isLeaf);
        }

        // root is branch node
        for (let i = 0; i < this.children.length; i++) {
            if (this.root[i].equals(nodeRef)) {
                if (isLeaf) {
                    // insert leaf
                    this.children[i] = new LeafNode(node, storageKey);
                } else if (node.length === 2 && !this.children[i]) {
                    // insert extension
                    this.children[i] = new ExtensionNode(node, undefined);
                } else {
                    if (!this.children[i]) {
                        // insert branch
                        this.children[i] = new BranchNode(node, storageKey);
                    } else if (storageKey && !((this.children[i] as BranchNode).children[16])) {
                        (this.children[i] as BranchNode).children[16] = new LeafNode(rlp.decode(node[16]) as any, storageKey);
                    }
                }
                return this.children[i];
            }
            // check nested
            if (this.children[i]) {
                if (this.children[i] instanceof BranchNode || this.children[i] instanceof ExtensionNode) {
                    let newNode = this.insertChild(this.children[i] as ParentNode, node, parentNode, storageKey, isLeaf);
                    if (newNode !== undefined) {
                        this.logger.debug('new subnode');
                        
                        return newNode;
                    }
                }
            }
        }

        return undefined;
    }

    encode() {
        if (this.root instanceof LeafNode) return rlp.encode(this.root.encode());
        else if (!this.children) return null;
        
        if (this.children instanceof Array) {
            // its a branch as a root
            const nodes = this.children.map(n => {
                if (n) {
                    return n.encode();
                } else {
                    return [];
                }
            });

            return rlp.encode([[this.root], nodes]);
        }

        // its an extension
        return rlp.encode([[this.root], [this.children]]);
    }
}

type EmbeddedNode = LeafNode | BranchNode | ExtensionNode;
type ParentNode = BranchNode | ExtensionNode | ProofPathBuilder;

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

class ExtensionNode {
    node: Buffer[];
    child: EmbeddedNode | undefined;

    constructor(node: Buffer[], child: EmbeddedNode | undefined) {
        this.node = node;
        this.child = child;
    }

    encode() {
        if (!this.child) return undefined
        return [ [this.node], [this.child.encode()] ];
    }
}

class BranchNode {
    // [[path, hash]]
    node: Buffer[];
    commonNodes: [];
    children: (EmbeddedNode | null)[];


    constructor(node: Buffer[], storageKey) {
        this.node = node;
        this.children = new Array(17).fill(null);
        this.commonNodes = [];
        if (storageKey) {
            this.children[16] = new LeafNode(rlp.decode(this.node[16]) as any, storageKey)
        }
    }

    hasLeaf() {
        for (let i = 0; i < this.children.length; i++) {
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
        const nodes = this.children.map(n => {
            if (n) {
                return n.encode();
            } else {
                return [];
            }
        });
        return [[...this.commonNodes, this.node], nodes];
    }
}

/**
 * A value node is either a leaf that holds the final value of the storage key or another divergent path
 */
export class ValueNode {
    /**
     * The final value
     */
    value: Buffer;
    /**
     * Another divergent path
     */
    path?: ProofPath;

    constructor(value: Buffer, path?: ProofPath) {
        this.value = value;
        this.path = path;
    }

    insert(node, parentNode, storageKey, isLeaf) {

    }

    static empty() {
        return new ValueNode(Buffer.from([]))
    }
}

/**
 * Represents a path of merkle trie nodes that all underlying leaf nodes share
 */
export class ProofPath {
    /**
     * The path of merkle nodes to the last common branch all nodes share, which is a branch node
     */
    commonPath: Buffer[];
    /**
     * The values of the nodes grouped by index of the
     */
    values: ValueNode[];

    constructor() {

    }
}

export interface StorageProof {
    key: string;
    value: string;
    proof: string[];
}

export async function encodeStorageProof(storageProof: StorageProof, storageRoot, logger: Logger): Promise<Buffer> {
    const log = logger.getChildLogger({ name: 'encodeStorageProof' });
    const trie = new Trie(null, hexStringToBuffer(storageRoot));
    const storageNodes = format_proof_nodes(storageProof.proof);
    const storageTrie = await Trie.fromProof(storageNodes, trie);
    const storageKey = hexStringToBuffer(ethers.utils.keccak256(ethers.utils.hexZeroPad(storageProof.key, 32)));
    const path = await storageTrie.findPath(storageKey) as any;
    let parentNodes = formatPathStack(path);
    // const key = Buffer.from("00" + storageKey.toString("hex"), "hex");
    log.trace(`key: ${storageProof.key}, value: ${storageProof.value}`);
    log.trace(parentNodes);
    log.trace(ethers.utils.keccak256(rlp.encode(parentNodes[parentNodes.length - 1])));
    const entries = [
        hexStringToBuffer(ethers.utils.hexZeroPad(storageProof.key, 32)),
        utils.encode(storageProof.value),
        rlp.encode(parentNodes),
    ];
    return utils.encode(entries);
}

export function decodeStorageProof(buf: Buffer): StorageProof {
    const it = rlp.decode(buf) as any;
    assert(it.length === 3, "Rlp encoded storage proof requires exactly 3 entries found" + it.length);
    return {
        key: utils.hexlify(it[0]),
        value: utils.hexlify(it[1]),
        proof: it[2].map(p => utils.hexlify(p))
    };
}