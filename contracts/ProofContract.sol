pragma solidity >=0.4.22 <0.8.0;

import "../node_modules/solidity-rlp/contracts/RLPReader.sol";
import "./RelayContract.sol";
import "./MerklePatriciaProof.sol";

/*
 * @title ProofContract
 * @dev Contract for verifying merkle patricia proofs.
 */
contract ProofContract {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for RLPReader.Iterator;
    using RLPReader for bytes;

    address public owner;
    RelayContract public Relay;

    modifier onlyOwner() {
        if (owner == msg.sender) {
            _;
        }
    }

    constructor (address relayAddress) public {
        owner = msg.sender;
        Relay = RelayContract(relayAddress);
    }

    function checkReceiptProof(bytes memory receipt, uint256 blockHash,
        bytes memory encodedPath, bytes memory rlpParentNodes) public view returns (bool) {
        // fetch the block header from the relay contract
        (,,, bytes32 receiptRoot) = Relay.getBlock(blockHash);
        // validate that the `receipt` is part of the the receipt trie of the specific block
        return MerklePatriciaProof.verify(
            receipt, encodedPath, rlpParentNodes, receiptRoot
        );
    }
}
