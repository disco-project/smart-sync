import { ConnectionInfo } from '@ethersproject/web';
import { ethers } from 'ethers';
import { logger } from './logger';

export type SupportedProviders = 'infura';

class ProviderHandler {
    private connectionInfo: ConnectionInfo;

    private apiKey?: string;

    constructor(connectionInfo: ConnectionInfo, apiKey?: string) {
        this.connectionInfo = connectionInfo;
        this.apiKey = apiKey;
    }

    getProviderInstance(): ethers.providers.JsonRpcProvider {
        const regexHTTP = new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}((\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*))|(:\d+))/);
        const match = regexHTTP.exec(this.connectionInfo.url);
        if (match === null) {
            switch (this.connectionInfo.url as SupportedProviders) {
                case 'infura':
                    if (!this.apiKey) logger.info('Note that no api key was provided.');
                    return new ethers.providers.InfuraProvider(this.connectionInfo.url, this.apiKey);
                default:
                    logger.error(`Provider ${this.connectionInfo.url} not supported.`);
                    throw new Error();
            }
        }
        return new ethers.providers.JsonRpcProvider(this.connectionInfo);
    }
}

export default ProviderHandler;
