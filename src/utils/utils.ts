import { BigNumberish, ethers } from 'ethers';
import { network } from 'hardhat';
import { HttpNetworkConfig } from 'hardhat/types';
import * as rlp from 'rlp';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Input } from 'rlp';
import { logger } from './logger';

const BLOCKNUMBER_TAGS = ['latest', 'earliest', 'pending'];

export namespace EVMOpcodes {
    export const contractByteCodeDeploymentPreamble = '608060405234801561001057600080fd5b50';
    export const PUSH1 = '60';
    export const DUP1 = '80';
    export const CODECOPY = '39';
    export const RETURN = 'F3';
    export const STOP = '00';
    export const SSTORE = '55';
}

/**
 * Converts a string to a Buffer
 * Leading `0x` is stripped
 * @param hexString
 */
export function hexStringToBuffer(hexString: string): Buffer {
    return ethers.utils.isHexString(hexString) ? Buffer.from(hexString.substring(2), 'hex') : Buffer.from(hexString, 'hex');
}

export function toParityQuantity(val: BigNumberish): string {
    if (typeof (val) === 'string' && BLOCKNUMBER_TAGS.indexOf(val) > -1) {
        return val;
    }
    return ethers.BigNumber.from(val).toHexString();
}

export async function toBlockNumber(val: BigNumberish, provider: JsonRpcProvider = new ethers.providers.JsonRpcProvider((network.config as HttpNetworkConfig).url)): Promise<number> {
    if (typeof (val) === 'string' && BLOCKNUMBER_TAGS.indexOf(val) > -1) {
        return (await provider.getBlock(val)).number;
    }
    try {
        return ethers.BigNumber.from(val).toNumber();
    } catch (e) {
        logger.error(`Given val (${val}) is not a valid block identifier.`);
        logger.error(e);
        throw new Error();
    }
}

export function encode(input: Input): Buffer {
    return (input === '0x0')
        ? rlp.encode(Buffer.alloc(0))
        : rlp.encode(input);
}

export function hexlify(input: string): string {
    const val = ethers.utils.hexlify(input);
    return (val === '0x') ? '0x0' : val;
}

// binary search for block where contract was deployed
export async function findDeploymentBlock(contract_address: string, provider: JsonRpcProvider = new ethers.providers.JsonRpcProvider((network.config as HttpNetworkConfig).url)): Promise<number> {
    let low: number = 0;
    let high: number = await provider.getBlockNumber();

    let mid: number;
    /* eslint-disable no-await-in-loop */
    while (low <= high) {
        mid = Math.trunc((low + high) / 2);

        const curr_code = await provider.getCode(contract_address, mid);
        // return mid if the smart contract was deployed on that block (previousBlock.getCode(smartContract) === none)
        if (curr_code.length > 3 && (mid === 0 || (await provider.getCode(contract_address, mid - 1)).length < 4)) return mid;

        if (curr_code.length > 3) high = mid - 1;

        else low = mid + 1;
    }
    /* eslint-enable no-await-in-loop */

    return -1;
}

/**
 *
 * @param address The address of the contract
 * @param provider The provider to use when sending an RPC request
 * @param blockNum the block number to retrieve the storage keys from
 * @param batchSize how many keys to retrieve per request [parity_liststoragekeys](https://openethereum.github.io/JSONRPC-parity-module#parity_liststoragekeys)
 * @returns all the storage keys of the contract with `address` at block `blockNum`
 */
export async function getAllKeys(contractAddress: string, provider = new ethers.providers.JsonRpcProvider((network.config as HttpNetworkConfig).url), blockNum: number | string = 'latest', batchSize: number = 50): Promise<BigNumberish[]> {
    const keys: Array<BigNumberish> = [];
    let batch: Array<BigNumberish> = [];
    let batchCounter = 1;
    const blockNumParity = toParityQuantity(blockNum);
    /* eslint-disable no-await-in-loop */
    do {
        const offset = (batchCounter > 1) ? keys[keys.length - 1] : null;

        batch = await provider.send('parity_listStorageKeys', [
            contractAddress, batchSize * batchCounter, offset, blockNumParity,
        ]);
        keys.push(...batch);
        batchCounter += 1;
    } while (batch.length >= batchSize);
    /* eslint-enable no-await-in-loop */
    return keys;
}

export function hex_to_ascii(str1) {
    const hex = str1.toString();
    let str = '';
    for (let n = 0; n < hex.length; n += 2) {
        str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));
    }
    return str;
}

export async function createDeployingByteCode(srcAddress: string, provider: JsonRpcProvider): Promise<string> {
    let code: string = await provider.getCode(srcAddress);
    code = code.substring(2); // remove 0x

    let deploy_code = EVMOpcodes.contractByteCodeDeploymentPreamble;
    const pushOpCodeInt = parseInt(EVMOpcodes.PUSH1, 16);

    // Create Contract code deployment code
    let code_length: string = (code.length / 2).toString(16); // in hex

    code_length = (code_length.length % 2) ? `0${code_length}` : code_length;
    const code_length_length: number = code_length.length / 2;

    deploy_code += (pushOpCodeInt + code_length_length - 1).toString(16);
    deploy_code += code_length;
    deploy_code += EVMOpcodes.DUP1;

    let deploy_code_length: string = ((deploy_code.length / 2) + 9).toString(16);
    deploy_code_length = (deploy_code_length.length % 2) ? `0${deploy_code_length}` : deploy_code_length;
    // Check length of code length and add length accordingly
    deploy_code_length = ((deploy_code_length.length / 2) - 1 + (parseInt(deploy_code_length, 16))).toString(16);
    deploy_code_length = (deploy_code_length.length % 2) ? `0${deploy_code_length}` : deploy_code_length;
    deploy_code += (pushOpCodeInt + deploy_code_length.length / 2 - 1).toString(16);
    deploy_code += deploy_code_length;
    deploy_code += EVMOpcodes.PUSH1;
    deploy_code += '00';
    deploy_code += EVMOpcodes.CODECOPY;
    deploy_code += EVMOpcodes.PUSH1;
    deploy_code += '00';
    deploy_code += EVMOpcodes.RETURN;
    deploy_code += EVMOpcodes.STOP;

    deploy_code += code;

    return deploy_code;
}
