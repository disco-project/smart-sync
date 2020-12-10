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
    * @dev address of the deployed logic contract.
    * The address in the file is a placeholder
    */
    address internal constant LOGIC_ADDRESS = 0x0a911618A3dD806a5D14bf856cf355C4b9C84526;

    /**
    * @dev initialize the storage of this contract based on the provided proof.
    * @param proof The rlp encoded EIP1186 proof
    * @param blockHash The blockhash of the source chain the proof represents the state of
    */
    constructor(bytes memory proof, uint256 blockHash) public {
        updateStorage(proof, blockHash);
    }

    function updateStorage(bytes memory proof, uint256 blockHash) public {
        RelayContract relay = getRelay();
        bytes32 root = relay.getStateRoot(blockHash);
        bytes memory path = GetProofLib.encodedAddress(relay.getSource());
        GetProofLib.GetProof memory getProof = GetProofLib.parseProof(proof);

        require(GetProofLib.verifyProof(getProof.account, getProof.accountProof, path, root), "Failed to verify the");

        GetProofLib.Account memory account = GetProofLib.parseAccount(getProof.account);

//        bytes32 storageRoot = relay.getStorageRoot(blockHash);
//        require(account.storageHash == storageRoot, "Storage root mismatch");

        setStorage(getProof.storageProofs, account.storageHash);

        // update the state in the relay
        relay.setCurrentStateBlock(blockHash);
    }


    /**
    * @dev Used to access the Relay's abi
    */
    function getRelay() internal view returns (RelayContract) {
        return RelayContract(RELAY_ADDRESS);
    }

    /**
    * @dev Sets the contract's storage based on the encoded storage
    * @param rlpStorage the rlp encoded list of storageproofs
    * @param storageHash the hash of the contract's storage
    */
    function setStorage(bytes memory rlpStorage, bytes32 storageHash) internal {
        RLPReader.Iterator memory it =
        rlpStorage.toRlpItem().iterator();

        while (it.hasNext()) {
            // parse the rlp encoded storage proof
            GetProofLib.StorageProof memory proof = GetProofLib.parseStorageProof(it.next().toBytes());

            // get the path in the trie leading to the value
            bytes memory path = GetProofLib.triePath(abi.encodePacked(proof.key));

            // verify the storage proof
            require(MerklePatriciaProof.verify(
                    proof.value, path, proof.proof, storageHash
                ), "Invalid storage proof");

            // decode the value
            bytes32 value = bytes32(proof.value.toRlpItem().toUint());

            // store the value in the right slot
            bytes32 slot = proof.key;
            assembly {
                sstore(slot, value)
            }
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
        if (val == 0)
            revert();
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
        assembly {
        // Copy msg.data. We take full control of memory in this inline assembly
        // block because it will not return to Solidity code. We overwrite the
        // Solidity scratch pad at memory position 0.
            calldatacopy(0, 0, calldatasize())

        // Call the implementation.
        // out and outsize are 0 because we don't know the size yet.
            let result := delegatecall(gas(), LOGIC_ADDRESS, 0, calldatasize(), 0, 0)

        // Copy the returned data.
            returndatacopy(0, 0, returndatasize())

            switch result
            // delegatecall returns 0 on error.
            case 0 {revert(0, returndatasize())}
            default {return (0, returndatasize())}
        }
    }
}
