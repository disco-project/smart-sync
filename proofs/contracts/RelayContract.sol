pragma solidity >=0.4.22 <0.8.0;

import "../node_modules/solidity-rlp/contracts/RLPReader.sol";

contract RelayContract {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for RLPReader.Iterator;
    using RLPReader for bytes;

    uint256 public highestBlock;
    address public owner;
    mapping(uint256 => BlockHeader) public blocks;

    struct BlockHeader {
        bytes32 prevBlockHash;
        bytes32 stateRoot;
        bytes32 txRoot;
        bytes32 receiptRoot;
    }

    event SubmitBlock(uint256 blockHash, address submitter);

    constructor() public {
    }

    function submitBlock(uint256 blockHash, bytes memory rlpHeader) public {
        BlockHeader memory header = parseBlockHeader(rlpHeader);
        uint256 blockNumber = getBlockNumber(rlpHeader);
        if (blockNumber > highestBlock) {
            highestBlock = blockNumber;
        }
        blocks[blockHash] = header;
        emit SubmitBlock(blockHash, msg.sender);
    }

    // Extracts a `BlockHeader` instance from the RLP encoded `rlpHeader`
    function parseBlockHeader(bytes memory rlpHeader) internal pure returns  (BlockHeader memory header) {
        RLPReader.Iterator memory it =
        rlpHeader.toRlpItem().iterator();

        uint idx;
        while (it.hasNext()) {
            if (idx == 0) {
                header.prevBlockHash = bytes32(it.next().toUint());
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

    function getBlockNumber(bytes memory rlpHeader) internal pure returns (uint blockNumber) {
        RLPReader.RLPItem[] memory rlpH = RLPReader.toList(RLPReader.toRlpItem(rlpHeader));
        // the block number is the 9th element inside the block header
        blockNumber = RLPReader.toUint(rlpH[8]);
    }


    function getBlock(uint256 blockHash) public view returns (
        bytes32 prevBlockHash,
        bytes32 stateRoot,
        bytes32 txRoot,
        bytes32 receiptRoot
    ) {
        BlockHeader memory header = blocks[blockHash];
        prevBlockHash = header.prevBlockHash;
        stateRoot = header.stateRoot;
        txRoot = header.txRoot;
        receiptRoot = header.receiptRoot;
    }
}
