//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

import '../ProxyContract.sol';
import './GetProofLib.sol';

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

    /**
    * @dev Used to access the Proxy's abi
    */
    function getProxy(address proxyAddress) internal pure returns (ProxyContract) {
        return ProxyContract(proxyAddress);
    }

    /**
    * @dev checks if the migration of the source contract to the proxy contract was successful
    * @param sourceAccountProof contains source contract account information and the merkle patricia proof of the account
    * @param proxyAccountProof contains proxy contract account information and the merkle patricia proof of the account
    * @param proxyChainBlockHeader latest block header of the proxy contract's chain
    * @param proxyAddress address from proxy contract
    * @param blockNumber block number from the proxy chain block header, this is needed because the blockNumber in the header is a hex string
    */
    function verifyMigrateContract(bytes memory sourceAccountProof, bytes memory proxyAccountProof, bytes memory proxyChainBlockHeader, address proxyAddress, uint blockNumber) public payable {
        GetProofLib.BlockHeader memory blockHeader = GetProofLib.parseBlockHeader(proxyChainBlockHeader);

        // compare block header hashes
        bytes32 givenBlockHeaderHash = keccak256(proxyChainBlockHeader);
        bytes32 actualBlockHeaderHash = blockhash(blockNumber);
        require(givenBlockHeaderHash == actualBlockHeaderHash, 'Given proxy chain block header is faulty');

        // verify sourceAccountProof
        // validate that the proof was obtained for the source contract and the account's storage is part of the current state
        ProxyContract proxyContract = getProxy(proxyAddress);
        address sourceAddress = proxyContract.getSourceAddress();
        bytes memory path = GetProofLib.encodedAddress(sourceAddress);
        GetProofLib.GetProof memory getProof = GetProofLib.parseProof(sourceAccountProof);
        require(GetProofLib.verifyProof(getProof.account, getProof.accountProof, path, currentBlock.stateRoot), "Failed to verify the account proof");
        GetProofLib.Account memory sourceAccount = GetProofLib.parseAccount(getProof.account);

        // verify proxyAccountProof
        // validate that the proof was obtained for the source contract and the account's storage is part of the current state
        path = GetProofLib.encodedAddress(proxyAddress);
        getProof = GetProofLib.parseProof(proxyAccountProof);
        require(GetProofLib.verifyProof(getProof.account, getProof.accountProof, path, blockHeader.storageRoot), "Failed to verify the account proof");
        GetProofLib.Account memory proxyAccount = GetProofLib.parseAccount(getProof.account);

        // compare storageRootHashes
        require(sourceAccount.storageHash == proxyAccount.storageHash, 'storageHashes of the contracts dont match');

        // update proxy info -> complete migration
        proxyStorageInfos[proxyAddress].storageRoot = proxyAccount.storageHash;
        proxyStorageInfos[proxyAddress].migrationState = true;
    }
}
