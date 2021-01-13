//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

/**
 * @title RLPWriter
 * @dev helper functions to rlp-encode items
 */
library RLPWriter {

    /**
     * @dev RLP encodes a list of RLP encoded byte byte strings.
     * @param _list The list of RLP encoded byte strings.
     * @return The RLP encoded list of items in bytes.
     */
    function encodeList(bytes[] memory _list) internal pure returns (bytes memory) {
        bytes memory list = flatten(_list);
        return concat(encodeLength(list.length, 192), list);
    }

    /**
    * @dev Encode the first byte, followed by the `len` in binary form if `length` is more than 55.
    * @param len The length of the string or the payload.
    * @param offset 128 if item is string, 192 if item is list.
    * @return RLP encoded bytes.
    */
    function encodeLength(uint len, uint offset) private pure returns (bytes memory) {
        bytes memory encoded;
        if (len < 56) {
            encoded = new bytes(1);
            encoded[0] = bytes32(len + offset)[31];
        } else {
            uint lenLen;
            uint i = 1;
            while (len / i != 0) {
                lenLen++;
                i *= 256;
            }

            encoded = new bytes(lenLen + 1);
            encoded[0] = bytes32(lenLen + offset + 55)[31];
            for (i = 1; i <= lenLen; i++) {
                encoded[i] = bytes32((len / (256 ** (lenLen - i))) % 256)[31];
            }
        }
        return encoded;
    }

    /**
 * @dev Copies a piece of memory to another location.
 * @notice From: https://github.com/Arachnid/solidity-stringutils/blob/master/src/strings.sol.
 * @param _dest Destination location.
 * @param _src Source location.
 * @param _len Length of memory to copy.
 */
    function _copy(uint _dest, uint _src, uint _len) private pure {
        uint dest = _dest;
        uint src = _src;
        uint len = _len;

        for (; len >= 32; len -= 32) {
            assembly {
                mstore(dest, mload(src))
            }
            dest += 32;
            src += 32;
        }

        uint mask = 256 ** (32 - len) - 1;
        assembly {
            let srcpart := and(mload(src), not(mask))
            let destpart := and(mload(dest), mask)
            mstore(dest, or(destpart, srcpart))
        }
    }

    /**
    * @dev Flattens a list of byte strings into one byte string.
    * @notice From: https://github.com/sammayo/solidity-rlp-encoder/blob/master/RLPEncode.sol.
    * @param _list List of byte strings to flatten.
    * @return The flattened byte string.
    */
    function flatten(bytes[] memory _list) private pure returns (bytes memory) {
        if (_list.length == 0) {
            return new bytes(0);
        }

        uint len;
        uint i;
        for (i = 0; i < _list.length; i++) {
            len += _list[i].length;
        }

        bytes memory flattened = new bytes(len);
        uint flattenedPtr;
        assembly {flattenedPtr := add(flattened, 0x20)}

        for (i = 0; i < _list.length; i++) {
            bytes memory item = _list[i];

            uint listPtr;
            assembly {listPtr := add(item, 0x20)}

            _copy(flattenedPtr, listPtr, item.length);
            flattenedPtr += _list[i].length;
        }

        return flattened;
    }

    /**
   * @dev Concatenates two bytes.
   * @notice From: https://github.com/GNSPS/solidity-bytes-utils/blob/master/contracts/BytesLib.sol.
   * @param _preBytes First byte string.
   * @param _postBytes Second byte string.
   * @return Both byte string combined.
   */
    function concat(bytes memory _preBytes, bytes memory _postBytes) private pure returns (bytes memory) {
        bytes memory tempBytes;

        assembly {
            tempBytes := mload(0x40)

            let length := mload(_preBytes)
            mstore(tempBytes, length)

            let mc := add(tempBytes, 0x20)
            let end := add(mc, length)

            for {
                let cc := add(_preBytes, 0x20)
            } lt(mc, end) {
                mc := add(mc, 0x20)
                cc := add(cc, 0x20)
            } {
                mstore(mc, mload(cc))
            }

            length := mload(_postBytes)
            mstore(tempBytes, add(length, mload(tempBytes)))

            mc := end
            end := add(mc, length)

            for {
                let cc := add(_postBytes, 0x20)
            } lt(mc, end) {
                mc := add(mc, 0x20)
                cc := add(cc, 0x20)
            } {
                mstore(mc, mload(cc))
            }

            mstore(0x40, and(
            add(add(end, iszero(add(length, mload(_preBytes)))), 31),
            not(31)
            ))
        }
        return tempBytes;
    }
}
