import { Logger, TLogLevelName } from 'tslog';

// Logger configuration
const LOG_LEVEL: TLogLevelName = process.env.CROSS_CHAIN_LOG_LEVEL ? process.env.CROSS_CHAIN_LOG_LEVEL as TLogLevelName : 'info';
const LOGGER_NAME = process.env.CROSS_CHAIN_LOGGER_NAME || 'cross chain main logger';

export const logger = new Logger({ name: LOGGER_NAME, minLevel: LOG_LEVEL });

export const setLogger = (name: string, minLevelString: string) => {
    const minLevel: TLogLevelName = minLevelString ? minLevelString as TLogLevelName : 'info';
    process.env.CROSS_CHAIN_LOG_LEVEL = minLevelString;
    process.env.CROSS_CHAIN_LOGGER_NAME = name;

    logger.setSettings({ minLevel, name });
};
