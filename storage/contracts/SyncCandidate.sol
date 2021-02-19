//SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.8.0;

contract SyncCandidate {

    uint256 valueA;
    uint256 valueB;
    mapping(uint => uint) map;

    constructor() {
    }

    /**
    * @dev set a new value to `valueA`
    * @return The old value that was replaced
    */
    function setValueA(uint256 _valueA) public returns (uint256) {
        (_valueA, valueA) = (valueA, _valueA);
        return _valueA;
    }

    function getValueA() public view returns (uint256) {
        return valueA;
    }

    function setValueB(uint256 _valueB) public returns (uint256) {
        (_valueB, valueB) = (valueB, _valueB);
        return _valueB;
    }

    function getValueB() public view returns (uint256) {
        return valueB;
    }

    function insert(uint _key, uint _value) public {
        map[_key] = _value;
    }

    function getValue(uint _key) public view returns (uint256) {
        return map[_key];
    }
}
