import {format_proof_nodes, GetProof, hexStringToBuffer, verify_eth_getProof} from "./verify-proof";
import {BaseTrie as Trie} from "merkle-patricia-tree";
import {ethers} from "hardhat";
import * as rlp from "rlp";

/**
 * Prepares the Merkle proof payload for on chain verification
 * @param proof [`eth_getProof`](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1186.md)
 * @param stateRoot The state root of the block
 */
export async function buildAccountProof(proof: GetProof, stateRoot): Promise<MerkleProof> {
    await verify_eth_getProof(proof, stateRoot);
    const accountProofNodes = format_proof_nodes(proof.accountProof);
    const trie = new Trie(null, hexStringToBuffer(stateRoot));
    const accountTrie = await Trie.fromProof(accountProofNodes, trie);
    const accountKey = hexStringToBuffer(ethers.utils.keccak256(proof.address));
    const path = await accountTrie.findPath(accountKey) as any;
    const parentNodes = formatPathStack(path);
    const value = rlp.decode(path.node.value);

    return {
        value: '0x' + rlp.encode(value).toString('hex'),
        encodedPath: '0x00' + accountKey.toString('hex'),
        parentNodes: '0x' + rlp.encode(parentNodes).toString('hex'),
        root: stateRoot
    };
}

interface MerkleProof {
    // The value inside the trie
    value,
    // The HP encoded path leading to the value
    encodedPath,
    // The rlp encoded stack of nodes
    parentNodes,
    // The root hash of the trie
    root
}

export function formatPathStack(path) {
    return path.stack.map(node => node.raw())
}

export class ProofMerger {
    private provider;

    constructor(provider) {
        this.provider = provider;
    }

    async mergeProof(proof: GetProof) {

    }

}