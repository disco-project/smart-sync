const Web3 = require('web3');
const fs = require('fs');
const rlp = require('rlp');
const EthereumBlock = require("ethereumjs-block/from-rpc");
const {Header, Proof, Receipt, Transaction} = require('eth-object')

const mpt = require('merkle-patricia-tree')
const Trie = mpt.BaseTrie;

require('dotenv').config();
const web3 = new Web3(new Web3.providers.HttpProvider(`https://ropsten.infura.io/v3/${process.env.INFURA_KEY}`))
const Tx = require('ethereumjs-tx').Transaction
// const web3 = new Web3("ws://localhost:8545");

// the address that will send the test transaction
const addressFrom = '0x48F3a3293A793ED74bcf55433fedF0D2F1415BfB';
const privateKey = Buffer.from("f5433ee77598768a0b68bf7f859a839aabfd61e2be0c07305546849f5d41ec06", 'hex');

// the destination address
const addressTo = '0x3392795369dd9978462784e682eC02DF239f77E8';

const simple = require('../build/contracts/SimpleContract.json').abi;
const contract = new web3.eth.Contract(simple, "0x3392795369dd9978462784e682eC02DF239f77E8");

async function remote() {
    const call = await contract.methods.setValue(400);
    const txData = {
        gasLimit: web3.utils.toHex(2500000),
        gasPrice: web3.utils.toHex(10e9),
        to: addressTo,
        from: addressFrom,
        data: call.encodeABI()
    }

    // get the number of transactions sent so far so we can create a fresh nonce
    const txCount = await web3.eth.getTransactionCount(addressFrom);
    const newNonce = web3.utils.toHex(txCount);

    const transaction = new Tx({...txData, nonce: newNonce}, {chain: 'ropsten'});
    transaction.sign(privateKey);
    const serializedTx = transaction.serialize().toString('hex');

    const res = await web3.eth.sendSignedTransaction('0x' + serializedTx)
}

async function getProof() {
    const storage = await web3.eth.getStorageAt(
        addressTo, 0
    );

    const proof = await web3.eth.getProof(addressTo, [0], "latest");
    console.log(proof);
}

async function receiptProof(txHash) {
    const targetReceipt = await web3.eth.getTransactionReceipt(txHash);
    const block = await web3.eth.getBlock(targetReceipt.blockHash);

    const receipts = await Promise.all(block.transactions.map((siblingTxHash) => {
        return web3.eth.getTransactionReceipt(siblingTxHash)
    }))
    const tree = new Trie();

    await Promise.all(receipts.map((siblingReceipt, index) => {
        let siblingPath = rlp.encode(index);
        let serializedReceipt = Receipt.fromRpc(siblingReceipt).serialize()
        return tree.put(siblingPath, serializedReceipt)
    }))

    const path = await tree.findPath(rlp.encode(targetReceipt.transactionIndex));

    return {
        header: Header.fromRpc(block),
        receiptProof: Proof.fromStack(path.stack),
        txIndex: targetReceipt.transactionIndex,
    }
}

async function getEvents() {
    const events = await contract.getPastEvents('SetValue', {
        fromBlock: 9044949, toBlock: 'latest'
    });
    console.log(events);
}

const main = async () => {

    await receiptProof("0x2f87826c914dd299a4be292e32d118d31d5cd579b4a9ddc9801e7031fc858c4e");

    // await contract.events.SetValue({}, (err, event) => {
    //     console.log("event", event);
    //
    // });
}

main()
