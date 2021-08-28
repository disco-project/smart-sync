import { promises as fs, readFileSync } from 'fs';
import { ethers } from 'ethers';
import * as solc from 'solc';
import {
    LOGIC_CONTRACT_PLACEHOLDER_ADDRESS,
    SOURCE_CONTRACT_PLACEHOLDER_ADDRESS,
    PROXY_CONTRACT_FILE_NAME,
    PROXY_CONTRACT_NAME,
    RELAY_CONTRACT_PLACEHOLDER_ADDRESS,
} from '../config';
import { logger } from './logger';

class ProxyContractBuilder {
    /**
     * @dev Reads the `ProxyContract` source code as string and updates the placeholder address constants
     * @param relayAddress the address of the relay contract that the proxy should use as constant
     * @param logicAddress the address of the deployed logic of the source contract on the target chain
     * @param sourceAddress the address of the source contract on the source chain
     * @return the proxy contract source code
     */
    static async readProxyContract(relayAddress: string, logicAddress: string, sourceAddress: string): Promise<string> {
        const source = await fs.readFile(`${__dirname}/../../${PROXY_CONTRACT_FILE_NAME}`, 'utf8');
        if (!ethers.utils.isAddress(relayAddress) || !ethers.utils.isAddress(logicAddress) || !ethers.utils.isAddress(sourceAddress)) {
            logger.error('One or more of the given addresses are not valid addresses:', { relayAddress, logicAddress, sourceAddress });
            throw new Error();
        }
        return source.replace(RELAY_CONTRACT_PLACEHOLDER_ADDRESS, ethers.utils.getAddress(relayAddress))
            .replace(LOGIC_CONTRACT_PLACEHOLDER_ADDRESS, ethers.utils.getAddress(logicAddress))
            .replace(SOURCE_CONTRACT_PLACEHOLDER_ADDRESS, ethers.utils.getAddress(sourceAddress));
    }

    /**
     * @dev compiles the proxy and returns its abi and bytecode
     * @param relayAddress the address of the relay contract that the proxy should use as constant
     * @param logicAddress the address of the deployed logic of the source contract on the target chain
     * @param sourceAddress the address of the source contract on the source chain
     * @return The abi and bytecode of the proxy
     */
    static async compiledAbiAndBytecode(relayAddress: string, logicAddress: string, sourceAddress: string) {
        const stringifieCompiledProxy = await this.compileProxy(relayAddress, logicAddress, sourceAddress);
        const compiled = JSON.parse(stringifieCompiledProxy);
        const contract = compiled.contracts[PROXY_CONTRACT_FILE_NAME][PROXY_CONTRACT_NAME];
        return {
            abi: contract.abi,
            bytecode: contract.evm.bytecode.object,
        };
    }

    /**
     * Compiles the proxy and writes the output to file
     * @param path where to write the solidity compiler output
     * @param relayAddress the address of the relay contract that the proxy should use as constant
     * @param logicAddress the address of the deployed logic of the source contract on the target chain
     * @param sourceAddress the address of the source contract on the source chain
     * @return the solidity compiler output
     */
    static async writeArtifacts(path: string, relayAddress: string, logicAddress: string, sourceAddress: string): Promise<string> {
        const artifacts = await ProxyContractBuilder.compileProxy(relayAddress, logicAddress, sourceAddress);
        await fs.writeFile(path, artifacts, 'utf8');
        return artifacts;
    }

    /**
     * Compiles the updated `ProxyContract`
     * @param relayAddress the address of the relay contract that the proxy should use as constant
     * @param logicAddress the address of the deployed logic of the source contract on the target chain
     * @param sourceAddress the address of the source contract on the source chain
     * @return the solidity compiler output
     */
    static async compileProxy(relayAddress: string, logicAddress: string, sourceAddress: string): Promise<string> {
        const source = await ProxyContractBuilder.readProxyContract(relayAddress, logicAddress, sourceAddress);
        // https://docs.soliditylang.org/en/v0.5.0/using-the-compiler.html#compiler-input-and-output-json-description
        const input = {
            language: 'Solidity',
            sources: {
                'ProxyContract.sol': {
                    content: source,
                },
            },
            settings: {
                outputSelection: {
                    '*': {
                        '*': ['*'],
                    },
                },
            },
        };

        // resolve the used libraries
        function findImports(path) {
            let file = `${__dirname}/../../`;
            if (path.startsWith('contracts')) {
                file += path;
            } else {
                file += `node_modules/${path}`;
            }
            return {
                // FIXME: bump the compiler for RLPReader
                contents: readFileSync(file, 'utf8').replace('solidity ^0.5.0', 'solidity >=0.5.0 <0.8.0')
                    .replace('solidity >=0.5.0 <0.6.0', 'solidity >=0.5.0 <0.8.0'),
            };
        }

        // compile the proxy
        const stringifiedInput = JSON.stringify(input);
        const output = solc.compile(stringifiedInput, { import: findImports });

        ProxyContractBuilder.logSolcErrors(output);

        return output;
    }

    static logSolcErrors(output: string) {
        JSON.parse(output).errors.forEach((error) => {
            if (error.severity === 'error') {
                logger.error(error);
            }
        });
    }
}

export default ProxyContractBuilder;
