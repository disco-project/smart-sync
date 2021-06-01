//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

contract RelayContract {

    struct BlockInfo {
        // The root of state trie of the block.
        bytes32 stateRoot;
        // The number of this block
        uint256 blockNumber;
    }

    struct ProxyContractInfo {
        // The root of storage trie of the contract.
        bytes32 storageRoot;
        // State of migration if successfull or not
        bool migrationState;
    }

    mapping(address => ProxyContractInfo) proxyStorageInfos;
    BlockInfo currentBlock;

    /**
     * @dev Called by the proxy to update its state, only after migrationState validation
     */
    function updateProxyInfo(bytes32 _newStorage) public {
        proxyStorageInfos[msg.sender].storageRoot = _newStorage;
        proxyStorageInfos[msg.sender].migrationState = true;
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
        return proxyStorageInfos[msg.sender].storageRoot;
    }

    function getMigrationState(address contractAddress) public view returns (bool) {
        return proxyStorageInfos[contractAddress].migrationState;
    }
}
