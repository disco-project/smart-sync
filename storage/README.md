# Getting started

Before you can run the CLI, you need ts-node installed globally:
```bash
npm i ts-node -g
```

Then, install the cli with the following command:
```bash
npm i -g
```

Under `./config` you can find the default configuration for the cli. Adjust the fields according to your needs or pass them as options in the command line

# Getting started (Dev)

This project uses [hardhat](https://hardhat.org/getting-started/) and [ethers](https://docs.ethers.io/v5/). 

To start the chain [see](../README.md)

To compile all the contracts and files run.

```bash
npx hardhat compile
```

To run all the tests run (requires a running ethereum node, see [hardhat.config.ts](./hardhat.config.ts) and [hardhat.org/config](https://hardhat.org/config/)):

```bash
npm run test
```

Or a single test:

```bash
npx hardhat test tests/list-storage-test.ts
```