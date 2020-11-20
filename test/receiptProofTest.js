const SimpleContract = artifacts.require("SimpleContract");
const ProofContract = artifacts.require("ProofContract");
const RelayContract = artifacts.require("RelayContract");
const Proofs = require("../src/proofs");
const EthereumBlock = require("ethereumjs-block/from-rpc");
const rlp = require('rlp');

contract("Event proofs", accounts => {

    let txHash;
    let blockHash;

    async function getEvents(simple) {
        return await simple.getPastEvents('SetValue', {
            fromBlock: 0, toBlock: 'latest'
        })
    }

    it("should set the value in the SimpleContract", async function () {
        const simple = await SimpleContract.deployed();
        const res = await simple.setValue.sendTransaction(42);
    })

    it("should submit event blocks", async function () {
        const relay = await RelayContract.deployed();
        const simple = await SimpleContract.deployed();
        const events = await getEvents(simple);

        assert.isNotEmpty(events);

        for (let i = 0; i < events.length; i++) {
            // let block = await w.eth.getBlock(6339082);
            let block = await web3.eth.getBlock(events[i].blockHash);
            txHash = events[i].transactionHash;
            // txHash = "0x0ea44167dd31bca6a29a8f5c52fe4b73e92a7f6b9898322e8dc70478a7366806";
            blockHash = web3.utils.toBN(block.hash);
            block = new EthereumBlock(block);
            const header = block.header;
            const encodedHeader = rlp.encode(header.raw);
            const resp = await relay.submitBlock.sendTransaction(
                blockHash, encodedHeader, {
                    gasLimit: web3.utils.toHex(2500000),
                    gasPrice: web3.utils.toHex(10e9)
                }
            );
        }
    })

    it("event merkle inclusion", async () => {
        const proofContract = await ProofContract.deployed();
        const proofs = new Proofs(web3);

        const pr = await proofs.receiptProof(txHash);
        const receiptProof = Proofs.prepareReceiptProof(pr);
        const resp = await proofContract.checkReceiptProof.call(
            receiptProof.rlpEncodedReceipt,
            blockHash,
            receiptProof.path,
            receiptProof.parentNodes,
            {
                from: accounts[0],
            }
        );
        assert(resp);
    })
})