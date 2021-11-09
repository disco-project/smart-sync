export const PROXY_CONTRACT_FILE_PATH = './artifacts/contracts/ProxyContract.sol';

export const PROXY_CONTRACT_NAME = 'ProxyContract';

export const PROXY_CONTRACT_FILE_NAME = `${PROXY_CONTRACT_NAME}.json`;

/**
 * The placeholder address used in the `ProxyContract.sol` for the relay contract
 */
export const RELAY_CONTRACT_PLACEHOLDER_ADDRESS = '0xeBf794b5Cf0217CB806f48d2217D3ceE1e25A7C3';

/**
 * The placeholder address used in the `ProxyContract.sol` for the logic contract
 */
export const LOGIC_CONTRACT_PLACEHOLDER_ADDRESS = '0x55f2155f2fEdbf701262573Be477A6562E09AeE0';

/**
 * The placeholder address used in the `ProxyContract.sol` for the logic contract
 */
export const SOURCE_CONTRACT_PLACEHOLDER_ADDRESS = '0x0a911618A3dD806a5D14bf856cf355C4b9C84526';

export const PROXY_INTERFACE = [
    'constructor()',
    'function updateStorage(bytes memory proof, uint blockNumber) public',
    'function computeRoots(bytes memory rlpProofNode) view returns (bytes32, bytes32)',
    'function insert(uint _key, uint _value) public',
    'function getValue(uint _key) public view returns (uint256)',
    'function addStorage(bytes32[] memory keys, bytes32[] memory values) public',
    'function getSourceAddress() public view returns (address)',
    'function getRelayAddress() pure returns (address)',
    'function getLogicAddress() public view returns (address)',
];
