//SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.8.0;

import './SyncCandidate.sol';

contract CallRelayContract {
    SyncCandidate proxyContract;

    constructor(address _proxyContract) {
        proxyContract = SyncCandidate(_proxyContract);
    }

    function insert(uint _key, uint _value) public {
        proxyContract.insert(_key, _value);
    }

    function getValue(uint _key) public view returns (uint256) {
        return proxyContract.getValue(_key);
    }
}