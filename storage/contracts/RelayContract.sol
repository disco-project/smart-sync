//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

import "./MerklePatriciaProof.sol";
import "./GetProofLib.sol";
import "solidity-rlp/contracts/RLPReader.sol";

contract RelayContract {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for RLPReader.Iterator;
    using RLPReader for bytes;

    // TODO store the whole account instead?
    // getBlock
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

    // TODO mapping addresse -> storageroot

    // require ender = key (mapping-> storagerot); sender?
    function updateStorage() {
    }

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
    function verifyAccountProof(bytes memory rlpAccount, uint256 blockHash, bytes memory encodedPath, bytes memory rlpParentNodes) public returns (bool) {

        return MerklePatriciaProof.verify(
            rlpAccount,
            encodedPath,
            rlpParentNodes,
            blocks[blockHash].stateRoot
        );
    }

    function verify(bytes memory value, bytes memory encodedPath, bytes memory rlpParentNodes, bytes32 root) public pure returns (bool) {
        return MerklePatriciaProof.verify(
            value,
            encodedPath,
            rlpParentNodes,
            root
        );
    }


    function parseAccount(bytes memory rlpAccount) public pure returns (bytes32 nonce, bytes32 balance, bytes32 storageHash, bytes32 codeHash) {
        RLPReader.Iterator memory it =
        rlpAccount.toRlpItem().iterator();

        uint idx;
        while (it.hasNext()) {
            if (idx == 0) {
                nonce = bytes32(it.next().toUint());
            } else if (idx == 1) {
                balance = bytes32(it.next().toUint());
            } else if (idx == 2) {
                storageHash = bytes32(it.next().toUint());
            } else if (idx == 3) {
                codeHash = bytes32(it.next().toUint());
            } else {
                it.next();
            }
            idx++;
        }
        return (nonce, balance, storageHash, codeHash);
    }


    function getStateRoot(uint256 _blockHash) public view returns (bytes32) {
        return blocks[_blockHash].stateRoot;
    }

    function getStorageRoot(uint256 _blockHash) public view returns (bytes32) {
        return blocks[_blockHash].storageRoot;
    }

    function getSource() public view returns (address) {
        return origin;
    }

    function parseProofTest(bytes memory rlpProof) public view returns (bytes memory account, bytes memory accountProof, bytes memory storageProof) {
        (account, accountProof, storageProof) = GetProofLib.parseProofTest(rlpProof);
    }

    function verifyEthGetProof(bytes memory rlpProof) public view returns (bool) {
        bytes32 root = getStateRoot(currentBlockHash);
        bytes memory path = GetProofLib.encodedAddress(getSource());
        GetProofLib.GetProof memory getProof = GetProofLib.parseProof(rlpProof);
        return GetProofLib.verifyProof(getProof.account, getProof.accountProof, path, root);
    }

    function verifyStorageProof(bytes memory rlpProof, bytes32 storageHash) public pure returns (bool) {
        return GetProofLib.verifyStorageProof(rlpProof, storageHash);
    }
}
