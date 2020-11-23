import Web3 from 'web3';

const web3 = new Web3('http://127.0.0.1:8545');

(async () => {
    const accounts = await web3.eth.getAccounts();
    const resp = await web3.eth.sendTransaction({from: accounts[0], to: accounts[1], value: 1000});
    console.log(resp);
    console.log(await web3.eth.getBalance(accounts[0]));
})();



