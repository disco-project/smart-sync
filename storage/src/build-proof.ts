import {format_proof_nodes, GetProof, hexStringToBuffer, verify_eth_getProof} from "./verify-proof";
import {BaseTrie as Trie} from "merkle-patricia-tree";
import {ethers} from "hardhat";
import * as rlp from "rlp";

export async function verify() {

}

export async function buildAccountProof(proof: GetProof, stateRoot): Promise<MerkleProof> {
    await verify_eth_getProof(proof, stateRoot);
    const accountProofNodes = format_proof_nodes(proof.accountProof);
    let trie = new Trie(null, hexStringToBuffer(stateRoot));
    const accountTrie = await Trie.fromProof(accountProofNodes, trie);
    let accountKey = hexStringToBuffer(ethers.utils.keccak256(proof.address));
    const path = await accountTrie.findPath(accountKey) as any;
    let parentNodes = formatPathStack(path);
    let value = rlp.decode(path.node.value);

    return {
        value: '0x' + rlp.encode(value).toString('hex'),
        encodedPath: '0x00' + accountKey.toString('hex'),
        parentNodes: '0x' + rlp.encode(parentNodes).toString('hex'),
        root: stateRoot
    };
}

interface MerkleProof {
    value,
    encodedPath,
    parentNodes,
    root
}

export function formatPathStack(path) {
    return path.stack.map(node => node.raw())
}

var rawStack = (input) => {
    let output:any[] = []
    for (var i = 0; i < input.length; i++) {
        output.push(input[i].raw())
    }
    return output
}