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
    function updateProxyStorage(bytes32 _newStorage) public  {
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

    function relayAccount(address _contract, bytes memory info) public {
        // TODO
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
