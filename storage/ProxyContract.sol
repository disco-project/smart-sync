//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

import "./contracts/RelayContract.sol";
import "./contracts/GetProofLib.sol";
import "solidity-rlp/contracts/RLPReader.sol";

contract ProxyContract {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for RLPReader.Iterator;
    using RLPReader for bytes;

    struct StorageEntry {
        // storage key
        bytes32 key;
        // storage value
        bytes32 value;
    }

    /**
    * @dev address of the deployed relay contract.
    * The address in the file is a placeholder
    */
    address internal constant RELAY_ADDRESS = 0xeBf794b5Cf0217CB806f48d2217D3ceE1e25A7C3;
    /**
    * @dev address of the deployed logic contract.
    * The address in the file is a placeholder
    */
    address internal constant LOGIC_ADDRESS = 0x0a911618A3dD806a5D14bf856cf355C4b9C84526;

    /**
    * @dev initialized the storage this contract based on the provided proof.
    * @param proof The rlpencoded EIP1186 proof
    * @param blockHash The blockhash of the source chain
    */
    constructor(bytes memory proof, uint256 blockHash) public {
        RelayContract relay = getRelay();
        bytes32 root = relay.getStateRoot(blockHash);
        bytes memory path = GetProofLib.encodedAddress(relay.getSource());
        GetProofLib.GetProof memory getProof = GetProofLib.parseProof(proof);

        require(GetProofLib.verifyProof(getProof.account, getProof.accountProof, path, root), "Failed to verify the");

        GetProofLib.Account memory account = GetProofLib.parseAccount(getProof.account);

        setStorage(getProof.storageProofs, account.storageHash);
    }

    /**
    * @dev verifies that all the proofs are valid and it's safe to update the state of the logic contract
    * @param storageProof rlp encoded `StorageProof`
    * @param encodedKeyPath The path in the storage merkle trie leading to the key's new value
    * @param blockHash the hash of the block from the source chain to sync
    * @param storageRoot The storage root of the source contract to be synchronized
    * @param encodedAccountPath The path in the account proof leading to the new storageRoot
    * @param rlpAccountNodes The rlp encoded stack of account nodes
    */
    function canUpdateState(bytes memory storageProof, bytes memory encodedKeyPath, uint256 blockHash, bytes memory storageRoot, bytes memory encodedAccountPath, bytes memory rlpAccountNodes) public view returns (bool) {

        return false;
    }


    /**
    * @dev Use to access the Relay's abi
    */
    function getRelay() internal view returns (RelayContract) {
        return RelayContract(RELAY_ADDRESS);
    }

    /**
    * @dev Sets the contract's storage based on the encoded storage
    */
    function setStorage(bytes memory rlpStorage, bytes32 storageHash) internal {
        RLPReader.Iterator memory it =
        rlpStorage.toRlpItem().iterator();
        uint idx;
        while (it.hasNext()) {
            // parse the rlp encoded storage proof
            GetProofLib.StorageProof memory proof = GetProofLib.parseStorageProof(it.next().toBytes());

            bytes memory path = GetProofLib.triePath(proof.key);

            // verify the storage proof
            require(MerklePatriciaProof.verify(
                    proof.value, path, proof.proof, storageHash
                ), "Invalid storage proof");

            // decode the value
            // abi.encodePacked(_data)
//            assembly {
//                sstore(slot, newImplementation)
//            }

            idx++;
        }
        // set the value to slot
    }
}
