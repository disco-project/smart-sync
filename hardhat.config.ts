import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-typechain";

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
    },
    disco: {
      url: "http://127.0.0.1:8545",
      gas: 1000000000,
      timeout: 3600000
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