import {Proof} from "merkle-patricia-tree/dist.browser/baseTrie";
import {ethers} from "ethers";
import * as rlp from "rlp";
import {BaseTrie as Trie} from "merkle-patricia-tree";

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
        const storageTrieKey = hexStringToBuffer(ethers.utils.keccak256(ethers.utils.hexZeroPad(storageProof.key, 32)));
        const storageTrieRoot = hexStringToBuffer(proof.storageHash);

        const val = storageProof.value === "0x0" ? Buffer.from([]) : hexStringToBuffer(ethers.BigNumber.from(storageProof.value).toHexString());
        const rlpValue = rlp.encode(val);

        const proofValue = await Trie.verifyProof(storageTrieRoot, storageTrieKey, format_proof_nodes(storageProof.proof));

        if (proofValue === null) {
            throw new Error(`Invalid storage proof: No storage value found for key: ${storageTrieKey.toString("hex")}`);
        }

        if (!rlpValue.equals(proofValue)) {
            throw new Error("Invalid storage proof");
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

function encodeAccount(element: Account): Buffer {
    const keys = [
        // nonce and balance are returned as integer
        ethers.BigNumber.from(element.nonce).toNumber(),
        ethers.BigNumber.from(element.balance).toNumber(),
        hexStringToBuffer(element.storageHash),
        hexStringToBuffer(element.codeHash),
    ];
    return rlp.encode(keys);
}

function encodeStringObject(element): Buffer {
    const keys = Object.values(element).map(val => hexStringToBuffer(<string>val));
    return rlp.encode(keys);
}

/**
 * Converts a string to a Buffer
 * Leading `0x` is stripped
 * @param hexString
 */
function hexStringToBuffer(hexString: string): Buffer {
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
export interface GetProof {
    accountProof: string[];
    address: string;
    balance: string;
    codeHash: string;
    nonce: string;
    storageHash: string;
    storageProof: StorageProof[];
}


export interface StorageProof {
    key: string;
    proof: string[];
    value: string;
}