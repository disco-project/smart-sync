## Getting started

This project uses [hardhat](https://hardhat.org/getting-started/) and [ethers](https://docs.ethers.io/v5/). 

To start the chain [see](../README.md)

To compile all the contracts and files run.

```bash
npx hardhat compile
```

To run all the tests run (requires a running ethereum node, see [hardhat.config.ts](./hardhat.config.ts) and [hardhat.org/config](https://hardhat.org/config/)):

```bash
npx hardhat test tests/*
```

Or a single test:

```bash
npx hardhat test tests/list-storage-test.ts
```