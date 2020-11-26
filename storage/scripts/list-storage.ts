import * as hre from "hardhat";

async function main() {
    const provider = new hre.ethers.providers.JsonRpcProvider();
    const accounts = await provider.listAccounts();

    const resp = await provider.send("parity_listStorageKeys", [
        "0x7CD7fA14c96d34286B0E47fdb1F15Fa4C4BD9bDA",5, null
    ]);
    console.log(resp);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });