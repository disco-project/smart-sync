//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

import "./contracts/RelayContract.sol";
import "./contracts/GetProofLib.sol";
import "./contracts/RLPWriter.sol";
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
    * @dev address of the contract that is being mirrored.
    * The address in the file is a placeholder
    */
    address internal constant LOGIC_ADDRESS = 0x55f2155f2fEdbf701262573Be477A6562E09AeE0;

    constructor() public {
    }

    /**
    * @dev Adds values to the storage. Used for initialization.
    * @param keys -> Array of keys for storage
    * @param values -> Array of values corresponding to the array keys.
    */
    function addStorage(bytes32[] memory keys, bytes32[] memory values) public {
        require(keys.length == values.length, 'arrays keys and values do not have the same length');
        
        for (uint i = 0; i < keys.length; i++) {
            assembly {
                store(keys[i], values[i])
            }
        }
    }

    /**
    * @dev Used to access the Relay's abi
    */
    function getRelay() internal view returns (RelayContract) {
        return RelayContract(RELAY_ADDRESS);
    }

    function _beforeFallback() internal {
        address addr = address(this);
        bytes4 sig = bytes4(keccak256("emitEvent()"));
        
        bool success; 
        assembly {
            let p := mload(0x40)
            mstore(p,sig)
            success := call(950, addr, 0, p, 0x04, p, 0x00)
            mstore(0x20,add(p,0x04))
            //if eq(success, 1) { revert(0,0) }
        }
        require(!success, "only static calls are permitted");
    }

    function emitEvent() public {
        emit Illegal();
    }

    event Illegal();

    /*
     * The address of the implementation contract
     */
    function _implementation() internal returns (address) {
        return LOGIC_ADDRESS;
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
    * @dev If is old contract state proof: Recursively updates a single proof node and returns the adjusted hash after modifying all the proof node's values
    * @dev Else: Computes state root from adjusted Merkle Tree
    * @param rlpProofNode proof of form of:
    *        [list of common branches..last common branch,], values[0..16; LeafNode || proof node]
    */
    function computeRoot(bytes memory rlpProofNode, bool isOldContractStateProof) internal view returns (bytes32) {
        // the hash that references the next node
        bytes32 parentHash;
        // the updated reference hash
        bytes32 newParentHash;

        RLPReader.RLPItem[] memory proofNode = rlpProofNode.toRlpItem().toList();

        if (!RLPReader.isList(proofNode[1])) {
            // its only one leaf node
            if (isOldContractStateProof) {
                // tree consists of only one entry
                uint key = proofNode[0].toUint();
                bytes32 currValue;
                assembly {
                    currValue := sload(key)
                }

                // If the slot was empty before, remove branch to get the old contract state
                if(currValue != 0x0) {
                    // update the value and compute the new hash
                    // rlp(node) = rlp[rlp(encoded Path), rlp(value)]
                    bytes[] memory _list = new bytes[](2);
                    _list[0] = proofNode[1].toRlpBytes();
                    if (uint256(currValue) > 127) {
                        _list[1] = RLPWriter.encodeBytes(RLPWriter.encodeUint(uint256(currValue)));
                    } else {
                        _list[1] = RLPWriter.encodeUint(uint256(currValue));
                    }
                    
                    return keccak256(RLPWriter.encodeList(_list));
                } else {
                    return keccak256(RLPWriter.encodeUint(0));
                }
            } else {
                // just return hashed value if its the only one
                bytes[] memory _list = new bytes[](2);
                _list[0] = proofNode[1].toRlpBytes();
                _list[1] = proofNode[2].toRlpBytes();
                
                return keccak256(RLPWriter.encodeList(_list));
            }
        }

        // the last proof node consists of a list of common branch nodes
        RLPReader.RLPItem[] memory commonBranches = RLPReader.toList(proofNode[0]);
        // the last common branch for all underlying values
        RLPReader.RLPItem[] memory lastBranch = RLPReader.toList(commonBranches[commonBranches.length - 1]);
        // and a list of values [0..16] for the last branch node
        RLPReader.RLPItem[] memory latestCommonBranchValues = RLPReader.toList(proofNode[1]);
        // store the old reference hash
        parentHash = keccak256(commonBranches[commonBranches.length - 1].toRlpBytes());

        if(isOldContractStateProof) {
            if (latestCommonBranchValues.length == 1) {
                // its an extension
                bytes32 newReferenceHash = computeRoot(latestCommonBranchValues[0].toRlpBytes(), isOldContractStateProof);
                lastBranch[1] = RLPWriter.encodeUint(uint256(newReferenceHash)).toRlpItem();
            } else {
                // its a branch
                // loop through every value
                for (uint i = 0; i < 17; i++) {
                    // the value node either holds the [key, value]directly or another proofnode
                    RLPReader.RLPItem[] memory valueNode = RLPReader.toList(latestCommonBranchValues[i]);
                    if (valueNode.length == 3) {
                        // leaf value, where the is the value of the latest branch node at index i
                        uint key = valueNode[0].toUint();
                        bytes32 currValue;
                        assembly {
                            currValue := sload(key)
                        }

                        // if value changed, get the old value and insert into last branch
                        if(currValue != 0x0) {
                            // rlp(node) = rlp[rlp(encoded Path), rlp(value)]
                            bytes[] memory _list = new bytes[](2);
                            _list[0] = valueNode[1].toRlpBytes();
                            // value needs double encoding if too long for some reason
                            if (uint256(currValue) > 127) {
                                _list[1] = RLPWriter.encodeBytes(RLPWriter.encodeUint(uint256(currValue)));
                            } else {
                                _list[1] = RLPWriter.encodeUint(uint256(currValue));
                            }
                            // insert in the last common branch
                            bytes memory encodedList = RLPWriter.encodeList(_list);
                            if (encodedList.length > 32) {
                                lastBranch[i] = RLPReader.toRlpItem(RLPWriter.encodeUint(uint256(keccak256(encodedList))));
                            } else {
                                lastBranch[i] = encodedList.toRlpItem();
                            }
                        } else {
                            // If the slot was empty before, remove branch to get the old contract state
                            lastBranch[i] = RLPWriter.encodeUint(0).toRlpItem();
                        }
                    } else if (valueNode.length == 2) {
                        // branch or extension
                        // another proofNode [branches], values | proofnode, key
                        bytes32 newReferenceHash = computeRoot(latestCommonBranchValues[i].toRlpBytes(), isOldContractStateProof);
                        lastBranch[i] = RLPWriter.encodeUint(uint256(newReferenceHash)).toRlpItem();
                    }
                }
            }            
        }

        // hash the last branch to get the reference hash
        if (lastBranch.length == 2) {
            bytes[] memory _list = new bytes[](2);
            for (uint j = 0; j < 2; j++) {
                _list[j] = lastBranch[j].toRlpBytes();
            }
            newParentHash = keccak256(RLPWriter.encodeList(_list));
        } else {
            bytes[] memory _list = new bytes[](17);
            for (uint j = 0; j < 17; j++) {
                _list[j] = lastBranch[j].toRlpBytes();
            }
            newParentHash = keccak256(RLPWriter.encodeList(_list));
        }
        
        // adjust all the common parent branches
        bytes32 keccakParentHash = keccak256(abi.encodePacked(parentHash));
        // todo why is it i > 0 and not i>=0 and i = commonBranches.length -2? commonBranches.length-1 is not a common branch, but the rootNode...
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
        bytes32 oldRoot = computeRoot(rlpStorageProof, true);

        bytes32 computedStorageRoot = getRelay().getStorageRoot();

        return oldRoot == computedStorageRoot;
    }

    /**
    * @dev Several steps happen before a storage update takes place:
    * First verify that the provided proof was obtained for the account on the source chain (account proof)
    * Secondly verify that the current value is part of the current storage root (old contract state proof)
    * Third step is verifying the provided storage proofs provided in the `proof` (new contract state proof)
    * @param proof The rlp encoded optimized proof
    */
    function updateStorage(bytes memory proof) public {
        // First verify stateRoot -> account (account proof)

        RelayContract relay = getRelay();
        // get the current state root of the source chain
        bytes32 root = relay.getStateRoot();
        // validate that the proof was obtained for the source contract and the account's storage is part of the current state
        bytes memory path = GetProofLib.encodedAddress(SOURCE_ADDRESS);

        GetProofLib.GetProof memory getProof = GetProofLib.parseProof(proof);
        bool verified = GetProofLib.verifyProof(getProof.account, getProof.accountProof, path, root);
        require(verified, "Failed to verify the account proof");

        GetProofLib.Account memory account = GetProofLib.parseAccount(getProof.account);

        // Second verify proof would map to current state by replacing values with current values (old contract state proof)
        require(verifyOldContractStateProof(getProof.storageProofs), "Failed to verify old contract state proof");

        // Third verify proof is valid according to current block in relay contract
        require(computeRoot(getProof.storageProofs, false) == account.storageHash, "Failed to verify new contract state proof");


        // update the storage or revert on error
        setStorageValues(getProof.storageProofs);

        // update the state in the relay
        relay.updateProxyStorage(account.storageHash);
    }

    /**
    * @dev Recursively set contract's storage based on the provided proof nodes
    * @param rlpProofNode the rlp encoded storage proof nodes, starting with the root node
    */
    function setStorageValues(bytes memory rlpProofNode) internal {
        RLPReader.RLPItem[] memory proofNode = rlpProofNode.toRlpItem().toList();

        if (RLPReader.isList(proofNode[1])) {
            // its a branch
            // and a list of values [0..16] for the last branch node
            RLPReader.RLPItem[] memory latestCommonBranchValues = RLPReader.toList(proofNode[1]);
            // loop through every value
            for (uint i = 0; i < 17; i++) {
                // the value node either holds the [key, value]directly or another proofnode
                RLPReader.RLPItem[] memory valueNode = RLPReader.toList(latestCommonBranchValues[i]);
                if (valueNode.length == 3) {
                    // leaf value, where the is the value of the latest branch node at index i
                    uint byte0;
                    bytes32 value;
                    uint memPtr = valueNode[2].memPtr;
                    assembly {
                        byte0 := byte(0, mload(memPtr))
                    }

                    if (byte0 > 127) {
                        // leaf is double encoded when greater than 127
                        valueNode[2].memPtr += 1;
                        valueNode[2].len -= 1;
                        value = bytes32(valueNode[2].toUint());
                    } else {
                        value = bytes32(byte0);
                    }
                    if (value != 0x0) {
                        bytes32 slot = bytes32(valueNode[0].toUint());
                        assembly {
                            sstore(slot, value)
                        }
                    }
                } else if (valueNode.length == 2) {
                    setStorageValues(latestCommonBranchValues[i].toRlpBytes());
                }
            }
        } else {
            // its only one value
            // leaf value, where the is the value of the latest branch node at index i
            uint byte0;
            bytes32 value;
            uint memPtr = proofNode[2].memPtr;
            assembly {
                byte0 := byte(0, mload(memPtr))
            }

            if (byte0 > 127) {
                // leaf is double encoded when greater than 127
                proofNode[2].memPtr += 1;
                proofNode[2].len -= 1;
                value = bytes32(proofNode[2].toUint());
            } else {
                value = bytes32(byte0);
            }
            if (value != 0x0) {
                bytes32 slot = bytes32(proofNode[0].toUint());
                assembly {
                    sstore(slot, value)
                }
            }
        }
    }
}
