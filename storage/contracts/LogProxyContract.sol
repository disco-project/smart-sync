//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

/**
* @dev A contract to test delegating static calls
*/
contract LogProxyContract {

    address logic;

    uint256 value;

    constructor(address _logic) {
        logic = _logic;
        value = 37;
    }

    function _implementation() internal view returns (address) {
        return logic;
    }


    fallback() external {
        _fallback();
    }

    function _fallback() internal {
        _delegateLogic();
    }

    /**
    * @dev Delegates the call to the logic contract after putting the proxy in a static context,
    * preventing any state modifications that might occur in the logic's function
    */
    function _delegateLogic() internal {
        address addr = address(this);
        if (msg.sender == addr) {
            // solhint-disable-next-line no-inline-assembly
            address logicAddr = _implementation();
            assembly {
                calldatacopy(0, 0, calldatasize())
                let result := delegatecall(gas(), logicAddr, 0, calldatasize(), 0, 0)
                returndatacopy(0, 0, returndatasize())
                switch result
                case 0 {revert(0, returndatasize())}
                default {return (0, returndatasize())}
            }
        } else {
            (bool result,) = addr.staticcall(msg.data);
            assembly {
                let ptr := mload(0x40)
                returndatacopy(ptr, 0, returndatasize())
                switch result
                case 0 { revert(ptr, returndatasize()) }
                default { return(ptr, returndatasize()) }
            }
        }
    }
}
