import { stringify } from 'csv-stringify';
import { parse } from 'csv-parse/sync';
import { BigNumberish, ethers } from 'ethers';
import fs from 'fs';
import * as rlp from 'rlp';
import { StorageProof } from '../src/proofHandler/Types';

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
    mapSize: number;
    changed_value_count: number;
    max_mpt_depth: number;
    used_gas: number;
    sequential: Boolean;
}

export interface CSVDataTemplatePerMTHeight {
    mapSize: number;
    value_mpt_depth: number | undefined;
    max_mpt_depth: number;
    used_gas: number;
}

export class CSVManager<T> {
    private dir: string = './evaluation/csv-files';

    private fileName: string;

    private data: Array<T>;

    constructor(fileName: string, dir?: string) {
        this.fileName = fileName;
        this.dir = dir ?? this.dir;
        this.data = [];
    }

    pushData(data: T) {
        this.data.push(data);
    }

    async writeTofile() {
        // turn "Sun May 30 2021 18:19:20 +0200 (Central European Summer Time)"
        // into "Sun_May_30_2021_18:19:20"
        const timeString = new Date().toString().replace(/ GMT[\w\W]+/g, '').replace(/\s/g, '_');

        return new Promise((resolve) => {
            const writeStream = fs.createWriteStream(`${this.dir}/${timeString}_${this.fileName}`);
            const csvStringifier = stringify(this.data, { header: true });

            writeStream.on('finish', () => {
                resolve(resolve);
            });
            csvStringifier.pipe(writeStream);
        });
    }

    readFromFile() {
        const fileContent = fs.readFileSync(`${this.dir}/${this.fileName}`);
        const parsedContent = parse(fileContent, { columns: false, skipEmptyLines: true, fromLine: 2 });
        return parsedContent;
    }
}

export function getExtensionsAmountLeadingToValue(value: BigNumberish | undefined, storageProofs: StorageProof[] | undefined): number {
    if (value === undefined || storageProofs === undefined) {
        return 0;
    }

    // find proof with value
    const storageProof = storageProofs.find((proof: StorageProof) => ethers.BigNumber.from(proof.value).eq(ethers.BigNumber.from(value)));

    if (storageProof === undefined) {
        return 0;
    }

    // count extensions
    let extensionsCounter = 0;
    storageProof.proof.forEach((encodedString: string, index: number) => {
        const node = rlp.decode(encodedString);
        if ((node as Buffer[]).length === 2 && index !== storageProof.proof.length - 1) {
            extensionsCounter += 1;
        }
    });

    return extensionsCounter;
}
