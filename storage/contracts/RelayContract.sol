//SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.8.0;

contract RelayContract {

    uint currentStateRoot;

    constructor() {
    }

    function setCurrentStateRoot(uint _currentStateRoot) public returns (uint) {
        (_currentStateRoot, currentStateRoot) = (currentStateRoot, _currentStateRoot);
        return _currentStateRoot;
    }

    function getCurrentStateRoot() public view returns (uint) {
        return currentStateRoot;
    }
}
