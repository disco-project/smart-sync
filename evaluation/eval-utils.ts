import stringify from 'csv-stringify';
import fs from 'fs';

export interface CSVDataTemplateSingleValue extends CSVDataTemplatePerMTHeight {
    changed_value_index: number | undefined;
}

export interface CSVDataTemplateMultipleValues {
    mapSize: number;
    changed_value_count: number;
    max_mpt_depth: number;
    used_gas: number;
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
}
