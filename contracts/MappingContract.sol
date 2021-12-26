//SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.8.0;

contract MappingContract {

    mapping(uint => uint) map;

    constructor() {
    }
    
    /**
    * @dev Set a list of storage keys
    */
    function setStorageKey(bytes32[] memory keys, bytes32[] memory values) public {
        for (uint i = 0; i < keys.length; i++) {
            // store the value in the right slot
            bytes32 slot = keys[i];
            bytes32 value = values[i];
            assembly {
                sstore(slot, value)
            }
        }
    }

    function insert(uint _key, uint _value) public {
        map[_key] = _value;
    }

    function insertMultiple(uint[] memory _keys, uint[] memory _values) public {
        for (uint i = 0; i < _keys.length; i++) {
            map[_keys[i]] = _values[i];
        }
    }

    function getValue(uint _key) public view returns (uint256) {
        return map[_key];
    }

    function deleteValue(uint _key) public returns (bool) {
        map[_key] = 0x0;
        return true;
    }
}
