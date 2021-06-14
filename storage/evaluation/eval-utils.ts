import stringify from 'csv-stringify';
import { BigNumberish, ethers } from 'ethers';
import fs from 'fs';
import { StorageProof } from '../src/verify-proof';
import * as rlp from 'rlp';

export interface CSVDataTemplateBasicMTEdge {
    from: string;
    to: string;
}
export interface CSVDataTemplateSingleValueMultiple extends CSVDataTemplateSingleValue {
    iteration: number | undefined;
}
export interface CSVDataTemplateSingleValue extends CSVDataTemplatePerMTHeight {
    changed_value_index: number | undefined;
    extensionsCounter: number;
}

export interface CSVDataTemplateMultipleValues {
    map_size: number;
    changed_value_count: number;
    max_mpt_depth: number;
    used_gas: number;
    sequential: Boolean;
}

export interface CSVDataTemplatePerMTHeight {
    map_size: number;
    value_mpt_depth: number | undefined; 
    max_mpt_depth: number;
    used_gas: number;
}

export class CSVManager<T> {
    private dir: string = './evaluation/csv-files';
    private fileName: string;
    private data: Array<T>;

    constructor(fileName: string) {
        this.fileName = fileName;
        this.data = [];
    }

    pushData(data: T) {
        this.data.push(data);
    }

    async writeTofile() {
        // turn "Sun May 30 2021 18:19:20 +0200 (Central European Summer Time)" 
        // into "Sun_May_30_2021_18:19:20"
        let timeString = new Date().toString().replace(/ GMT[\w\W]+/g, '').replace(/\s/g, '_');
        
        return new Promise(resolve => {
            const writeStream = fs.createWriteStream(`${this.dir}/${timeString}_${this.fileName}`);
            const csvStringifier = stringify(this.data, { header: true });

            writeStream.on('finish', () => {
                resolve(resolve);
            })
            csvStringifier.pipe(writeStream);
        });
    }
}

export function getExtensionsAmountLeadingToValue(value: BigNumberish | undefined, storageProofs: StorageProof[] | undefined): number {
    if (value === undefined || storageProofs === undefined) {
        return 0;
    }

    // find proof with value
    const storageProof = storageProofs.find((storageProof: StorageProof) => {
        return ethers.BigNumber.from(storageProof.value).eq(ethers.BigNumber.from(value));
    });

    if (storageProof === undefined) {
        return 0;
    }

    // count extensions
    let extensionsCounter = 0;
    storageProof.proof.forEach((encodedString: string, index: number) => {
        const node = rlp.decode(encodedString);
        if ((node as Buffer[]).length === 2 && index !== storageProof.proof.length - 1) {
            extensionsCounter++;
        }
    });

    return extensionsCounter;
}