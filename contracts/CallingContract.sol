//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

import './TestLogicContract.sol';

contract CallingContract {
    TestLogicContract proxyContract;

    constructor(address _proxyContract) {
        proxyContract = TestLogicContract(_proxyContract);
    }

    function setValue(uint256 value) public {
        proxyContract.setValue(value);
    }

    function getValue() public view returns (uint256) {
        return proxyContract.getValue();
    }
}