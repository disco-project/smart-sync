import {
    LOGIC_CONTRACT_PLACEHOLDER_ADDRESS,
    SOURCE_CONTRACT_PLACEHOLDER_ADDRESS,
    PROXY_CONTRACT_FILE_NAME,
    RELAY_CONTRACT_PLACEHOLDER_ADDRESS,
    PROXY_CONTRACT_FILE_PATH,
} from '../config';
import FileHandler from './fileHandler';
import { logger } from './logger';

class ProxyContractBuilder {
    /**
     * @dev compiles the proxy and returns its abi and bytecode
     * @param relayAddress the address of the relay contract that the proxy should use as constant
     * @param logicAddress the address of the deployed logic of the source contract on the target chain
     * @param sourceAddress the address of the source contract on the source chain
     * @return The abi and bytecode of the proxy
     */
    static async compiledAbiAndBytecode(relayAddress: string, logicAddress: string, sourceAddress: string): Promise<{ abi: {}; bytecode: string; error?: Boolean | undefined; }> {
        const fh = new FileHandler(`${__dirname}/../../${PROXY_CONTRACT_FILE_PATH}/${PROXY_CONTRACT_FILE_NAME}`);
        const proxyContractJson: { abi: {}, bytecode: string, error: Boolean } | undefined = fh.getJSON();
        if (!proxyContractJson) return { abi: {}, bytecode: '', error: true };

        proxyContractJson.bytecode = proxyContractJson.bytecode.split(RELAY_CONTRACT_PLACEHOLDER_ADDRESS.substr(2).toLowerCase()).join(relayAddress.substr(2).toLowerCase());
        proxyContractJson.bytecode = proxyContractJson.bytecode.split(LOGIC_CONTRACT_PLACEHOLDER_ADDRESS.substr(2).toLowerCase()).join(logicAddress.substr(2).toLowerCase());
        proxyContractJson.bytecode = proxyContractJson.bytecode.split(SOURCE_CONTRACT_PLACEHOLDER_ADDRESS.substr(2).toLowerCase()).join(sourceAddress.substr(2).toLowerCase());
        proxyContractJson.error = false;
        logger.debug(proxyContractJson.bytecode);
        return proxyContractJson;
    }
}

export default ProxyContractBuilder;
