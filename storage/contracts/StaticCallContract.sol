//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

interface StaticContext {

    function execute() external view;

}

contract StaticCallContract is StaticContext {
    StaticContext proxyContract;
    bool initialized;
    address owner;

    constructor() {
        owner = msg.sender;
    }

    function setProxy(address _proxy) public {
        require(msg.sender == owner);

        if (!initialized) {
            proxyContract = StaticContext(_proxy);
            initialized = true;
        }
    }

    function execute() external override view {
        address proxyAddress = address(proxyContract);
        require(msg.sender == proxyAddress);
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := staticcall(gas(), proxyAddress, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 {revert(0, returndatasize())}
            default {return (0, returndatasize())}
        }
    }

    fallback() external {
         return proxyContract.execute();
//        address proxyAddress = address(proxyContract);
//        require(msg.sender == proxyAddress);
//        assembly {
//            calldatacopy(0, 0, calldatasize())
//            let result := staticcall(gas(), proxyAddress, 0, calldatasize(), 0, 0)
//            returndatacopy(0, 0, returndatasize())
//            switch result
//            case 0 {revert(0, returndatasize())}
//            default {return (0, returndatasize())}
//        }
    }
}