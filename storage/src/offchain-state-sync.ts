import {Proof} from "merkle-patricia-tree/dist.browser/baseTrie";
import {ethers} from "ethers";
import * as rlp from "rlp";
import {BaseTrie as Trie} from "merkle-patricia-tree";


export class StateVerifier {
    /**
     * The provider used to access the source chain
     * @private
     */
    private srcProvider;
    /**
     * The provider used to access the target chain
     * @private
     */
    private targetProvider;

    /**
     *
     * @param srcProvider an `ethers` JsonRpcProvider used to connect to the source chain
     * @param targetProvider an `ethers` JsonRpcProvider used to connect to the target chain
     */
    constructor(srcProvider = new ethers.providers.JsonRpcProvider(), targetProvider = srcProvider) {
        this.srcProvider = srcProvider;
        this.targetProvider = targetProvider;
    }



}
