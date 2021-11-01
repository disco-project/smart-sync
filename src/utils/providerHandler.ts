import { ConnectionInfo } from '@ethersproject/web';
import { ethers } from 'ethers';
import { logger } from './logger';

export type SupportedProviders = string;

class ProviderHandler {
    private connectionInfo: ConnectionInfo;

    constructor(connectionInfo: ConnectionInfo) {
        this.connectionInfo = connectionInfo;
    }

    getProviderInstance(): ethers.providers.JsonRpcProvider {
        // check if http/https was given
        const regexHTTP = new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}((\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*))|(:\d+))/);
        const match = regexHTTP.exec(this.connectionInfo.url);
        if (match === null) {
            switch (this.connectionInfo.url as SupportedProviders) {
                default:
                    logger.error(`Provider ${this.connectionInfo.url} not supported.`);
                    throw new Error();
            }
        }
        return new ethers.providers.JsonRpcProvider(this.connectionInfo);
    }
}

export default ProviderHandler;
