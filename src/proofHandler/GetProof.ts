import { assert } from 'console';
import * as rlp from 'rlp';
import { Logger } from 'tslog';
import { Proof, Trie } from 'merkle-patricia-tree/dist/baseTrie';
import { ethers } from 'ethers';
import {
    Account, IGetProof, ParentNode, StorageProof,
    EmbeddedNode,
} from './Types';
import * as utils from '../utils/utils';
import { logger } from '../utils/logger';
import ProofPathBuilder, { addDeletedValue } from './ProofPathBuilder';
import BranchNode from './BranchNode';
import ExtensionNode from './ExtensionNode';

/**
* Get additional keys that might be needed to rebuild the old MT at the ProxyContract.
* @Param node: either branch or extension
* @Param unchangedKeys: an array of all unchanged keys
* @Param currMTHeight: curr height position in the MT of the contract storage
* @Param currPath: curr encoded path at currMTHeight
*/
function getRequiredKeys(node: EmbeddedNode, unchangedKeys: Array<string>, currMTHeight: number = 0, currPath: string = ''): Array<string> {
    if (node instanceof BranchNode) {
        const childrenCount = node.children.filter((child) => child !== null).length;
        const hashedChildrenCount = node.node.filter((hashedChild) => hashedChild.length !== 0).length;
        /*
        *   Currently, it only checks if #children - 1 of a parent node change/delete/add and then
        *   adds that last key to be sure that if every other child gets deleted/added, the
        *   proxyContract can rebuild its old MT storage
        *   -> This will most likely only cover the following case:
        *       - Values are added at a branch where there was a leaf before.
        */
        if (childrenCount === hashedChildrenCount - 1) {
            const unchangedKeysFromMTHeight = unchangedKeys.filter((key) => {
                const hashedKey = ethers.utils.keccak256(ethers.utils.hexZeroPad(key, 32));
                if (hashedKey.substring(2, currMTHeight + 2) === currPath) {
                    return node.children[hashedKey[currMTHeight + 2 + 1]] === null;
                }
                return false;
            });
            return unchangedKeysFromMTHeight;
        }
        return node.children.flatMap((child, index) => (child ? getRequiredKeys(child, unchangedKeys, currMTHeight + 1, currPath + index.toString(16)) : []));
    }
    if (node instanceof ExtensionNode) {
        return node.child ? getRequiredKeys(node.child, unchangedKeys, currMTHeight + 1, currPath + node.getSharedNibbles()) : [];
    }
    return [];
}

export function decodeStorageProof(buf: Buffer): StorageProof {
    const it = rlp.decode(buf) as any;
    assert(it.length === 3, `Rlp encoded storage proof requires exactly 3 entries found ${it.length}`);
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

class GetProof implements IGetProof {
    accountProof: string[];

    address: string;

    balance: string;

    codeHash: string;

    nonce: string;

    storageHash: string;

    storageProof: StorageProof[];

    logger: Logger;

    provider?: ethers.providers.JsonRpcProvider;

    /**
     * @param buf
     * @param address
     */
    static decode(buf: Buffer, address: string) {
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

    constructor(proof, provider?: ethers.providers.JsonRpcProvider) {
        this.accountProof = proof.accountProof;
        this.address = proof.address;
        this.balance = proof.balance;
        this.codeHash = proof.codeHash;
        this.nonce = proof.nonce;
        this.codeHash = proof.codeHash;
        this.storageHash = proof.storageHash;
        this.storageProof = proof.storageProof;
        this.logger = logger.getChildLogger({ name: 'GetProof' });
        this.provider = provider;
    }

    /**
     * Generates rlp encoded account, rlp encoded account proof path and our optimized storage proof
     * @param stateRoot state root of the current block
     * @param includeStorage whether or not to generate optimized storage proof or just encode account and account path
     * @param unchangedKeys array of keys that stay unchanged between contract states.
     *                       Might be needed to build optimized storage proof such that MT altering key/value pair changes can be processed by ProxyContract
     */
    async optimizedProof(stateRoot: string, includeStorage: Boolean = true, unchangedKeys: Array<string> = []) {
        const account = encodeAccount(this.account());
        const accountNodes = await this.encodeParentNodes(stateRoot);
        const storage = includeStorage ? await this.optimizedStorageProof(unchangedKeys) : [];
        return utils.encode(
            [
                account, accountNodes, storage,
            ],
        );
    }

    /**
    * optimize the storage proof paths
    * @param unchangedKeys array of keys that stay unchanged between contract states.
    *                      Might be needed to build optimized storage proof such that MT altering key/value pair changes can be processed by ProxyContract
    */
    async optimizedStorageProof(unchangedKeys: Array<string>) {
        let pathNodes: ProofPathBuilder | undefined;
        let rootNode: string;
        this.storageProof.forEach((storageProof) => {
            let parentNode: ParentNode | undefined;
            // loop over all proof nodes
            storageProof.proof.forEach((proofNode, i) => {
                const node = rlp.decode(utils.hexStringToBuffer(proofNode));

                if (!pathNodes) {
                    // todo leaf as root could also be deleted...
                    if (i === storageProof.proof.length - 1 && storageProof.value !== '0x0') { // node.length === 2
                        // only one node in the tree
                        this.logger.trace('Leaf as root');
                        pathNodes = new ProofPathBuilder(node, storageProof.key);
                    } else {
                        // its an extension or branch
                        pathNodes = new ProofPathBuilder(node);
                    }
                    rootNode = proofNode;
                    parentNode = pathNodes;
                    // skip root if not a proof for deleted value at root branch
                    if (i !== (storageProof.proof.length - 1) || node.length === 2) return;
                }
                if (rootNode === proofNode) {
                    parentNode = pathNodes;
                    if (i !== (storageProof.proof.length - 1)) return;
                }
                if (!pathNodes || !parentNode) {
                    this.logger.error('not possible.');
                    process.exit(-1);
                }
                if (node.length === 17) {
                    // branch node
                    if (i === storageProof.proof.length - 1) {
                        // terminating
                        this.logger.debug('terminating branch');
                        if (!parentNode.nodeEquals(storageProof.proof[i])) parentNode = pathNodes.addBranch(node, parentNode, undefined);
                        if (storageProof.value === '0x0' && parentNode) {
                            this.logger.debug('inserting leaf for deleted value');
                            addDeletedValue(parentNode, storageProof);
                        }
                    } else {
                        this.logger.trace('branch');
                        parentNode = pathNodes.addBranch(node, parentNode, undefined);
                    }
                } else if (node.length === 2) {
                    if (i === storageProof.proof.length - 1) {
                        this.logger.trace('leaf');
                        // leaf
                        pathNodes.addValue(storageProof.key, node, parentNode);
                    } else {
                        // extension
                        this.logger.trace('extension');
                        parentNode = pathNodes.addExtension(node, parentNode);
                    }
                }
            });
        });
        // todo hier nochmal durchgehen und checken ob sich length - 1 values geaendert haben in einem Knoten
        if (pathNodes) {
            /*
            *   Checks if there are additional keys that might be needed to recreate the old
            *   MT at the proxyContract.
            *   Note: getRequiredKeys is still pretty basic and only covers few cases.
            */
            const additionalKeys = getRequiredKeys(pathNodes.root, unchangedKeys);
            if (additionalKeys.length > 0) {
                if (!this.provider) {
                    logger.error('Provider not provided and additional keys are needed.');
                    throw new Error();
                }
                // add required keys to the proof path object instance
                const proofs = await this.provider.send('eth_getProof', [this.address, additionalKeys]);
                (proofs.storageProof as Array<StorageProof>).forEach((storageProof) => {
                    let parentNode: ParentNode | undefined;
                    storageProof.proof.forEach((rlpNode, i) => {
                        const node = rlp.decode(utils.hexStringToBuffer(rlpNode));
                        if (!pathNodes) {
                            logger.error('Not possible.');
                            throw new Error();
                        }
                        if (!parentNode) parentNode = pathNodes;
                        if (node.length === 17) {
                            this.logger.trace('branch');
                            parentNode = pathNodes.addBranch(node, parentNode, undefined);
                        } else if (node.length === 2) {
                            if (i === storageProof.proof.length - 1) {
                                this.logger.trace('leaf');
                                // leaf
                                pathNodes.addValue(storageProof.key, node, parentNode);
                            } else {
                                // extension
                                this.logger.trace('extension');
                                parentNode = pathNodes.addExtension(node, parentNode);
                            }
                        }
                    });
                });
            }
        }

        // return the encoded proof
        return pathNodes ? pathNodes.encode() : [];
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
