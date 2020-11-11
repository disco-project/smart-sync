pragma solidity >=0.4.22 <0.8.0;

contract SimpleContract {
    uint256 value;

    // Event to facilitate data tracking
    event SetValue(address indexed from, uint256 value);

    function setValue(uint256 _value) public {
        value = _value;
        emit SetValue(msg.sender, _value);
    }

}
