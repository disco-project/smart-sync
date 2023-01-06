import { expect } from 'chai';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, ethers } from 'ethers';
import { JsonRpcProvider } from '@ethersproject/providers';
import {
    CallingContract,
    CallingContract__factory,
    TestLogicContract,
    TestLogicContract__factory,
    TestProxyContract,
    TestProxyContract__factory,
} from '../src-gen/types';
import { TxContractInteractionOptions } from '../src/cli/smart-sync';
import FileHandler from '../src/utils/fileHandler';
import { TestCLI } from './test-utils';
import { logger } from '../src/utils/logger';

describe('Test static proxy calls', () => {
    let deployer: SignerWithAddress;
    let logic: TestLogicContract;
    let proxy: TestProxyContract;
    let caller: CallingContract;
    let chainConfigs: TxContractInteractionOptions | undefined;
    let provider: JsonRpcProvider;

    const abi = [
        'function getValue() view returns (uint256)',
        'function setValue(uint256 value)',
        'function valuePure() public pure returns (uint256)',
    ];

    before(async () => {
        const fh = new FileHandler(TestCLI.defaultTestConfigFile);
        chainConfigs = fh.getJSON<TxContractInteractionOptions>();
        if (!chainConfigs) {
            logger.error(`No config available under ${TestCLI.defaultTestConfigFile}`);
            process.exit(-1);
        }
        provider = new ethers.providers.JsonRpcProvider({ url: chainConfigs.srcChainRpcUrl, timeout: BigNumber.from(chainConfigs.connectionTimeout).toNumber() });
        deployer = await SignerWithAddress.create(provider.getSigner());
    });

    it('Should deploy the contracts', async () => {
        const Logic = new TestLogicContract__factory(deployer);
        logic = await Logic.deploy();
        const Proxy = new TestProxyContract__factory(deployer);
        proxy = await Proxy.deploy(logic.address);
        const Caller = new CallingContract__factory(deployer);
        caller = await Caller.deploy(proxy.address);
    });

    it('Should not delegate set call through proxy contract', async () => {
        const contract = new ethers.Contract(proxy.address, abi, deployer);
        try {
            // try to set the value which should fail
            await contract.setValue(2);
        } catch (error) {
            // ignore error
        }
        // validate that the setValue did not succeed and the contract variable still has its old value
        expect((await contract.getValue()).eq(37)).to.be.true;
    });

    it('Should not delegate set call through calling contract', async () => {
        const contract = new ethers.Contract(caller.address, abi, deployer);
        try {
            await contract.setValue(2);
        } catch (error) {
            // ignore error
        }
        expect((await contract.getValue()).eq(37)).to.be.true;
    });

    it('Should allow delegation of pure functions through the proxy', async () => {
        const contract = new ethers.Contract(proxy.address, abi, deployer);
        expect((await contract.valuePure()).eq(42)).to.be.true;
    });
});
