import {Proof} from "merkle-patricia-tree/dist.browser/baseTrie";
import {ethers} from "ethers";
import * as rlp from "rlp";
import {BaseTrie as Trie} from "merkle-patricia-tree";
import assert from "assert";
import * as utils from "./utils";
import {formatPathStack} from "./build-proof";

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

    /**
     *
     * @param buf
     * @param address
     */
    static decode(buf: Buffer, address) {
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
    }

    async encoded(stateRoot): Promise<Buffer> {
        const account = encodeAccount(this.account());
        const accountNodes = await this.encodeParentNodes(stateRoot);
        const storage = await Promise.all(this.storageProof.map(
            (p) => {
                return encodeStorageProof(p, this.storageHash);
            }));
        return utils.encode(
            [
                account, accountNodes, utils.encode(storage)
            ]
        );
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

export interface StorageProof {
    key: string;
    value: string;
    proof: string[];
}

export async function encodeStorageProof(storageProof: StorageProof, storageRoot): Promise<Buffer> {
    const trie = new Trie(null, hexStringToBuffer(storageRoot));
    const storageNodes = format_proof_nodes(storageProof.proof);
    const storageTrie = await Trie.fromProof(storageNodes, trie);
    const storageKey = hexStringToBuffer(ethers.utils.keccak256(ethers.utils.hexZeroPad(storageProof.key, 32)));
    const path = await storageTrie.findPath(storageKey) as any;
    let parentNodes = formatPathStack(path);
    // const key = Buffer.from("00" + storageKey.toString("hex"), "hex");
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