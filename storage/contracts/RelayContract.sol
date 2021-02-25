//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

contract RelayContract {

    struct BlockInfo {
        // The root of state trie of the block.
        bytes32 stateRoot;
        // The number of this block
        uint256 blockNumber;
    }

    mapping(address => bytes32) proxyStorageRoots;
    BlockInfo currentBlock;

    /**
     * @dev Called by the proxy to update its state
     */
    function updateProxyStorage(bytes32 _newStorage) public {
        proxyStorageRoots[msg.sender] = _newStorage;
    }

    function updateBlock(bytes32 _stateRoot, uint256 _blockNumber) public {
        currentBlock.stateRoot = _stateRoot;
        currentBlock.blockNumber = _blockNumber;
    }

    /**
    * @dev return current state root
    */
    function getStateRoot() public view returns (bytes32) {
        return currentBlock.stateRoot;
    }

    /**
    * @dev return the calling contract's storage root (only correct if stored by the contract before only!)
    */
    function getStorageRoot() public view returns (bytes32) {
        return proxyStorageRoots[msg.sender];
    }

}
