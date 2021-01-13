//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

import "./RLPWriter.sol";
import "solidity-rlp/contracts/RLPReader.sol";

library MerkleStorage {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for RLPReader.Iterator;
    using RLPReader for bytes;

    // bytes memory encodedPath,
    // TODO validation could by included
    function validateUpdatedStorageProof(bytes memory rlpStorageProof, bytes32 newValue, bytes32 storageRoot) internal pure returns (bytes32) {
        // the list of rlp encoded nodes
        RLPReader.RLPItem[] memory proofNodes = rlpStorageProof.toRlpItem().toList();

        // the hash that references the next node
        bytes32 parentHash;
        // the updated reference hash
        bytes32 newParentHash;

        // the last node that holds the value
        RLPReader.RLPItem[] memory terminating = RLPReader.toList(proofNodes[proofNodes.length - 1]);

        if (terminating.length == 17) {
            terminating[16] = RLPWriter.encodeUint(uint256(newValue)).toRlpItem();
            // TODO update value -> hash node -> compare against storageRoot
        } else if (terminating.length == 2) {
            // terminating leaf
            // determine the reference hash: keccak(rlp(terminating))
            parentHash = keccak256(proofNodes[proofNodes.length - 1].toRlpBytes());
            // update the value and compute the new hash
            bytes[] memory _list = new bytes[](2);
            _list[0] = terminating[0].toRlpBytes();
            _list[1] = RLPWriter.encodeUint(uint256(newValue));
            newParentHash = keccak256(RLPWriter.encodeList(_list));

        } else {
            // error
        }

        if (proofNodes.length == 1) {
            // done -> return
        }

        RLPReader.RLPItem[] memory currentNodeList;

        // follow the tree upwards
        for (uint i = proofNodes.length - 2; i >= 0; i--) {

            currentNodeList = RLPReader.toList(proofNodes[i]);
            if (currentNodeList.length == 17) {
                // branch node
            } else if (currentNodeList.length == 2) {

            } else {
                // error
            }
        }


        return newParentHash;

//        bytes memory currentNode;
//
//        uint pathPtr = 0;
//
//        // a reference in a branch is of form keccak256(rlp([encodedkey, value]))
//


//       return false;
    }


    function _nibblesToTraverse(bytes memory encodedPartialPath, bytes memory path, uint pathPtr) private pure returns (uint) {
        uint len;
        // encodedPartialPath has elements that are each two hex characters (1 byte), but partialPath
        // and slicedPath have elements that are each one hex character (1 nibble)
        bytes memory partialPath = _getNibbleArray(encodedPartialPath);
        bytes memory slicedPath = new bytes(partialPath.length);

        // pathPtr counts nibbles in path
        // partialPath.length is a number of nibbles
        for (uint i = pathPtr; i < pathPtr + partialPath.length; i++) {
            byte pathNibble = path[i];
            slicedPath[i - pathPtr] = pathNibble;
        }

        if (keccak256(partialPath) == keccak256(slicedPath)) {
            len = partialPath.length;
        } else {
            len = 0;
        }
        return len;
    }


    // bytes b must be hp encoded
    function _getNibbleArray(bytes memory b) private pure returns (bytes memory) {
        bytes memory nibbles;
        if (b.length > 0) {
            uint8 offset;
            uint8 hpNibble = uint8(_getNthNibbleOfBytes(0, b));
            if (hpNibble == 1 || hpNibble == 3) {
                nibbles = new bytes(b.length * 2 - 1);
                byte oddNibble = _getNthNibbleOfBytes(1, b);
                nibbles[0] = oddNibble;
                offset = 1;
            } else {
                nibbles = new bytes(b.length * 2 - 2);
                offset = 0;
            }

            for (uint i = offset; i < nibbles.length; i++) {
                nibbles[i] = _getNthNibbleOfBytes(i - offset + 2, b);
            }
        }
        return nibbles;
    }

    /*
   *This function takes in the bytes string (hp encoded) and the value of N, to return Nth Nibble.
   *@param Value of N
   *@param Bytes String
   *@return ByteString[N]
   */
    function _getNthNibbleOfBytes(uint n, bytes memory str) private pure returns (byte) {
        return byte(n % 2 == 0 ? uint8(str[n / 2]) / 0x10 : uint8(str[n / 2]) % 0x10);
    }

}
