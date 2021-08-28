import * as fs from 'fs';
import { logger } from './logger';

export class FileHandler {
    private filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
        try {
            if (!fs.statSync(this.filePath).isFile) {
                logger.error(`Given filePath ${this.filePath} does not lead to a file`);
            }
        } catch (e) {
            logger.error(e);
        }
    }

    getJSON<T>(): T | undefined {
        try {
            return JSON.parse(this.read() ?? '{}');
        } catch (e) {
            logger.error(e);
            return undefined;
        }
    }

    read(): string | undefined {
        try {
            return fs.readFileSync(this.filePath).toString('utf-8');
        } catch (e) {
            logger.error(e);
            return undefined;
        }
    }
}

export default FileHandler;
