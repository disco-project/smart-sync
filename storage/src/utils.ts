import {ethers} from "ethers";

export function toParityQuantity(val) {
    const tags = ["latest", "earliest", "pending"];
    if(tags.indexOf(val) > -1) {
        return val;
    }
    return ethers.BigNumber.from(val).toHexString();
}