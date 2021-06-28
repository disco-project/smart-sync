import {getAllKeys} from "./utils";
import {promises as fs, readFileSync} from 'fs';
import {
    LOGIC_CONTRACT_PLACEHOLDER_ADDRESS,
    SOURCE_CONTRACT_PLACEHOLDER_ADDRESS,
    PROXY_CONTRACT_FILE_NAME,
    PROXY_CONTRACT_NAME,
    RELAY_CONTRACT_PLACEHOLDER_ADDRESS
} from "./config";
import {ethers} from "ethers";
import * as solc from "solc";
import chalk from "chalk";
import { logger } from "./logger";

export class DeployProxy {

    /**
     * Reads the `ProxyContract` source code as string and updates the placeholder address constants
     * @param relayAddress the address of the relay contract that the proxy should use as constant
     * @param logicAddress the address of the relay contract that the proxy should use as constant
     * @return the proxy contract source code
     */
    static async readProxyContract(relayAddress: string, logicAddress: string, sourceAddress: string): Promise<string> {
        const source = await fs.readFile(__dirname + "/../" + PROXY_CONTRACT_FILE_NAME, "utf8");
        return source.replace(RELAY_CONTRACT_PLACEHOLDER_ADDRESS, ethers.utils.getAddress(relayAddress))
                        .replace(LOGIC_CONTRACT_PLACEHOLDER_ADDRESS, ethers.utils.getAddress(logicAddress))
                        .replace(SOURCE_CONTRACT_PLACEHOLDER_ADDRESS, ethers.utils.getAddress(sourceAddress));
    }

    /**
     * compiles the proxy and returns its abi and bytecode
     * @param relayAddress
     * @param logicAddress
     * @return The abi and bytecode of the proxy
     */
    static async compiledAbiAndBytecode(relayAddress, logicAddress, sourceAddress) {
        const compiled = JSON.parse(await this.compileProxy(relayAddress, logicAddress, sourceAddress));
        const contract = compiled.contracts[PROXY_CONTRACT_FILE_NAME][PROXY_CONTRACT_NAME]
        return {
            "abi": contract.abi,
            "bytecode": contract.evm.bytecode.object,
        };
    }

    /**
     * Compiles the proxy and writes the output to file
     * @param path where to write the solidity compiler output
     * @param relayAddress
     * @param logicAddress
     * @return the solidity compiler output
     */
    static async writeArtifacts(path, relayAddress, logicAddress, sourceAddress) {
        const artifacts = await DeployProxy.compileProxy(relayAddress, logicAddress, sourceAddress);
        await fs.writeFile(path, artifacts, "utf8");
        return artifacts;
    }

    /**
     * Compiles the updated `ProxyContract`
     * @param relayAddress the address of the relay contract that the proxy should use as constant
     * @param logicAddress the address of the relay contract that the proxy should use as constant
     * @return the solidity compiler output
     */
    static async compileProxy(relayAddress, logicAddress, sourceAddress) {
        const source = await DeployProxy.readProxyContract(relayAddress, logicAddress, sourceAddress);
        // https://docs.soliditylang.org/en/v0.5.0/using-the-compiler.html#compiler-input-and-output-json-description
        const input = {
            language: 'Solidity',
            sources: {
                "ProxyContract.sol": {
                    content: source
                }
            },
            settings: {
                outputSelection: {
                    '*': {
                        '*': ['*']
                    }
                }
            }
        };

        // resolve the used libraries
        function findImports(path) {
            let file = __dirname + "/../";
            if (path.startsWith("contracts")) {
                file += path;
            } else {
                file += "node_modules/" + path;
            }
            return {
                // FIXME: bump the compiler for RLPReader
                contents: readFileSync(file, "utf8").replace("solidity ^0.5.0", "solidity >=0.5.0 <0.8.0")
                .replace("solidity >=0.5.0 <0.6.0", "solidity >=0.5.0 <0.8.0")
            }
        }

        // compile the proxy
        const output = solc.compile(JSON.stringify(input), {import: findImports})

        logSolcErrors(output);

        return output;
    }


    /**
     * The provider used to access the source chain
     * @private
     */
    private readonly srcProvider;
    /**
     * The provider used to access the target chain
     * @private
     */
    private readonly targetProvider;
    /**
     * The address of the contract to port
     * @private
     */
    private readonly srcContractAddress;

    /**
     * The address of the logic contract deployed on the target chain
     * @private
     */
    private logicContractAddress;

    /**
     * The relay contract deployed on the target chain
     * @private
     */
    private relayContract;

    constructor(srcProvider, targetProvider, srcContractAddress) {
        this.srcProvider = srcProvider;
        this.targetProvider = targetProvider;
        this.srcContractAddress = srcContractAddress;
    }

    async deploy() {

    }

    private async deployRelay() {

    }

    // deploy initialization contract
    private async cloneLogic() {
        // get all the storage keys of the source contract
        const keys = await getAllKeys(this.srcContractAddress, this.srcProvider);

    }

    private async deployProxy() {

    }

}

function logSolcErrors(output) {
    for (let error of JSON.parse(output).errors) {
        if (error.severity === "error") {
            logger.error(chalk.red(`Failed to compile Proxy: type: ${error.type} formattedMessage: '${error.formattedMessage}' , message: '${error.message}' sourceLocation: ${JSON.stringify(error.sourceLocation)}`));
        }
    }
}