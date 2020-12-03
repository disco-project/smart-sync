//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

import "./MerklePatriciaProof.sol";

contract RelayContract {

    // TODO store the whole account instead?
    struct BlockInfo {
        // The root of state trie of the block.
        bytes32 stateRoot;
        // The storage Root of the account.
        bytes32 storageRoot;

        //         // The account's nonce.
        //        bytes32 nonce;
    }

    /**
     * @dev The hash of the block of the source chain that was last synchronized
     */
    uint256 currentBlockHash;

    /**
     * @dev The address of the original contract on the source chain
     */
    address origin;

    /**
     * @dev The owner of this contract
     */
    address owner;

    /**
     * @dev The tracked blocks from the source chain, keyed by blockhash
     */
    mapping(uint256 => BlockInfo) public blocks;

    constructor(uint256 _blockHash, address _origin, bytes32 _stateRoot, bytes32 _storageRoot) public {
        // TODO insert adjusted stateroot?
        BlockInfo storage info = blocks[_blockHash];
        info.stateRoot = _stateRoot;
        info.storageRoot = _storageRoot;
        currentBlockHash = _blockHash;
        origin = _origin;
        owner = msg.sender;
    }

    // TODO restrict access to proxy? proxy should deploy the relay after init?
    /**
    * @dev replaces the currently synced block
    * @return The block hash of the old state
    */
    function setCurrentStateBlock(uint256 _currentBlockHash) public returns (uint256) {
        (_currentBlockHash, currentBlockHash) = (currentBlockHash, _currentBlockHash);
        return _currentBlockHash;
    }

    /**
    * @return The state root of the currently synced block from the source chain
    */
    function getCurrentStateRoot() public view returns (bytes32) {
        return blocks[currentBlockHash].stateRoot;
    }

    /**
    * @return The storage root of the synced contract (`origin`) of the source chain at block with block hash `currentBlockHash`
    */
    function getCurrentStorageRoot() public view returns (bytes32) {
        return blocks[currentBlockHash].storageRoot;
    }

    /**
    * @dev verifies that The provided `storageRoot` is included in the merkle trie
    * @param rlpAccount The terminating value in the proof
    * @param blockHash the hash of the block of the source chain to proof against
    * @param encodedPath The path in the trie leading to the `origin`'s `storageRoot`
    * @param rlpParentNodes The rlp encoded stack of nodes.
    * @return true if the proof wis valid, false otherwise
    */
    // TODO adjust rlpAccount?
    function verifyAccountProof(bytes memory rlpAccount, uint256 blockHash, bytes memory encodedPath, bytes memory rlpParentNodes) public view returns (bool) {

        return MerklePatriciaProof.verify(
            rlpAccount,
            encodedPath,
            rlpParentNodes,
            blocks[blockHash].stateRoot
        );
    }
}
