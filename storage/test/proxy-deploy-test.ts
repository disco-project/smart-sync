import {RelayContract__factory, SyncCandidate, SyncCandidate__factory,} from "../src-gen/types";
import {ethers} from "hardhat";
import {expect} from "chai";
import {
    Account,
    encodeAccount,
    format_proof_nodes,
    GetProof,
    hexStringToBuffer,
    verifyStorageProof
} from "../src/verify-proof";
import {portContract} from "../src/port-contract";
import {getAllKeys} from "../src/utils";
import {StorageDiffer} from "../src/get-diff";
import * as rlp from "rlp";
import {BaseTrie as Trie} from "merkle-patricia-tree";
import {LeafNode} from "merkle-patricia-tree/dist.browser/trieNode";


describe("Deploy proxy and logic contract", async function () {
    let deployer;
    let srcContract: SyncCandidate;
    let provider;
    let factory: SyncCandidate__factory;

    it("Should deploy initial contract and set an initial value", async function () {
        [deployer] = await ethers.getSigners();
        factory = new SyncCandidate__factory(deployer);
        srcContract = await factory.deploy();
        provider = new ethers.providers.JsonRpcProvider();
        await srcContract.setValueA(42);
        expect(await srcContract.getValueA()).to.be.equal(ethers.BigNumber.from(42));
    });

    it("Should copy the source contract", async function () {
        const targetContract = await factory.deploy();
        await targetContract.setValueA(42);
        expect((await new StorageDiffer(provider).getDiff(srcContract.address, targetContract.address)).isEmpty()).to.be.true;
        const keys = await getAllKeys(srcContract.address, provider);

        const latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

        const proof = <GetProof>await provider.send("eth_getProof", [srcContract.address, keys]);

        // deploy the relay contract
        const Relayer = new RelayContract__factory(deployer);
        const relayContract = await Relayer.deploy(latestBlock.hash, proof.address, latestBlock.stateRoot, proof.storageHash);

        const accountProofNodes = format_proof_nodes(proof.accountProof);

        let trie = new Trie(null, hexStringToBuffer(latestBlock.stateRoot));

        const accountTrie = await Trie.fromProof(accountProofNodes, trie);
        let accountKey = hexStringToBuffer(ethers.utils.keccak256(proof.address))
        const path = await accountTrie.findPath(accountKey) as any;
        const encodedPath = rlp.encode(path.node.key);

        const acc = <Account>{
            nonce: proof.nonce,
            balance: proof.balance,
            storageHash: proof.storageHash,
            codeHash: proof.codeHash
        };
        const rlpAcc = encodeAccount(acc);

        console.log("acc", acc);
        console.log(await relayContract.parseAccount(rlpAcc));

        const trieProof = await Trie.createProof(accountTrie, accountKey);

        const rlpProofNodes = rlp.encode(trieProof);

        console.log("latestBlock.stateRoot ", latestBlock.stateRoot);
        console.log("proof.storageHash ", proof.storageHash);
        console.log("getStorageRoot ", await relayContract.getStorageRoot(latestBlock.hash));
        console.log("getStateRoot ", await relayContract.getStateRoot(latestBlock.hash));

        const stack = Proof.fromStack(path.stack);

        const rawStack = path.stack.map(s => s.raw());

        // console.log(stack[stack.length-1]);
        // console.log(rlpAcc);
        // console.log(path.node.key.length);
        // console.log("0x" + Buffer.from(path.node.key).toString("hex"));
        console.log("account key ", accountKey.toString("hex"));
        console.log("stack length ", path.stack.length);
        console.log("STACK", rawStack[1]);
        const val = await accountTrie.get(accountKey) as any;

        const x = await Trie.verifyProof(hexStringToBuffer(latestBlock.stateRoot), accountKey, trieProof);
        console.log("X:", x);
        console.log("rlpacc:", rlpAcc);
        console.log("ENCODED KEY", Buffer.from(path.node.encodedKey()).toString("hex"));
        const resp = await relayContract.verify(
                rlpAcc,
           // LeafNode.encodeKey(path.node._nibbles),
           Buffer.from(path.node.encodedKey()),
           // accountKey,
            rlp.encode(rawStack),
            trie.root
        );

        const logs = await provider.getLogs({
            fromBlock: latestBlock.blockNumber,
            toBlock: "latest",
            address: relayContract.address
        });

        console.log("");

        let abi = [
            "event ReturnValue(string msg, uint num, bytes currentNode, bytes32 nodekey)"
        ];

        let iface = new ethers.utils.Interface(abi)
        for(let log of logs) {
            console.log("MSG", iface.parseLog(log).args[0]);
            console.log("INDEX", iface.parseLog(log).args[1]);
            try {
                console.log("CURRENT_NODE", rlp.decode(Buffer.from(iface.parseLog(log).args[2].slice(2), "hex")));
                console.log(ethers.utils.keccak256(Buffer.from(iface.parseLog(log).args[2].slice(2))));
            } catch (e) {
                console.log("PATH", iface.parseLog(log).args[2]);
            }
            console.log("NODE KEY", iface.parseLog(log).args[3].slice(2));
        }
        console.log("\nRESP", resp.value);

    })


})

class Proof extends Array {

    static fromStack(stack) {
        const arrayProof = stack.map((trieNode) => {
            return trieNode.raw()
        })
        return new Proof(arrayProof)
    }

    serialize() {
        return encode(this)
    }
}

const encode = input => (input === '0x0')
    ? rlp.encode(Buffer.alloc(0))
    : rlp.encode(input);