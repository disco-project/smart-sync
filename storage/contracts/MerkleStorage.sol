//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

import "./RLPWriter.sol";
import "solidity-rlp/contracts/RLPReader.sol";
import {D} from "solidity-patricia-tree/contracts/data.sol";

/**
 * @title MerkleStorage
 * @dev helper functions to adapt an EIP-1186 storage proof
 * @notice https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1186.md
 */
library MerkleStorage {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for RLPReader.Iterator;
    using RLPReader for bytes;

    /**
     * @dev replace the terminating node's value with the newValue and updates the encoded path of the proof nodes respectively
     * @param rlpStorageProof the rlp encoded array of rlp-serialized MerkleTree-Nodes, starting with the rootHash-Node
     * @param newValue the new value for the proof.
     * @return The adapted root hash of the merkle tree of the storage proof.
     */
    // TODO determine return value in case of an error
    function updatedRootHash(bytes memory rlpStorageProof, bytes32 newValue) internal pure returns (bytes32) {
        // the list of rlp encoded nodes
        RLPReader.RLPItem[] memory proofNodes = rlpStorageProof.toRlpItem().toList();

        // the hash that references the next node
        bytes32 parentHash;
        // the updated reference hash
        bytes32 newParentHash;

        // the last node that holds the value
        RLPReader.RLPItem[] memory terminating = RLPReader.toList(proofNodes[proofNodes.length - 1]);

        if (terminating.length == 17) {
            // terminating branch node
            terminating[16] = RLPWriter.encodeUint(uint256(newValue)).toRlpItem();
            bytes[] memory _list = new bytes[](17);
            for (uint j = 0; j < 16; j++) {
                _list[j] = terminating[j].toRlpBytes();
            }
            return keccak256(RLPWriter.encodeList(_list));
        } else if (terminating.length == 2) {
            // terminating leaf
            // determine the reference hash: keccak(rlp(node))
            parentHash = keccak256(proofNodes[proofNodes.length - 1].toRlpBytes());
            // update the value and compute the new hash
            // rlp(node) = rlp[rlp(key), rlp(value)]
            bytes[] memory _list = new bytes[](2);
            _list[0] = terminating[0].toRlpBytes();
            _list[1] = RLPWriter.encodeUint(uint256(newValue));
            // a potential parent node references this node via keccak256(rlp(_list))
            newParentHash = keccak256(RLPWriter.encodeList(_list));
        } else {
            // error
        }

        if (proofNodes.length == 1) {
            // no further nodes in the proof
            return newParentHash;
        }

        RLPReader.RLPItem[] memory currentNodeList;
        // follow the tree upwards
        for (uint i = proofNodes.length - 1; i > 0; i--) {
            currentNodeList = RLPReader.toList(proofNodes[i - 1]);
            bytes32 keccakParentHash = keccak256(abi.encodePacked(parentHash));
            if (currentNodeList.length == 17) {
                // branch node
                bytes[] memory _list = new bytes[](17);
                for (uint j = 0; j < 17; j++) {
                    // find the reference hash
                    bytes memory val = currentNodeList[j].toBytes();
                    if (keccak256(val) == keccakParentHash) {
                        // found the position that references the next node
                        // update the index with the adapted hash of the next node
                        _list[j] = RLPWriter.encodeUint(uint256(newParentHash));
                    } else {
                        _list[j] = currentNodeList[j].toRlpBytes();
                    }
                }
                newParentHash = keccak256(RLPWriter.encodeList(_list));
            } else if (currentNodeList.length == 2) {
                // extension node
                bytes memory val = currentNodeList[1].toBytes();
                // make sure this extension node references the next node
                if (keccak256(val) == keccakParentHash) {
                    // update the reference hash
                    bytes[] memory _list = new bytes[](2);
                    _list[0] = currentNodeList[0].toRlpBytes();
                    _list[1] = RLPWriter.encodeUint(uint256(newParentHash));
                    newParentHash = keccak256(RLPWriter.encodeList(_list));
                } else {
                    // error
                }
            } else {
                // error
            }
            // update the reference hash
            parentHash = keccak256(proofNodes[i - 1].toRlpBytes());
        }

        return newParentHash;
    }

    struct Node {
        // hash of the node's parent node, 0 for root hash
        bytes32 parent;
        // the prior hash of this node
        bytes32 oldHash;
        // updated branch node
        RLPReader.RLPItem[] items;
    }

    struct Tree {
        // Particia tree nodes (hash to decoded content)
        mapping(bytes32 => Node) nodes;
        // The root hash
        bytes32 root;
    }

    function rootHash(Tree storage tree) internal returns (bytes32) {
        Node memory rootBranch = tree.nodes[tree.root];
        return branchHash(tree, rootBranch);
    }

    /**
     * @dev compute the hash of branch node
     */
    function branchHash(Tree storage tree, Node memory branch) internal returns (bytes32){
        require(branch.items.length == 17, "Expected branch node");
        bytes[] memory _list = new bytes[](17);
        for (uint i = 0; i < 16; i++) {
            // get the reference hash
            bytes32 child = bytes32(branch.items[i].toUint());
            Node memory childBranch = tree.nodes[child];
            if (childBranch.items.length == 17) {
                _list[i] = RLPWriter.encodeUint(uint256(branchHash(tree, childBranch)));
            } else {
                _list[i] = branch.items[i].toRlpBytes();
            }
        }
        // value
        _list[16] = branch.items[16].toRlpBytes();
        return keccak256(RLPWriter.encodeList(_list));
    }

    /** process: 1. insert all the nodes is not present
     *           2. update all parent nodes, walk each proof upwards and update the value
     */
    function updateTree(Tree storage tree, bytes memory rlpStorageProof, bytes32 newValue) internal {
        // the list of rlp encoded nodes
        RLPReader.RLPItem[] memory proofNodes = rlpStorageProof.toRlpItem().toList();

        require(proofNodes.length > 0, "Empty proof");

        if (proofNodes.length > 1) {
            // insert parent nodes if not already in the tree
            bytes32 parent;
            for (uint i = 0; i < proofNodes.length - 2; i++) {
                bytes32 oldHash = keccak256(proofNodes[i].toRlpBytes());
                Node memory node = tree.nodes[oldHash];
                if (node.items.length == 0) {
                    // put the node list in the tree
                    node.items = RLPReader.toList(proofNodes[i]);
                    node.parent = parent;
                    node.oldHash = oldHash;
                }
                parent = oldHash;
            }
        }

        // the hash that references the next node
        bytes32 parentHash;
        // the updated reference hash
        bytes32 newParentHash;

        // the last node that holds the value
        RLPReader.RLPItem[] memory terminating = RLPReader.toList(proofNodes[proofNodes.length - 1]);

        if (terminating.length == 17) {
            // terminating branch node
            terminating[16] = RLPWriter.encodeUint(uint256(newValue)).toRlpItem();
            bytes[] memory _list = new bytes[](17);
            for (uint j = 0; j < 16; j++) {
                _list[j] = terminating[j].toRlpBytes();
            }
            bytes32 newHash = keccak256(RLPWriter.encodeList(_list));
            bytes32 oldHash = keccak256(proofNodes[proofNodes.length - 1].toRlpBytes());
            // TODO insert in tree
            return;
            //            return keccak256(RLPWriter.encodeList(_list));
        } else if (terminating.length == 2) {
            // terminating leaf
            // update the value and compute the new hash
            // rlp(node) = rlp[rlp(key), rlp(value)]
            bytes[] memory _list = new bytes[](2);
            _list[0] = terminating[0].toRlpBytes();
            _list[1] = RLPWriter.encodeUint(uint256(newValue));
            // a potential parent node references this node via keccak256(rlp(_list))
            newParentHash = keccak256(RLPWriter.encodeList(_list));

            // determine the reference hash: keccak(rlp(node))
            parentHash = keccak256(proofNodes[proofNodes.length - 1].toRlpBytes());
            // update the parent node in the tree

        } else {
            // error
        }

        if (proofNodes.length == 1) {
            // no further nodes in the proof
            return;
        }

        RLPReader.RLPItem[] memory currentNodeList;
        // follow the tree upwards
        for (uint i = proofNodes.length - 1; i > 0; i--) {
            currentNodeList = RLPReader.toList(proofNodes[i - 1]);
            bytes32 keccakParentHash = keccak256(abi.encodePacked(parentHash));
            if (currentNodeList.length == 17) {
                // branch node
                bytes[] memory _list = new bytes[](17);
                for (uint j = 0; j < 17; j++) {
                    // find the reference hash
                    bytes memory val = currentNodeList[j].toBytes();
                    if (keccak256(val) == keccakParentHash) {
                        // found the position that references the next node
                        // update the index with the adapted hash of the next node
                        _list[j] = RLPWriter.encodeUint(uint256(newParentHash));
                    } else {
                        _list[j] = currentNodeList[j].toRlpBytes();
                    }
                }
                newParentHash = keccak256(RLPWriter.encodeList(_list));
            } else if (currentNodeList.length == 2) {
                // extension node
                bytes memory val = currentNodeList[1].toBytes();
                // make sure this extension node references the next node
                if (keccak256(val) == keccakParentHash) {
                    // update the reference hash
                    bytes[] memory _list = new bytes[](2);
                    _list[0] = currentNodeList[0].toRlpBytes();
                    _list[1] = RLPWriter.encodeUint(uint256(newParentHash));
                    newParentHash = keccak256(RLPWriter.encodeList(_list));
                } else {
                    // error
                }
            } else {
                // error
            }
            // update the reference hash
            parentHash = keccak256(proofNodes[i - 1].toRlpBytes());
        }

    }


}
