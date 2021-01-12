//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

import './StaticCallContract.sol';
/**
* @dev A contract to test log events
*/
contract LogProxyContract2 {

    address logic;

    uint256 value;

    StaticContext helper;

    constructor(address _logic, address _helper) public {
        logic = _logic;
        helper = StaticContext(_helper);
        value = 37;
    }

    function _implementation() internal returns (address) {
        return logic;
    }

    fallback() external {
        address addr = address(this);
        if (msg.sender == addr) {
            // solhint-disable-next-line no-inline-assembly
            address logic = _implementation();
            assembly {
                calldatacopy(0, 0, calldatasize())
                let result := delegatecall(gas(), logic, 0, calldatasize(), 0, 0)
                returndatacopy(0, 0, returndatasize())
                switch result
                case 0 {revert(0, returndatasize())}
                default {return (0, returndatasize())}
            }
        } else {
            (bool _retVal, bytes memory data) = addr.staticcall(msg.data);
            assembly {
                let mempointer := mload(0x40)
                returndatacopy(mempointer, 0, returndatasize())
                switch _retVal
                case 0 { revert(mempointer, returndatasize()) }
                default { return(mempointer, returndatasize()) }
            }
        }
    }

    function _fallback() internal {
        _delegateLogic();
    }

    function emitEvent() public {
        emit Illegal();
    }

    function _delegateLogic() internal {
        address addr = address(this);
        bytes4 sig = bytes4(keccak256("emitEvent()"));

        bool success;
        assembly {
            let p := mload(0x40)
            mstore(p, sig)
            success := call(900, addr, 0, p, 0x04, p, 0x00)
            mstore(0x20, add(p, 0x04))
        //if eq(success, 1) { revert(0,0) }
        }
        require(!success, "only static calls are permitted");

        // solhint-disable-next-line no-inline-assembly
        address logic = _implementation();
        assembly {
        // Copy msg.data. We take full control of memory in this inline assembly
        // block because it will not return to Solidity code. We overwrite the
        // Solidity scratch pad at memory position 0.
            calldatacopy(0, 0, calldatasize())

        // Call the implementation.
        // out and outsize are 0 because we don't know the size yet.
            let result := delegatecall(gas(), logic, 0, calldatasize(), 0, 0)

        // Copy the returned data.
            returndatacopy(0, 0, returndatasize())

            switch result
            // delegatecall returns 0 on error.
            case 0 {revert(0, returndatasize())}
            default {return (0, returndatasize())}
        }
    }

    event Illegal();
}
