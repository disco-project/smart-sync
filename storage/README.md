## Getting started

This project uses [hardhat](https://hardhat.org/getting-started/) and [ethers](https://docs.ethers.io/v5/). 

To start the chain [see](../README.md)

To compile all the contracts and files run.

```bash
npx hardhat compile
```

## Tests
To run all the tests run (requires a running ethereum node, see [hardhat.config.ts](./hardhat.config.ts) and [hardhat.org/config](https://hardhat.org/config/)):

```bash
npm run test
```

Or a single test:

```bash
npx hardhat test tests/list-storage-test.ts
```

## Evaluation
To run the evaluation run:

```bash
npm run evaluate
```

Or a specific evaluation:

```bash
npx hardhat test evaluation/update-multiple-values-with-map-sizes-1-1000.ts
```