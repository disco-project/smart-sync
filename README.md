# Getting started

## Installation CLI

Download the tarballed npm package on our [GitHub Respository](https://github.com/disco-project/cross-chain-contracts) and execute the following
```
$ npm i {CROSS_CHAIN_CLI_NPM_PACKAGE} -g
```

To compile the project yourself and install it, see section [Getting started (Dev)](#getting-started-dev)

Under `{INSTALL_DIR}/config` you can find the default configuration for the cli. Adjust the fields according to your needs or pass them as options in the command line.

To execute tests, please refer to the [test](#tests) section.

## Usage 

### fork

```bash 
$ cross-chain-cli help fork
Usage: cross-chain-cli fork|f [options] <src_contract_address> [relay_contract_address]

Migrates a given contract address to a target chain and deploys a proxy contract. If no relay contract is provided, a relay contract will be deployed too.

Options:
  -l, --log-level <level>           verbose level of logging (choices: "fatal", "error", "warn", "info", "debug",
                                    "trace", "silly", default: "debug")
  -s, --src-chain-rpc-host <url>    url of src chain rpc
  -t, --target-chain-rpc-url <url>  url of target chain rpc
  -c, --config-file <path>          path to the config file (default: "./config/cli-config.json")
  --connection-timeout <timeout>    connection timeout in ms
  --src-blocknr <number>            block number of src chain to use
  --diff-mode <mode>                Diff function to use (choices: "storage", "srcTx")
  --gas-limit <limit>               gas limit for tx on target chain
  -h, --help                        display help for command
```
Example usage:
```bash
$ cross-chain-cli fork 0x010A3d554c8d772aAC357e079B4D57B6dA28a43a
```

### synchronize

```bash
$ cross-chain-cli help synchronize
Usage: cross-chain-cli synchronize|s [options] <proxy_contract_address>

Synchronizes the storage of a proxy contract with its source contracts storage up to an optionally provided block nr on the source chain.

Options:
  -l, --log-level <level>           verbose level of logging (choices: "fatal", "error", "warn", "info", "debug", "trace", "silly", default: "debug")
  -s, --src-chain-rpc-host <url>    url of src chain rpc
  -t, --target-chain-rpc-url <url>  url of target chain rpc
  -c, --config-file <path>          path to the config file (default: "./config/cli-config.json")
  --connection-timeout <timeout>    connection timeout in ms
  --src-blocknr <number>            block number of src chain to use
  --diff-mode <mode>                Diff function to use. When using storage, option --src-BlockNr equals block on srcChain and --target-BlockNr block on targetChain. When using srcTx
                                    --src-BlockNr describes block from where to replay tx until --target-blockNr. (choices: "storage", "srcTx")
  --target-blocknr <number>         see --diff-mode for further explanation
  --gas-limit <limit>               gas limit for tx on target chain
  -h, --help                        display help for command
```

Example usage:
```bash
$ cross-chain-cli s 0x010A3d554c8d772aAC357e079B4D57B6dA28a43a --target-blockNr 450
```

### continuous-synch
```bash
$ cross-chain-cli continuous-synch --help
Usage: cross-chain-cli continuous-synch|c [options] <proxy_contract_address> <period>

Periodically synch state updates.

Arguments:
  proxy_contract_address
  period                            Define the updating period. Be sure to pass the period within " (Example: "*/2 * * * *"). The crontab syntax is based on the GNU crontab syntax. For information visit https://www.npmjs.com/package/node-cron.

Options:
  -l, --log-level <level>           verbose level of logging (choices: "fatal", "error", "warn", "info", "debug", "trace", "silly", default: "info")
  -s, --src-chain-rpc-host <url>    url of src chain rpc
  -t, --target-chain-rpc-url <url>  url of target chain rpc
  -c, --config-file <path>          path to the config file (default: "./config/cli-config.json")
  --connection-timeout <timeout>    connection timeout in ms
  --src-blocknr <number>            block number of src chain to use
  --gas-limit <limit>
  --diff-mode <mode>                Diff function to use. When using storage, option --src-BlockNr equals block on srcChain and --target-BlockNr block on targetChain. When using srcTx --src-BlockNr describes block from where to replay tx until --target-blockNr. (choices: "storage",
                                    "srcTx")
  --target-blocknr <number>         see --diff-mode for further explanation
  -h, --help                        display help for command
```

Example usage:
```bash
$ cross-chain-cli c 0x010A3d554c8d772aAC357e079B4D57B6dA28a43a "*/2 * * * *"
```

### migration-status
```bash
$ cross-chain-cli help migration-status
Usage: cross-chain-cli migration-status|status [options] <proxy_contract_address>

Checks if the storage root of the proxy contract equals the current storage root of the source contract in the relay contract on the target chain.

Options:
  -l, --log-level <level>           verbose level of logging (choices: "fatal", "error", "warn", "info", "debug", "trace", "silly", default: "debug")
  -s, --src-chain-rpc-host <url>    url of src chain rpc
  -t, --target-chain-rpc-url <url>  url of target chain rpc
  -c, --config-file <path>          path to the config file (default: "./config/cli-config.json")
  --connection-timeout <timeout>    connection timeout in ms
  --src-blocknr <number>            block number of src chain to use
  -h, --help                        display help for command
```
Example usage:
``` bash
$ cross-chain-cli status 0x010A3d554c8d772aAC357e079B4D57B6dA28a43a
```
### get-curr-blocknr
```bash
$ cross-chain-cli help get-curr-blocknr
Usage: cross-chain-cli get-curr-blocknr|blocknr [options] <proxy_contract_address>

Get the synched block number of src chain for the provided proxy contract.

Options:
  -l, --log-level <level>           verbose level of logging (choices: "fatal", "error", "warn", "info", "debug", "trace", "silly", default: "debug")
  -s, --src-chain-rpc-host <url>    url of src chain rpc
  -t, --target-chain-rpc-url <url>  url of target chain rpc
  -c, --config-file <path>          path to the config file (default: "./config/cli-config.json")
  --connection-timeout <timeout>    connection timeout in ms
  --src-blocknr <number>            block number of src chain to use
  -h, --help                        display help for command
```
Example usage:
```bash
$ cross-chain-cli blocknr 0x20a508640B446990c781Cd541B9a2828ACA3a350
```

### state-diff
```bash
$ cross-chain-cli help state-diff
Usage: cross-chain-cli state-diff|diff [options] <source_contract_address> [proxy_contract_address]

Shows the state diff between source contract and proxy contract on target chain. If diff-mode == storage, proxy_contract_address has to be provided.

Options:
  -l, --log-level <level>           verbose level of logging (choices: "fatal", "error", "warn", "info", "debug", "trace", "silly", default: "debug")
  -s, --src-chain-rpc-host <url>    url of src chain rpc
  -t, --target-chain-rpc-url <url>  url of target chain rpc
  -c, --config-file <path>          path to the config file (default: "./config/cli-config.json")
  --connection-timeout <timeout>    connection timeout in ms
  --src-blocknr <number>            block number of src chain to use
  --diff-mode <mode>                Diff function to use. When using storage, option --src-BlockNr equals block on srcChain and --target-BlockNr block on targetChain. When using srcTx
                                    --src-BlockNr describes block from where to replay tx until --target-blockNr. If no blocks are given when using srcTx, then only the latest block
                                    is examined. (choices: "storage", "srcTx")
  --target-blocknr <number>         see --diff-mode for further explanation
  -h, --help                        display help for command
```
Example usage:
```bash
$ cross-chain-cli diff 0x20a508640B446990c781Cd541B9a2828ACA3a350 0xf8f22ab160e8a09fbf404a44139d9b5da936e3cb --diff-mode storage --src-blocknr 450
```

# Getting started (Dev)

This project uses [hardhat](https://hardhat.org/getting-started/) and [ethers](https://docs.ethers.io/v5/) among other things.

### Install dev packages

```bash
$ npm i --development
```

### Compile project
To execute the compile-pipeline of this project run:

```bash
npx grunt compile-project
```

This cleans the dist folder, compiles the contracts, lints the src files and executes tsc. If you want to execute those steps individually see `npx grunt --help` for all available individual commands:

Available tasks:
Command | Description
------------ | -------------
eslint | Validate files with ESLint *                        
mochaTest | Run node unit tests with Mocha *                    
clean | Clean files and folders. *                          
default | Alias for "eslint" task.                            
start-chains | Startup chain                                       
stop-chains | Stopping chain                                      
compile-project | Generate js-files                                   
compile-contracts | Generate contract type info                         
tsc | Compile ts files                                    
install | Install cross-chain-cli locally                     
install-global | Install cross-chain-cli globally                    
pack | npm pack cross-chain-cli                            
npm-pack | npm packaging command                               
full-pipeline-test | Testing precompiled *.ts project                    
full-pipeline-dist-test | Testing compiled *.js project inside dist folder    
full-pipeline-evaluation | Evaluating project                                  
evaluate | Run evaluation                                      
test | Run tests

### Install CLI
To compile and install the CLI run:
```bash
npx grunt install
```
## Chain
Generally, you don't need to start the chain individually since its already started if you execute the command:
``` bash
$ npm run test
```
See [readme](chain/README.md) on how to start the test chains.

## Linter
We use the code style from [airbnb](https://www.npmjs.com/package/eslint-config-airbnb-base).
To execute the linter just type:

```bash
$ npx grunt eslint
```

## Tests
To run all the tests run (requires a running ethereum node, see [hardhat.config.ts](./hardhat.config.ts) and [hardhat.org/config](https://hardhat.org/config/)):

```bash
$ npm run test
```

Or a single test (chains needs to be started manually):

```bash
$ npx hardhat test test/list-storage-test.ts
```

## Evaluation
To run the evaluation run:

```bash
$ npm run evaluate
```

Or a specific evaluation (chain needs to be started manually):

```bash
$ npx hardhat test evaluation/update-multiple-values-with-map-sizes-1-1000.ts
```
