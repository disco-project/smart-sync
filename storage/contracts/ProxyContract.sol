//SPDX-License-Identifier: Unlicense
pragma solidity >=0.5.0 <0.8.0;

import "./RelayContract.sol";
import "solidity-rlp/contracts/RLPReader.sol";

contract ProxyContract {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for RLPReader.Iterator;
    using RLPReader for bytes;
    /**
    * Used to bundle the storage proof
    */
    struct StorageProof {
        // storage key
        bytes32 key;
        // storage value
        bytes32 value;
        // array of rlp-serialized MerkleTree-Nodes starting with the storageHash-Node
        bytes rlpNodes;
    }

    /**
    * @dev Storage slot with the address of the current implementation.
    * This is the keccak-256 hash of "eip1967.proxy.implementation" subtracted by 1, and is
    * validated in the constructor.
    *  See openzeppelin/BaseUpgradeabilityProxy
    *  See also https://github.com/ethereum/EIPs/pull/1967/files#diff-f4f32e6b29a5a9e47b15fc1488d15968a7feb1813d1f592f3370fd16b844cc7fR40
    */
    bytes32 internal constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    /**
    * @dev Storage slot with the address of the relay implementation.
    * This is the keccak-256 hash of "proxy.relay" subtracted by 1, and is
    * validated in the constructor.
    */
    bytes32 internal constant RELAY_SLOT = 0xd801042a27327e52f8dc4f76a1ac48b33d748950767ee881f0fa791c9d2c3af1;

    /**
   * @dev Contract constructor.
   * @param _logic Address of the initial implementation.
   * @param _relay Address of the relay contract.
   * @param _data Data to send as msg.data to the implementation to initialize the proxied contract.
   * It should include the signature and the parameters of the function to be called, as described in
   * https://solidity.readthedocs.io/en/v0.4.24/abi-spec.html#function-selector-and-argument-encoding.
   * This parameter is optional, if no data is given the initialization call to proxied contract will be skipped.
   */
    constructor(address _logic, address _relay, bytes memory _data) public payable {
        assert(IMPLEMENTATION_SLOT == bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1));
        _setImplementation(_logic);
        // TODO init logi
        if (_data.length > 0) {
            (bool success,) = _logic.delegatecall(_data);
            require(success);
        }
        _setRelay(_relay);
    }


    function updateState() public returns (bool) {


        return false;
    }

    /**
    * @dev verifies that all the proofs are valid and it's safe to update the state of the logic contract
    * @param storageProof rlp encoded `StorageProof`
    * @param encodedKeyPath The path in the storage merkle trie leading to the key's new value
    * @param blockHash the hash of the block from the source chain to sync
    * @param storageRoot The storage root of the source contract to be synchronized
    * @param encodedAccountPath The path in the account proof leading to the new storageRoot
    * @param rlpAccountNodes The rlp encoded stack of account nodes
    */
    function canUpdateState(bytes memory storageProof, bytes memory encodedKeyPath, uint256 blockHash, bytes memory storageRoot, bytes memory encodedAccountPath, bytes memory rlpAccountNodes) public returns (bool) {

        require(getRelay().verifyAccountProof(storageRoot, blockHash, encodedAccountPath, rlpAccountNodes), "Could not verify account proof");

        // check storage proof: validate that the `storageProof` is part of the storageRoot


        return false;
    }

    function parseStorageProof(bytes memory rlpProof) internal view returns (StorageProof memory storageProof) {
        RLPReader.Iterator memory it =
        rlpProof.toRlpItem().iterator();

        uint idx;
        while (it.hasNext()) {
            if (idx == 0) {
                storageProof.key = bytes32(it.next().toUint());
            } else if (idx == 1) {
                storageProof.value = bytes32(it.next().toUint());
            } else if (idx == 2) {
                storageProof.rlpNodes = it.next().toBytes();
            }  else {
                it.next();
            }
            idx++;
        }
        return storageProof;
    }

    /**
    * @dev Returns the current implementation.
    * @return impl the address of the current implementation
    */
    function _implementation() internal view returns (address impl) {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            impl := sload(slot)
        }
    }

    /**
   * @dev Sets the implementation address of the proxy.
   * @param newImplementation Address of the new implementation.
   */
    function _setImplementation(address newImplementation) internal {
        require(isContract(newImplementation), "Cannot set a proxy implementation to a non-contract address");

        bytes32 slot = IMPLEMENTATION_SLOT;

        assembly {
            sstore(slot, newImplementation)
        }
    }

    function getRelay() internal view returns (RelayContract) {
        address relay;
        bytes32 slot = RELAY_SLOT;
        assembly {
            relay := sload(slot)
        }
        return RelayContract(relay);
    }

    /**
   * @dev Sets the implementation address of the relay.
   * @param newRelay Address of the new relay.
   */
    function _setRelay(address newRelay) internal {
        require(isContract(newRelay), "Cannot set a relay implementation to a non-contract address");

        bytes32 slot = RELAY_SLOT;

        assembly {
            sstore(slot, newRelay)
        }
    }


    /**
    * @dev Delegates the current call to `implementation`.
    *
    * This function does not return to its internal call site, it will return directly to the external caller.
    */
    function _delegate(address implementation) internal {
        // solhint-disable-next-line no-inline-assembly
        assembly {
        // Copy msg.data. We take full control of memory in this inline assembly
        // block because it will not return to Solidity code. We overwrite the
        // Solidity scratch pad at memory position 0.
            calldatacopy(0, 0, calldatasize())

        // Call the implementation.
        // out and outsize are 0 because we don't know the size yet.
            let result := delegatecall(gas(), implementation, 0, calldatasize(), 0, 0)

        // Copy the returned data.
            returndatacopy(0, 0, returndatasize())

            switch result
            // delegatecall returns 0 on error.
            case 0 {revert(0, returndatasize())}
            default {return (0, returndatasize())}
        }
    }

    /**
     * TODO is is copied from openzeppelin/contracts/utils/Address.sol for now due to compiler conflicts
     * @dev Returns true if `account` is a contract.
     *
     * [IMPORTANT]
     * ====
     * It is unsafe to assume that an address for which this function returns
     * false is an externally-owned account (EOA) and not a contract.
     *
     * Among others, `isContract` will return false for the following
     * types of addresses:
     *
     *  - an externally-owned account
     *  - a contract in construction
     *  - an address where a contract will be created
     *  - an address where a contract lived, but was destroyed
     * ====
     */
    function isContract(address account) internal view returns (bool) {
        // This method relies on extcodesize, which returns 0 for contracts in
        // construction, since the code is only stored at the end of the
        // constructor execution.

        uint256 size;
        // solhint-disable-next-line no-inline-assembly
        assembly {size := extcodesize(account)}
        return size > 0;
    }
}
