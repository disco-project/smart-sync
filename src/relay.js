const Web3 = require('web3');
const web3 = new Web3("ws://localhost:8545");
const EthereumBlock = require("ethereumjs-block/from-rpc");
const rlp = require('rlp');
const relay = require("../build/contracts/Relay.json");

async function testRlp() {
    const accounts = await web3.eth.getAccounts();
    const latest = await web3.eth.getBlock('latest');
    const block = new EthereumBlock(latest);
    const header = block.header;
    const encoded = rlp.encode(header.raw);
    const contract = new web3.eth.Contract(relay["abi"], "0xC9AefAb77E778b746296D2CD1A5fA5502D7AfA23");
    // const resp = await contract.methods.getBlockHeader(encoded).call({from: accounts[0]});
    const resp = await contract.methods.getBlockHeader(encoded).call({from: accounts[0]});

    console.assert(
        web3.utils.toBN(resp.prevBlockHash).toBuffer().toString('hex') === header.parentHash.toString('hex')
    );
    console.assert(
        resp.txRoot === '0x' + header.transactionsTrie.toString('hex')
    );
    console.assert(
        resp.receiptRoot === '0x' + header.receiptTrie.toString('hex')
    );
    console.assert(
        resp.stateRoot === '0x' + header.stateRoot.toString('hex')
    );
}


const main = async () => {

    await testRlp();
    process.exit()
}

main()