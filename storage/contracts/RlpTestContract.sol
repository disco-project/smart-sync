pragma solidity >=0.5.0 <0.8.0;
// included to easily verify `encodeList(bytes[] memory)`
pragma experimental ABIEncoderV2;

import "solidity-rlp/contracts/RLPReader.sol";
import "./RLPWriter.sol";

/**
 * @title RlpTestContract
 * @dev A contract to test solidity rlp encoding
 */
contract RlpTestContract {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for bytes;

    function encodeBytes(bytes memory _value) public pure returns (bytes memory) {
        return RLPWriter.encodeBytes(_value);
    }

    function decodeBytes(bytes memory _item) public pure returns (bytes memory) {
        return RLPReader.toRlpItem(_item).toBytes();
    }

    function encodeList(bytes[] memory self) public pure returns (bytes memory) {
        return RLPWriter.encodeList(self);
    }

}