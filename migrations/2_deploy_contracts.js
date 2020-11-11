const SimpleContract = artifacts.require("SimpleContract");
const Relay = artifacts.require("Relay");

module.exports = function (deployer) {
  deployer.deploy(SimpleContract);
  deployer.deploy(Relay, 100);
};
