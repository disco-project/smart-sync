//SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.8.0;

contract MappingContract {

    mapping(uint => uint) map;

    constructor() {
    }

    function insert(uint _key, uint _value) public {
        map[_key] = _value;
    }

    function getValue(uint _key) public view returns (uint256) {
        return map[_key];
    }
}
