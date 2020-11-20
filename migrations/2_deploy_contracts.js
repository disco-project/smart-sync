const SimpleContract = artifacts.require("SimpleContract");
const ProofContract = artifacts.require("ProofContract");
const RelayContract = artifacts.require("RelayContract");
const EventProof = artifacts.require("EventProof");

module.exports = function (deployer, network, accounts) {
    if (network === 'ropsten') {
        return
    }
    deployer.deploy(EventProof);
    deployer.deploy(SimpleContract);
    deployer.deploy(RelayContract).then(function () {
        deployer.link(RelayContract, [ProofContract]);
        return deployer.deploy(ProofContract, RelayContract.address);
    });
};
