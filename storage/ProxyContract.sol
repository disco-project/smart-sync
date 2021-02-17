//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

import "./contracts/RelayContract.sol";
import "./contracts/GetProofLib.sol";
import "./contracts/RLPWriter.sol";
import "./contracts/MerkleStorage.sol";
import "solidity-rlp/contracts/RLPReader.sol";
import {PatriciaTree} from "solidity-patricia-tree/contracts/tree.sol";


contract ProxyContract {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for RLPReader.Iterator;
    using RLPReader for bytes;
    using PatriciaTree for PatriciaTree.Tree;

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
        initialize(proof);
    }

    /**
    * @dev initialize the storage of this contract based on the provided proof.
    * @param proof rlp encoded EIP1186 proof
    */
    function initialize(bytes memory proof) internal {
        RelayContract relay = getRelay();
        bytes32 root = relay.getStateRoot(SOURCE_ADDRESS);
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
  * @dev Sets the contract's storage based on the encoded storage
  * @param rlpStorageKeyProofs the rlp encoded list of storage proofs
  * @param storageHash the hash of the contract's storage
  */
    function updateStorageKeys(bytes memory rlpStorageKeyProofs, bytes32 storageHash) internal {
        RLPReader.Iterator memory it =
        rlpStorageKeyProofs.toRlpItem().iterator();

        while (it.hasNext()) {
            setStorageKey(it.next(), storageHash);
        }
    }


    /**
    * @dev Update a single storage key after validating against the storage key
    */
    function setStorageKey(RLPReader.RLPItem memory rlpStorageKeyProof, bytes32 storageHash) internal {
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
            case 0 {revert(mempointer, returndatasize())}
            default {return (mempointer, returndatasize())}
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

    /**
    * @dev Recursively updates a single proof node and returns the adjusted hash after modifying all the proof node's values
    * @param rlpProofNode proof of form of:
    *        [list of common branches..last common branch,], values[0..16; LeafNode || proof node]
    */
    function updateProofNode(bytes memory rlpProofNode) internal view returns (bytes32) {
        // the hash that references the next node
        bytes32 parentHash;
        // the updated reference hash
        bytes32 newParentHash;

        RLPReader.RLPItem[] memory proofNode = rlpProofNode.toRlpItem().toList();

        // the last proof node consists of a list of common branch nodes
        RLPReader.RLPItem[] memory commonBranches = RLPReader.toList(proofNode[0]);
        // the last common branch for all underlying values
        RLPReader.RLPItem[] memory lastBranch = RLPReader.toList(commonBranches[commonBranches.length - 1]);
        // and a list of values [0..16] for the last branch node
        RLPReader.RLPItem[] memory latestCommonBranchValues = RLPReader.toList(proofNode[1]);
        // store the old reference hash
        parentHash = keccak256(commonBranches[commonBranches.length - 1].toRlpBytes());

        // loop through every value
        for (uint i = 0; i < 17; i++) {
            // the value node either holds the [key, value]directly or another proofnode
            RLPReader.RLPItem[] memory valueNode = RLPReader.toList(latestCommonBranchValues[i]);
            if (valueNode.length == 3) {
                // leaf value, where the is the value of the latest branch node at index i
                uint key = valueNode[0].toUint();
                bytes32 newValue;
                assembly {
                    newValue := sload(key)
                }
                // update the value and compute the new hash
                // rlp(node) = rlp[rlp(encoded Path), rlp(value)]
                bytes[] memory _list = new bytes[](2);
                _list[0] = valueNode[1].toRlpBytes();
                _list[1] = RLPWriter.encodeUint(uint256(newValue));
                // insert in the last common branch
                bytes32 hash = keccak256(RLPWriter.encodeList(_list));
                lastBranch[i] = RLPWriter.encodeUint(uint256(hash)).toRlpItem();
            } else if (valueNode.length == 2) {
                // another proofNode [branches], values | proofnode, key
                bytes32 newReferenceHash = updateProofNode(latestCommonBranchValues[i].toRlpBytes());
                lastBranch[i] = RLPWriter.encodeUint(uint256(newReferenceHash)).toRlpItem();
            }
        }

        // hash the last branch to get the reference hash
        bytes[] memory _list = new bytes[](17);
        for (uint j = 0; j < 17; j++) {
            _list[j] = lastBranch[j].toRlpBytes();
        }
        newParentHash = keccak256(RLPWriter.encodeList(_list));

        // adjust all the common parent branches
        bytes32 keccakParentHash = keccak256(abi.encodePacked(parentHash));
        for (uint i = commonBranches.length - 1; i > 0; i--) {
            RLPReader.RLPItem[] memory branchNode = RLPReader.toList(commonBranches[i]);

            bytes[] memory _list = new bytes[](17);
            for (uint j = 0; j < 17; j++) {
                // find the reference hash
                bytes memory val = branchNode[i].toBytes();
                if (keccak256(val) == keccakParentHash) {
                    // found the position that references the next node
                    // update the index with the adapted hash of the next node
                    _list[j] = RLPWriter.encodeUint(uint256(newParentHash));
                } else {
                    _list[j] = branchNode[j].toRlpBytes();
                }
            }
            newParentHash = keccak256(RLPWriter.encodeList(_list));
        }

        return newParentHash;
    }



    /**
    * @dev Validate the proof.
    *
    * @param rlpStorageProof proof of form a of an rlp encoded proof node:
    *        [list of common branches..last common branch], values[0..16] || proofNode
    */
    function verifyOldContractStateProof(bytes memory rlpStorageProof) public view returns (bool) {
        bytes32 oldRoot = updateProofNode(rlpStorageProof);

        bytes32 currentStorageRoot = getRelay().getStorageRoot(SOURCE_ADDRESS);

        return oldRoot == currentStorageRoot;
    }

    /**
    * @dev Several steps happen before a storage update takes place:
    * First verify that the provided proof was obtained for the account on the source chain (account proof)
    * Secondly verify that the current value is part of the current storage root (old contract state proof)
    * Third step is verifying the provided storage proofs provided in the `proof` (new contract state proof)
    * @param proof The rlp encoded optimized proof
    */
    function updateStorage(bytes memory proof) public {
        RelayContract relay = getRelay();
        // get the current state root of the source chain as relayed in the relay contract
        bytes32 root = relay.getStateRoot(SOURCE_ADDRESS);
        // validate that the proof was obtained for the source contract and the account's storage is part of the current state
        bytes memory path = GetProofLib.encodedAddress(SOURCE_ADDRESS);

        GetProofLib.GetProof memory getProof = GetProofLib.parseProof(proof);

        // verify storage keys against values currently stored
        require(verifyOldContractStateProof(getProof.storageProofs), "Failed to verify old contract state proof");

        // update the storage or revert on error
        setStorageValues(getProof.storageProofs);
    }

    /**
    * @dev Recursively set contract's storage based on the provided proof nodes
    * @param rlpProofNode the rlp encoded storage proof nodes, starting with the root node
    */
    function setStorageValues(bytes memory rlpProofNode) internal {
        RLPReader.RLPItem[] memory proofNode = rlpProofNode.toRlpItem().toList();
        // the last proof node consists of a list of common branch nodes
        RLPReader.RLPItem[] memory commonBranches = RLPReader.toList(proofNode[0]);
        // the last common branch for all underlying values
        RLPReader.RLPItem[] memory lastBranch = RLPReader.toList(commonBranches[commonBranches.length - 1]);
        // and a list of values [0..16] for the last branch node
        RLPReader.RLPItem[] memory latestCommonBranchValues = RLPReader.toList(proofNode[1]);

        // loop through every value
        for (uint i = 0; i < 17; i++) {
            // the value node either holds the [key, value]directly or another proofnode
            RLPReader.RLPItem[] memory valueNode = RLPReader.toList(latestCommonBranchValues[i]);
            if (valueNode.length == 3) {
                // leaf value, where the is the value of the latest branch node at index i
                bytes32 slot = bytes32(valueNode[0].toUint());
                bytes32 value = bytes32(valueNode[2].toUint());
                assembly {
                    sstore(slot, value)
                }
            } else if (valueNode.length == 2) {
                setStorageValues(latestCommonBranchValues[i].toRlpBytes());
            }
        }


    }
}
