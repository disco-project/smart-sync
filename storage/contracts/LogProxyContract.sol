//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

/**
* @dev A contract to test log events
*/
contract LogProxyContract {

    address logic;

    constructor(address _logic) public {
        logic = _logic;
    }

    function _implementation() internal returns (address) {
        return logic;
    }

    function _beforeFallback() internal {
        bytes32 t1 = bytes32(uint256(123));
        int32 val = - 1;
        assembly {
            let p := add(msize(), 0x20)
            mstore(p, t1)
            log0(p, 0x20)
            val := mload(msize())
        }
        if (val == 0) {
            revert();
        }

        // delegate the call
        (bool _retVal, bytes memory data) = _implementation().delegatecall(msg.data);

        assembly {
            let mempointer := mload(0x40)
            returndatacopy(mempointer, 0, returndatasize())
            switch _retVal
            case 0 { revert(mempointer, returndatasize()) }
            default { return(mempointer, returndatasize()) }
        }
    }

    function _fallback() internal {
        _beforeFallback();
        _delegateLogic();
    }

    fallback() external payable {
        _fallback();
    }

    function _delegateLogic() internal {
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
}
