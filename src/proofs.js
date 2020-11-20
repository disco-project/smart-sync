const rlp = require('rlp');
const mpt = require('merkle-patricia-tree');
const {encode, decode, toBuffer, keccak, KECCAK256_RLP_ARRAY, KECCAK256_NULL} = require('eth-util-lite')

class Proofs {

    constructor(web3) {
        this.web3 = web3;
    }

    /**
     * @txHash the hash of the targeted transaction
     */
    async receiptProof(txHash) {
        const receipt = await this.web3.eth.getTransactionReceipt(txHash);
        const block = await this.web3.eth.getBlock(receipt.blockHash);

        const allReceipts = await Promise.all(block.transactions.map((siblingTxHash) => {
            return this.web3.eth.getTransactionReceipt(siblingTxHash)
        }));

        const trie = new mpt.BaseTrie();

        await Promise.all(allReceipts.map((siblingReceipt, index) => {
            let siblingPath = encode(index);
            let serializedReceipt = Receipt.fromWeb3(siblingReceipt).serialize();
            return trie.put(siblingPath, serializedReceipt)
        }));

        const path = await trie.findPath(
            encode(receipt.transactionIndex)
        );

        return {
            header: Header.fromBlock(block),
            // All the parent nodes, parentNodes = encode(receiptProof)
            receiptProof: Proof.fromStack(path.stack),
            // path
            txIndex: '0x' + receipt.transactionIndex.toString(16)
        }
    }

    static prepareReceiptProof(proof) {
        // the path is hex prefix encoded
        const indexBuffer = proof.txIndex.slice(2);
        let hpIndex = "0x" + (indexBuffer.startsWith("0") ? "1" + indexBuffer.slice(1) : "00" + indexBuffer);

        if(proof.txIndex === "0x0") {
            hpIndex = "0x080"
        }
        // the value is the second buffer in the leaf (last node)
        const value = "0x" + Buffer.from(proof.receiptProof[proof.receiptProof.length - 1][1]).toString("hex");
        // the parent nodes must be rlp encoded
        const parentNodes = rlp.encode(proof.receiptProof);

        return {
            path: hpIndex,
            rlpEncodedReceipt: value,
            parentNodes
        };
    };
}

module.exports = Proofs;

class Proof extends Array {

    constructor(raw = Proof.NULL) {
        super(...raw)
    }

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

class Header extends Array {

    static fromBlock(block) {
        return new this(
            [
                toBuffer(block.parentHash),
                toBuffer(block.sha3Uncles) || KECCAK256_RLP_ARRAY,
                toBuffer(block.miner),
                toBuffer(block.stateRoot) || KECCAK256_NULL,
                toBuffer(block.transactionsRoot) || KECCAK256_NULL,
                toBuffer(block.receiptsRoot) || toBuffer(block.receiptRoot) || KECCAK256_NULL,
                toBuffer(block.logsBloom),
                toBuffer(block.difficulty),
                toBuffer(block.number),
                toBuffer(block.gasLimit),
                toBuffer(block.gasUsed),
                toBuffer(block.timestamp),
                toBuffer(block.extraData),
                toBuffer(block.mixHash),
                toBuffer(block.nonce)
            ]
        )
    }

    constructor(raw = Receipt.NULL) {
        super(...raw)
    }
}

class Receipt extends Array {

    constructor(raw = Receipt.NULL) {
        super(...raw)
    }

    static fromWeb3(receipt) {
        const logs = []
        for (let i = 0; i < receipt.logs.length; i++) {
            logs.push(Log.fromWeb3(receipt.logs[i]))
        }
        const status = receipt.status ? "0x01" : "0x0";

        return new Receipt([
            toBuffer(status || receipt.root),
            toBuffer(receipt.cumulativeGasUsed),
            toBuffer(receipt.logsBloom),
            logs
        ])
    }

    serialize() {
        return encode(this)
    }
}

class Log extends Array {

    constructor(raw = Log.NULL) {
        super(...raw)
    }

    static fromWeb3(log) {
        const topics = []
        for (let i = 0; i < log.topics.length; i++) {
            topics.push(toBuffer(log.topics[i]))
        }
        return new Log([
            toBuffer(log.address),
            topics,
            toBuffer(log.data)
        ])
    }

    serialize() {
        return encode(this)
    }
}