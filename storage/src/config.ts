export const PROXY_CONTRACT_NAME = "ProxyContract";

export const PROXY_CONTRACT_FILE_NAME = PROXY_CONTRACT_NAME + ".sol";

/**
 * The placeholder address used in the `ProxyContract.sol` for the relay contract
 */
export const RELAY_CONTRACT_PLACEHOLDER_ADDRESS = "0xeBf794b5Cf0217CB806f48d2217D3ceE1e25A7C3";

/**
 * The placeholder address used in the `ProxyContract.sol` for the logic contract
 */
export const LOGIC_CONTRACT_PLACEHOLDER_ADDRESS = "0x0a911618A3dD806a5D14bf856cf355C4b9C84526";


export const PROXY_INTERFACE = [
    "constructor(bytes memory proof, uint256 blockHash)",
];