//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

import "./MerklePatriciaProof.sol";
import "./GetProofLib.sol";
import "solidity-rlp/contracts/RLPReader.sol";

contract RelayContract {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for RLPReader.Iterator;
    using RLPReader for bytes;

    struct Proxy {
        address logicAddress;
        bytes32 stateRoot;
    }

    modifier isProxyFor(address _logic)
    {
        // TODO is modifier even required when we insert storage root by msg.sender?
        //        require(
        //            msg.sender == _proxy,
        //            "Not authorized."
        //        );
        _;
    }

    // TODO store the whole account instead?
    // getBlock
    struct BlockInfo {
        // The root of state trie of the block.
        bytes32 stateRoot;
        // The storage Root of the account.
        bytes32 storageRoot;
        // The number of this block
        uint256 blockNumber;
        //         // The account's nonce.
        //        bytes32 nonce;
    }


    /**
     * @dev mapping of the proxie's storage roots
     */
    mapping(address => bytes32) proxyStates;

    /**
   * @dev mapping of the source addresses and their info
   */
    mapping(address => BlockInfo) sourceStates;

    // alternatively track by block?
    //    mapping(address => mapping(address => BlockInfo)) sourceStates;

    /**
     * @dev Called by the proxy to update its state
     */
    function updateProxyStorage(bytes32 _newStorage) public {
        proxyStates[msg.sender] = _newStorage;
    }

    /**
     * @dev The owner of this contract
     */
    address owner;

    //    /**
    //     * @dev The tracked blocks from the source chain, keyed by block hash
    //     */
    //    mapping(uint256 => BlockInfo) public blocks;

    constructor() public {
        owner = msg.sender;
    }

    // TODO this simply replaces the currently stored block info for this contract, if the block number is higher than the currently stored one
    // should this store by the block's hash instead?
    function relayAccount(address _contract, bytes32 _stateRoot, bytes32 _storageRoot, uint256 _blockNumber) public {
        BlockInfo storage info = sourceStates[_contract];
        if (_blockNumber > info.blockNumber) {
            info.stateRoot = _stateRoot;
            info.storageRoot = _storageRoot;
            info.blockNumber = _blockNumber;
        }
    }

    /**
    * @dev return the contracts relayed state root
    */
    function getStateRoot(address _contract) public view returns (bytes32) {
        return sourceStates[_contract].stateRoot;
    }

    /**
    * @dev return the contracts relayed storage root
    */
    function getStorageRoot(address _contract) public view returns (bytes32) {
        return sourceStates[_contract].storageRoot;
    }
}
