async function createByteCode(srcAddress, provider) {
    const code = await provider.getCode(srcAddress);
    // TODO adjust preamble etc see verismart
}

/**
 *
 * @param srcAddress The address of the contract to prort
 * @param provider The provider to use
 * @param factory The factory used to create a new contract instance
 * @param block the number of the block from which the port should take place
 */
export async function portContract(srcAddress, provider, factory, block = "latest") {
    //  TODO

}