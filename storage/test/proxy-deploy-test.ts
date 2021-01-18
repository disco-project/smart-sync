import {RelayContract__factory, SyncCandidate, SyncCandidate__factory,} from "../src-gen/types";
import {ethers} from "hardhat";
import {expect} from "chai";
import {encodeStorageProof, GetProof} from "../src/verify-proof";
import * as utils from "../src/utils";
import {getAllKeys} from "../src/utils";
import {StorageDiffer} from "../src/get-diff";
import {DeployProxy} from "../src/deploy-proxy";
import {PROXY_INTERFACE} from "../src/config";
import {Contract} from "ethers";

describe("Deploy proxy and logic contract", async function () {
    let deployer;
    let srcContract: SyncCandidate;
    let logicContract: SyncCandidate;
    let provider;
    let factory: SyncCandidate__factory;
    let relayContract;
    let encodedProof;
    let latestBlock;
    let proxyContract: Contract;
    let storageRoot;

    it("Should deploy initial contract and set an initial value", async function () {
        [deployer] = await ethers.getSigners();
        factory = new SyncCandidate__factory(deployer);
        srcContract = await factory.deploy();
        // deploy the relay contract
        const Relayer = new RelayContract__factory(deployer);
        relayContract = await Relayer.deploy();
        provider = new ethers.providers.JsonRpcProvider();
        await srcContract.setValueA(42);
        await srcContract.setValueB(100);
        expect(await srcContract.getValueA()).to.be.equal(ethers.BigNumber.from(42));
    });

    it("Should copy the source contract", async function () {
        const keys = await getAllKeys(srcContract.address, provider);

        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

        // create a proof of the source contract's storage
        const proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]));
        encodedProof = await proof.encoded(latestBlock.stateRoot);

        storageRoot = proof.storageHash;

        await relayContract.relayAccount(srcContract.address, latestBlock.stateRoot, proof.storageHash, latestBlock.number);
    })

    it("Should compile and deploy the proxy", async function () {
        const compiledProxy = await DeployProxy.compiledAbiAndBytecode(relayContract.address, srcContract.address);

        // deploy the proxy with the state of the `srcContract`
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, deployer);

        proxyContract = await proxyFactory.deploy(encodedProof);

        // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
        const differ = new StorageDiffer(provider);
        const diff = await differ.getDiff(srcContract.address, proxyContract.address);

        expect(diff.isEmpty()).to.be.true;
    })

    it("It should validate old contract state", async function () {
        const abi = [
            "function verifyOldContractStateProofs(bytes memory rlpStorageKeyProofs) public view returns (bool)"
        ];
        // update a value
        await srcContract.setValueA(200);

        // get the changed keys
        const differ = new StorageDiffer(provider);
        const diff = await differ.getDiff(srcContract.address, proxyContract.address);
        const keys = diff.changes().map(c => c.key);

        latestBlock = await provider.send('eth_getBlockByNumber', ["latest", true]);

        // create a proof of the source contract's storage
        const proof = new GetProof(await provider.send("eth_getProof", [srcContract.address, keys]));

        const storageProofs = await Promise.all(proof.storageProof.map(
            (p) => {
                return encodeStorageProof(p, proof.storageHash);
            }));

        const rlpStorageProofs = utils.encode(storageProofs)

        let contract = new ethers.Contract(proxyContract.address, abi, deployer);

        const result = await contract.verifyOldContractStateProofs(rlpStorageProofs);
        expect(result).to.be.true;
    })

})