//SPDX-License-Identifier: Unlicense
pragma solidity ^0.7.0;

contract SimpleStorage {
    uint a;
    uint b = 42;
    address owner;
    mapping(address => uint) values;

    constructor() {
        owner = msg.sender;
    }

    function setA(uint _a) public {
        a = _a;
    }

    function getA() public view returns (uint) {
        return a;
    }

    function setB(uint _b) public {
        b = _b;
    }

    function getB() public view returns (uint) {
        return b;
    }

    function getValue(address _address) public view returns (uint) {
        return values[_address];
    }

    function setValue(uint _value) public {
        values[msg.sender] = _value;
    }
}
