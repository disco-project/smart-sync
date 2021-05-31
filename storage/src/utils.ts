import {ethers} from "ethers";
import { network } from "hardhat";
import { HttpNetworkConfig } from "hardhat/types";
import * as rlp from "rlp";

export function toParityQuantity(val) {
    const tags = ["latest", "earliest", "pending"];
    if (tags.indexOf(val) > -1) {
        return val;
    }
    return ethers.BigNumber.from(val).toHexString();
}

export function encode(input) {
    return (input === '0x0')
        ? rlp.encode(Buffer.alloc(0))
        : rlp.encode(input)
}

export function hexlify(input) {
    const val = ethers.utils.hexlify(input);
    return (val === '0x') ? "0x0" : val;
}

/**
 *
 * @param address The address of the contract
 * @param provider The provider to use when sending an RPC request
 * @param blockNum the block number to retrieve the storage keys from
 * @param batchSize how many keys to retrieve per request [parity_liststoragekeys](https://openethereum.github.io/JSONRPC-parity-module#parity_liststoragekeys)
 * @returns all the storage keys of the contract with `address` at block `blockNum`
 */
export async function getAllKeys(address, provider = new ethers.providers.JsonRpcProvider((network.config as HttpNetworkConfig).url), blockNum = "latest", batchSize = 50): Promise<String[]> {
    let keys = [];
    let batch = [];
    let batchCounter = 1;

    do {
        let offset = (batchCounter > 1) ? keys[keys.length - 1] : null;

        batch = await provider.send("parity_listStorageKeys", [
            address, batchSize * batchCounter, offset, blockNum
        ]);
        keys.push(...batch);
        batchCounter += 1;
    } while (batch.length >= batchSize);
    return keys;
}