import { assert } from 'console';
import * as rlp from 'rlp';
import { Logger } from 'tslog';
import { Proof, Trie } from 'merkle-patricia-tree/dist/baseTrie';
import { ethers } from 'ethers';
import {
    Account, IGetProof, ParentNode, StorageProof,
} from './Types';
import * as utils from '../utils/utils';
import { logger } from '../utils/logger';
import ProofPathBuilder, { addDeletedValue } from './ProofPathBuilder';

export function decodeStorageProof(buf: Buffer): StorageProof {
    const it = rlp.decode(buf) as any;
    assert(it.length === 3, `Rlp encoded storage proof requires exactly 3 entries found${it.length}`);
    return {
        key: utils.hexlify(it[0]),
        value: utils.hexlify(it[1]),
        proof: it[2].map((p) => utils.hexlify(p)),
    };
}

export function decodeAccount(buf: Buffer): Account {
    const it = rlp.decode(buf) as any;
    assert(it.length === 4, 'Rlp encoded account requires exactly 4 entries');
    return {
        nonce: utils.hexlify(it[0]),
        balance: utils.hexlify(it[1]),
        storageHash: utils.hexlify(it[2]),
        codeHash: utils.hexlify(it[3]),
    };
}

export function encodeAccount(element: Account): Buffer {
    const keys = [
    // nonce and balance are returned as integer
        ethers.BigNumber.from(element.nonce).toNumber(),
        ethers.BigNumber.from(element.balance).toNumber(),
        utils.hexStringToBuffer(element.storageHash),
        utils.hexStringToBuffer(element.codeHash),
    ];
    return utils.encode(keys);
}

function formatPathStack(path: any) {
    return path.stack.map((node: any) => node.raw());
}

/**
 * Convert an Array of hex strings into a proof
 * @param proof
 */
export function formatProofNodes(proof: string[]): Proof {
    return proof.map(utils.hexStringToBuffer);
}

async function encodeStorageProof(storageProof: StorageProof, storageRoot): Promise<Buffer> {
    const log = logger.getChildLogger({ name: 'encodeStorageProof' });
    const trie = new Trie(null, utils.hexStringToBuffer(storageRoot));
    const storageNodes = formatProofNodes(storageProof.proof);
    const storageTrie = await Trie.fromProof(storageNodes, trie);
    const storageKey = utils.hexStringToBuffer(ethers.utils.keccak256(ethers.utils.hexZeroPad(storageProof.key, 32)));
    const path = await storageTrie.findPath(storageKey) as any;
    const parentNodes = formatPathStack(path);
    // const key = Buffer.from("00" + storageKey.toString("hex"), "hex");
    log.trace(`key: ${storageProof.key}, value: ${storageProof.value}`);
    log.trace(parentNodes);
    log.trace(ethers.utils.keccak256(rlp.encode(parentNodes[parentNodes.length - 1])));
    const entries = [
        utils.hexStringToBuffer(ethers.utils.hexZeroPad(storageProof.key, 32)),
        utils.encode(storageProof.value),
        rlp.encode(parentNodes),
    ];
    return utils.encode(entries);
}

class GetProof implements IGetProof {
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
    static decode(buf: Buffer, address) {
        const it = rlp.decode(buf);
        assert(it.length === 3, 'Rlp encoded Proof requires exactly 3 entries');
        const account = decodeAccount(it[0] as any);
        const accountProof = (rlp.decode(it[1]) as any).map((p) => utils.hexlify(p));
        const storageProof = (rlp.decode(it[2]) as any).map((p) => decodeStorageProof(p));

        return new GetProof({
            accountProof,
            address,
            balance: account.balance,
            codeHash: account.codeHash,
            nonce: account.nonce,
            storageHash: account.storageHash,
            storageProof,
        });
    }

    constructor(proof) {
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

    async optimizedProof(stateRoot: string, includeStorage: Boolean = true) {
        const account = encodeAccount(this.account());
        const accountNodes = await this.encodeParentNodes(stateRoot);
        const storage = includeStorage ? this.optimizedStorageProof() : [];
        return utils.encode(
            [
                account, accountNodes, storage,
            ],
        );
    }

    /**
     * optimize the storage proof paths
     */
    optimizedStorageProof() {
        let pathNodes: ProofPathBuilder | undefined;
        let rootNode;
        this.storageProof.forEach((storageProof) => {
            let parentNode: ParentNode | undefined;
            // loop over all proof nodes
            storageProof.proof.forEach((proofNode, i) => {
                const node = rlp.decode(utils.hexStringToBuffer(proofNode));

                if (!pathNodes) {
                    // todo leaf as root could also be deleted...
                    if (i === storageProof.proof.length - 1 && storageProof.value !== '0x0') { // node.length === 2
                        // only one node in the tree
                        this.logger.debug('Leaf as root');
                        pathNodes = new ProofPathBuilder(node, storageProof.key);
                    } else {
                        // its an extension or branch
                        pathNodes = new ProofPathBuilder(node);
                    }
                    rootNode = proofNode;
                }
                if (rootNode === proofNode) {
                    // skip root if not a proof for deleted value at root branch
                    parentNode = pathNodes;
                    if (i !== (storageProof.proof.length - 1)) return;
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
                        if (!parentNode.equals(storageProof.proof[i])) parentNode = pathNodes.addBranch(node, parentNode, storageProof.key);
                        if (storageProof.value === '0x0' && parentNode) {
                            this.logger.debug('inserting leaf for deleted value');
                            addDeletedValue(parentNode, storageProof);
                        }
                    } else {
                        this.logger.debug('branch');
                        parentNode = pathNodes.addBranch(node, parentNode, undefined);
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
            });
        });
        // return the encoded proof
        return pathNodes ? pathNodes.encode() : [];
    }

    async encoded(stateRoot: string): Promise<Buffer> {
        const account = encodeAccount(this.account());
        const accountNodes = await this.encodeParentNodes(stateRoot);
        const storage = await this.encodedStorageProofs();
        return utils.encode([
            account,
            accountNodes,
            storage,
        ]);
    }

    /**
     * @return rlp encoded list of rlp encoded storage proofs
     */
    async encodedStorageProofs(): Promise<Buffer> {
        const storage = await Promise.all(this.storageProof.map((p) => encodeStorageProof(p, this.storageHash)));
        return utils.encode(storage);
    }

    private async encodeParentNodes(stateRoot: string): Promise<Buffer> {
        const trie = new Trie(null, utils.hexStringToBuffer(stateRoot));
        const accountProofNodes = formatProofNodes(this.accountProof);
        const accountTrie = await Trie.fromProof(accountProofNodes, trie);
        const accountKey = utils.hexStringToBuffer(ethers.utils.keccak256(this.address));
        const path = await accountTrie.findPath(accountKey) as any;
        const parentNodes = formatPathStack(path);
        return rlp.encode(parentNodes);
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

export default GetProof;
