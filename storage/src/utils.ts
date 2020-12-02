import {ethers} from "ethers";

export function toParityQuantity(val) {
    const tags = ["latest", "earliest", "pending"];
    if(tags.indexOf(val) > -1) {
        return val;
    }
    return ethers.BigNumber.from(val).toHexString();
}

/**
 *
 * @param address The address of the contract
 * @param provider The provider to use when sending an RPC request
 * @param blockNum the block number to retrieve the storage keys from
 * @param batchSize how many keys to retrieve per request [parity_liststoragekeys](https://openethereum.github.io/JSONRPC-parity-module#parity_liststoragekeys)
 * @returns all the storage keys of the contract with `address` at block `blockNum`
 */
export async function getAllKeys(address, provider = new ethers.providers.JsonRpcProvider(), blockNum = "latest", batchSize = 50) {
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