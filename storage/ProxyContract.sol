//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

import "./contracts/RelayContract.sol";
import "./contracts/GetProofLib.sol";
import "solidity-rlp/contracts/RLPReader.sol";

contract ProxyContract {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for RLPReader.Iterator;
    using RLPReader for bytes;

    /**
    * @dev address of the deployed relay contract.
    * The address in the file is a placeholder
    */
    address internal constant RELAY_ADDRESS = 0xeBf794b5Cf0217CB806f48d2217D3ceE1e25A7C3;

    /**
    * @dev address of the contract that is being mirrored.
    * The address in the file is a placeholder
    */
    address internal constant SOURCE_ADDRESS = 0x0a911618A3dD806a5D14bf856cf355C4b9C84526;

    /**
    * @dev initialize the storage of this contract based on the provided proof.
    * @param proof rlp encoded EIP1186 proof
    */
    constructor(bytes memory proof) public {
        // initialize the contract's storage
        updateStorage(proof);
    }

    /**
    * @dev Several steps happen before a storage update takes place:
    * First verify that the provided proof was obtained for the account on the source chain (account proof)
    * Secondly verify that the current value is part of the current storage root (old contract state proof)
    * Third step is verifying the provided storage proofs provided in the `proof` (new contract state proof)
    * @param proof The rlp encoded EIP1186 proof
    */
    function updateStorage(bytes memory proof) public {
        RelayContract relay = getRelay();
        // get the current state root of the source chain as relayed in the relay contract
        bytes32 root = relay.getStateRoot(SOURCE_ADDRESS);
        // validate that the proof was obtained for the source contract and the account's storage is part of the current state
        bytes memory path = GetProofLib.encodedAddress(SOURCE_ADDRESS);
        GetProofLib.GetProof memory getProof = GetProofLib.parseProof(proof);
        require(GetProofLib.verifyProof(getProof.account, getProof.accountProof, path, root), "Failed to verify the account proof");

        GetProofLib.Account memory account = GetProofLib.parseAccount(getProof.account);

        // update the storage or revert on error
        updateStorageKeys(getProof.storageProofs, account.storageHash);

        // update the state in the relay
        relay.updateProxyStorage(account.storageHash);
    }


    /**
    * @dev Used to access the Relay's abi
    */
    function getRelay() internal view returns (RelayContract) {
        return RelayContract(RELAY_ADDRESS);
    }

    /**
    * @dev Validate that the key and it's value are part of the contract's storage
    */
    function oldContractStateProof(bytes32 key) internal view {

    }

    /**
      * @dev Update a single storage key's value after its proof was successfully validated against the relayed storage root
      * @param rlpStorageKeyProof contains the rlp encoded proof of the storage to set
      */
    function updateStorageKey(bytes memory rlpStorageKeyProof) public {
        bytes32 currentStorage = getRelay().getStorageRoot(SOURCE_ADDRESS);
        _updateStorageKey(rlpStorageKeyProof.toRlpItem(), currentStorage);
    }


    /**
  * @dev Sets the contract's storage based on the encoded storage
  * @param rlpStorageKeyProofs the rlp encoded list of storage proofs
  * @param storageHash the hash of the contract's storage
  */
    function updateStorageKeys(bytes memory rlpStorageKeyProofs, bytes32 storageHash) internal {
        RLPReader.Iterator memory it =
        rlpStorageKeyProofs.toRlpItem().iterator();

        while (it.hasNext()) {
            _updateStorageKey(it.next(), storageHash);
        }
    }

    /**
    * @dev Update a single storage key after validating against the storage key
    */
    function _updateStorageKey(RLPReader.RLPItem memory rlpStorageKeyProof, bytes32 storageHash) internal {
        // parse the rlp encoded storage proof
        GetProofLib.StorageProof memory proof = GetProofLib.parseStorageProof(rlpStorageKeyProof.toBytes());

        // get the path in the trie leading to the value
        bytes memory path = GetProofLib.triePath(abi.encodePacked(proof.key));

        // verify the storage proof
        require(MerklePatriciaProof.verify(
                proof.value, path, proof.proof, storageHash
            ), "Failed to verify the storage proof");

        // decode the rlp encoded value
        bytes32 value = bytes32(proof.value.toRlpItem().toUint());

        // store the value in the right slot
        bytes32 slot = proof.key;
        assembly {
            sstore(slot, value)
        }
    }

    function _beforeFallback() internal {
        bytes32 t1 = bytes32(uint256(123));
        int32 val = - 1;
        assembly {
            let p := add(msize(), 0x20)
            mstore(p, t1)
            log0(p, 0x20)
            val := mload(msize())
        }
        if (val == 0) {
            revert();
        }

        // delegate the call
        (bool _retVal, bytes memory data) = _implementation().delegatecall(msg.data);

        assembly {
            let mempointer := mload(0x40)
            returndatacopy(mempointer, 0, returndatasize())
            switch _retVal
            case 0 { revert(mempointer, returndatasize()) }
            default { return(mempointer, returndatasize()) }
        }
    }

    /*
     * The address of the implementation contract
     */
    function _implementation() internal returns (address) {
        return SOURCE_ADDRESS;
    }

    /**
     * @dev Delegates the current call to the address returned by `_implementation()`.
     *
     * This function does not return to its internall call site, it will return directly to the external caller.
     */
    function _fallback() internal {
        _beforeFallback();
        _delegateLogic();
    }

    /**
     * @dev Fallback function that delegates calls to the address returned by `_implementation()`. Will run if no other
     * function in the contract matches the call data.
     */
    fallback() external payable {
        _fallback();
    }

    /**
    * @dev Delegates the current call to `implementation`.
    *
    * This function does not return to its internal call site, it will return directly to the external caller.
    */
    function _delegateLogic() internal {
        // solhint-disable-next-line no-inline-assembly
        address logic = _implementation();
        assembly {
            // Copy msg.data. We take full control of memory in this inline assembly
            // block because it will not return to Solidity code. We overwrite the
            // Solidity scratch pad at memory position 0.
            calldatacopy(0, 0, calldatasize())

            // Call the implementation.
            // out and outsize are 0 because we don't know the size yet.
            let result := delegatecall(gas(), logic, 0, calldatasize(), 0, 0)

            // Copy the returned data.
            returndatacopy(0, 0, returndatasize())

            switch result
            // delegatecall returns 0 on error.
            case 0 {revert(0, returndatasize())}
            default {return (0, returndatasize())}
        }
    }
}
