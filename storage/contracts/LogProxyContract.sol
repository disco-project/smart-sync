//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

/**
* @dev A contract to test log events
*/
contract LogProxyContract {

    address logic;

    uint256 value;

    constructor(address _logic) public {
        logic = _logic;
        value = 37;
    }

    function _implementation() internal returns (address) {
        return logic;
    }


    fallback() external {
        _fallback();
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
            mstore(p,sig)
            success := call(900, addr, 0, p, 0x04, p, 0x00)
            mstore(0x20,add(p,0x04))
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
