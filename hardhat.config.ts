import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "@openzeppelin/hardhat-upgrades";
import "@typechain/hardhat";
import * as dotenv from "dotenv";

dotenv.config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(await account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

export default {
  defaultNetwork: "disco",
  networks: {
    hardhat: {
        accounts: [{
            privateKey: '0x2f6b8e2dc397013c43281c30e01bd6b67625031b2607b48fd72cc8c9aba08a3a',
            balance: '10000000000000000000000'
        }]
    },
    disco: {
      url: "http://127.0.0.1:8545",
      gas: 1000000,
      timeout: 3600000
    },
    disco2: {
        url: "http://127.0.0.1:8547",
        gas: 1000000000,
        timeout: 3600000
    },
    goerli: {
      url: process.env.RPC_URL_GOERLI,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
    },
    polygon_mumbai: {
      url: process.env.RPC_URL_MUMBAI,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
    },
    gnosis_testnet: {
      url: process.env.RPC_URL_GNOSIS_TESTNET,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
    }
  },
  typechain: {
    outDir: "src-gen/types",
    target: "ethers-v5",
  },
  solidity: {
    compilers: [
      {
        version: "0.6.2"
      },
      {
        version: "0.7.0",
        settings: { }
      }
    ]
  },
  mocha: {
      timeout: 36000000
  }
};