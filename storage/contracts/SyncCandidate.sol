//SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.8.0;

contract SyncCandidate {

    uint256 valueA;

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
}