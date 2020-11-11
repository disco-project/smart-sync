pragma solidity >=0.4.22 <0.8.0;

import "../node_modules/solidity-rlp/contracts/RLPReader.sol";

contract Relay {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for RLPReader.Iterator;
    using RLPReader for bytes;

    uint256 public genesisBlock;
    uint256 public highestBlock;
    address public owner;

    mapping(uint256 => BlockHeader) public blocks;

    modifier onlyOwner() {
        if (owner == msg.sender) {
            _;
        }
    }

    struct BlockHeader {
        uint prevBlockHash;
        bytes32 stateRoot;
        bytes32 txRoot;
        bytes32 receiptRoot;
    }

    event SubmitBlock(uint256 blockHash, address submitter);

    constructor (uint256 blockNumber) public {
        genesisBlock = blockNumber;
        highestBlock = blockNumber;
        owner = msg.sender;
    }

    // TODO: blob (de)serialisation? RLP? https://ethresear.ch/t/blob-serialisation/1705
    function checkReceiptProof(bytes memory value, uint256 blockHash, bytes memory path, bytes memory parentNodes) public returns (bool) {
        bytes32 receiptRoot = blocks[blockHash].receiptRoot;
        // TODO validate that `value` is part of the the receipt trie of the specific block

        return false;
    }

    // public for testing
    function getBlockHeader(bytes memory rlpHeader) public returns (
        uint prevBlockHash,
        bytes32 stateRoot,
        bytes32 txRoot,
        bytes32 receiptRoot
    ) {
        BlockHeader memory header = parseBlockHeader(rlpHeader);
        prevBlockHash = header.prevBlockHash;
        stateRoot = header.stateRoot;
        txRoot = header.txRoot;
        receiptRoot = header.receiptRoot;
    }


    // Extracts a `BlockHeader` instance from the RLP encoded `rlpHeader`
    function parseBlockHeader(bytes memory rlpHeader) internal returns (BlockHeader memory header) {
        RLPReader.Iterator memory it =
        rlpHeader.toRlpItem().iterator();

        uint idx;
        while (it.hasNext()) {
            if (idx == 0) {
                header.prevBlockHash = it.next().toUint();
            } else if (idx == 3) {
                header.stateRoot = bytes32(it.next().toUint());
            } else if (idx == 4) {
                header.txRoot = bytes32(it.next().toUint());
            } else if (idx == 5) {
                header.receiptRoot = bytes32(it.next().toUint());
            } else {
                it.next();
            }
            idx++;
        }
        return header;
    }


    function getBlockNumber(bytes memory rlpHeader) internal returns (uint blockNumber) {
        RLPReader.RLPItem[] memory rlpH = RLPReader.toList(RLPReader.toRlpItem(rlpHeader));
        // number is 9th element
        blockNumber = RLPReader.toUint(rlpH[8]);
    }

}
