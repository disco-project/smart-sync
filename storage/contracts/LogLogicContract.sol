//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

/**
* @dev A contract to test log events
*/
contract LogLogicContract {

    uint256 value;

    function getValue() public view returns (uint256) {
        return value;
    }

    function setValue(uint256 _value) public  {
        value = _value;
    }

    function valuePure() public pure returns (uint256) {
        return 42;
    }

}
