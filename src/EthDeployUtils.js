const hre = require("hardhat");
const ethers = hre.ethers;
const path = require("path");
const fs = require("fs-extra");
const { Contract } = require("@ethersproject/contracts");
const abi = require("ethereumjs-abi");

const { networkNames, scanner, mainnets } = require("./Config");

class EthDeployUtils {
  constructor(rootDir, logger) {
    this.rootDir = rootDir;
    this.logger = logger;
    this.ensureExport();
  }

  debug(...params) {
    if (!!this.logger) {
      this.logger(...params);
    }
  }

  ensureExport(resetDeployed) {
    if (this.rootDir) {
      const exportDir = path.join(this.rootDir, "export");
      fs.ensureDirSync(exportDir);
      const deployedJsonPath = path.join(exportDir, "deployed.json");
      if (!fs.pathExistsSync(deployedJsonPath) || resetDeployed) {
        fs.writeFileSync(deployedJsonPath, "{}");
      }
      this.deployedJson = require(deployedJsonPath);
    }
  }

  getProviders() {
    const { INFURA_API_KEY } = process.env;

    const rpc = (url) => {
      return new ethers.providers.JsonRpcProvider(url);
    };

    let providers = {
      1337: ethers.getDefaultProvider("http://localhost:8545"),
    };

    if (INFURA_API_KEY) {
      providers = Object.assign(providers, {
        1: rpc(`https://mainnet.infura.io/v3/${INFURA_API_KEY}`),
        3: rpc(`https://ropsten.infura.io/v3/${INFURA_API_KEY}`),
        4: rpc(`https://rinkeby.infura.io/v3/${INFURA_API_KEY}`),
        5: rpc(`https://goerli.infura.io/v3/${INFURA_API_KEY}`),
      });
    }

    return providers;
  }

  async getABI(name, folder) {
    const fn = path.resolve(__dirname, `../../artifacts/contracts/${folder}/${name}.sol/${name}.json`);
    if (fs.pathExists(fn)) {
      return JSON.parse(await fs.readFile(fn, "utf8")).abi;
    }
  }

  async getContract(name, folder, address, chainId) {
    return new Contract(address, await this.getABI(name, folder), this.getProviders()[chainId]);
  }

  isMainnet(chainId) {
    // If true, for sure it is not a testnet
    // If false, it can be a main network not listed in Config
    return !!mainnets[chainId.toString()];
  }

  async Tx(promise, msg) {
    this.debug();
    if (msg) {
      this.debug(msg);
    }
    let tx = await promise;
    this.debug("Tx:", tx.hash);
    await tx.wait();
    this.debug("Mined.");
  }

  async deploy(contractName, ...args) {
    const chainId = await this.currentChainId();
    this.debug("Deploying", contractName, "to", hre.network.name);
    const contract = await ethers.getContractFactory(contractName);
    const deployed = await contract.deploy(...args);
    this.debug("Tx:", deployed.deployTransaction.hash);
    await deployed.deployed();
    this.debug("Deployed at", deployed.address);
    await this.saveDeployed(chainId, [contractName], [deployed.address]);
    if (!/1337$/.test(chainId.toString())) {
      this.debug(`To verify the source code:
    
  npx hardhat verify --show-stack-traces --network ${hre.network.name} ${deployed.address} ${[...args]
    .map((e) => e.toString())
    .join(" ")}
      
`);
    }
    return deployed;
  }

  getAddress(chainId, contractName) {
    if (this.rootDir) {
      if (!this.deployedJson[chainId]) {
        return;
      }
      let address = this.deployedJson[chainId][contractName];
      if (Array.isArray(address)) {
        address = address[address.length - 1];
      }
      return address;
    }
  }

  async attach(contractName, contractAddress) {
    const chainId = await this.currentChainId();
    const address = contractAddress || this.getAddress(chainId, contractName);
    if (!address) {
      throw new Error(`Address not found for ${contractName} on chain ${this.network(chainId)}`);
    }
    return await ethers.getContractAt(contractName, address);
  }

  async deployProxy(contractName, ...args) {
    let options;
    if (typeof args[args.length - 1] === "object") {
      if (args[args.length - 1].hasOwnProperty("gasLimit") || args[args.length - 1].hasOwnProperty("gasPrice")) {
        options = args.pop();
      }
    }
    const chainId = await this.currentChainId();
    this.debug("Deploying", contractName, "to", hre.network.name);
    const contract = await ethers.getContractFactory(contractName);
    const deployed = await upgrades.deployProxy(contract, [...args], options);
    this.debug("Tx:", deployed.deployTransaction.hash);
    await deployed.deployed();
    this.debug("Deployed at", deployed.address);
    await this.saveDeployed(chainId, [contractName], [deployed.address]);
    try {
      this.debug(await this.verifyCodeInstructions(contractName, deployed.deployTransaction.hash));
    } catch (e) {
      // it can fail due to openzeppelin upgrades version
    }
    return deployed;
  }

  async upgradeProxy(contractName, gasLimit) {
    const chainId = await this.currentChainId();
    this.debug("Upgrading", contractName, "to", hre.network.name);
    const Contract = await ethers.getContractFactory(contractName);
    const address = this.getAddress(chainId, contractName);
    const upgraded = await upgrades.upgradeProxy(address, Contract, gasLimit ? { gasLimit } : {});
    this.debug("Tx:", upgraded.deployTransaction.hash);
    await upgraded.deployed();
    this.debug("Upgraded");
    try {
      this.debug(await this.verifyCodeInstructions(contractName, upgraded.deployTransaction.hash));
    } catch (e) {
      // it can fail due to openzeppelin upgrades version
    }
    return upgraded;
  }

  async deployContractViaNickSFactory(deployer, contractName, constructorTypes, constructorArgs, salt, extraParams = {}) {
    if (!salt && !Array.isArray(constructorTypes)) {
      salt = constructorTypes;
      constructorTypes = undefined;
      constructorArgs = undefined;
    }
    if (!salt) {
      salt = ethers.constants.HashZero;
    }
    const json = await artifacts.readArtifact(contractName);
    let contractBytecode = json.bytecode;
    if (constructorTypes) {
      const encodedArgs = ethers.utils.defaultAbiCoder.encode(constructorTypes, constructorArgs);
      contractBytecode = contractBytecode + encodedArgs.substring(2);
    }
    const address = ethers.utils.getCreate2Address(this.nickSFactoryAddress(), salt, ethers.utils.keccak256(contractBytecode));
    const code = await ethers.provider.getCode(address);
    if (code === "0x") {
      const data = salt + contractBytecode.substring(2);
      const tx = Object.assign({
        to: this.nickSFactoryAddress(),
        data,
      }, extraParams);

      const transaction = await deployer.sendTransaction(tx);
      await transaction.wait();
      this.debug(`Just deployed ${contractName} via Nick's Factory at`, address);
      const chainId = await this.currentChainId();
      const previouslyDeployedAt = await this.getAddress(chainId, contractName);
      if (previouslyDeployedAt !== address) {
        await this.saveDeployed(chainId, [contractName], [address]);
      } // else, it has been already saved. We avoid duplicates
    } else {
      this.debug(`Previously deployed ${contractName} via Nick's Factory at`, address);
    }
    return await ethers.getContractAt(contractName, address);
  }

  async deployBytecodeViaNickSFactory(deployer, contractName, contractBytecode, salt, extraParams = {}) {
    if (!salt) {
      salt = ethers.constants.HashZero;
    }
    const address = ethers.utils.getCreate2Address(this.nickSFactoryAddress(), salt, ethers.utils.keccak256(contractBytecode));
    const code = await ethers.provider.getCode(address);
    if (code === "0x") {
      const data = salt + contractBytecode.substring(2);
      const tx = Object.assign({
        to: this.nickSFactoryAddress(),
        data,
      }, extraParams);

      const transaction = await deployer.sendTransaction(tx);
      await transaction.wait();
      this.debug(`Just deployed ${contractName} via Nick's Factory at`, address);
      const chainId = await this.currentChainId();
      const previouslyDeployedAt = await this.getAddress(chainId, contractName);
      if (previouslyDeployedAt !== address) {
        await this.saveDeployed(chainId, [contractName], [address]);
      } // else, it has been already saved. We avoid duplicates
    } else {
      this.debug(`Previously deployed ${contractName} via Nick's Factory at`, address);
    }
    return await ethers.getContractAt(contractName, address);
  }

  nickSFactoryAddress() {
    return `0x4e59b44847b379578588920ca78fbf26c0b4956c`;
  }

  async getAddressOfContractDeployedViaNickSFactory(deployer, contractName, constructorTypes, constructorArgs, salt) {
    if (!salt && !Array.isArray(constructorTypes)) {
      salt = constructorTypes;
      constructorTypes = undefined;
      constructorArgs = undefined;
    }
    const json = await artifacts.readArtifact(contractName);
    let contractBytecode = json.bytecode;

    // examples:
    // const constructorArgs = [arg1, arg2, arg3];
    // const constructorTypes = ["type1", "type2", "type3"];

    if (constructorTypes) {
      // ABI-encode the constructor arguments
      const encodedArgs = ethers.utils.defaultAbiCoder.encode(constructorTypes, constructorArgs);
      contractBytecode = contractBytecode + encodedArgs.substring(2); // Remove '0x' from encoded args
    }

    return ethers.utils.getCreate2Address(this.nickSFactoryAddress(), salt, ethers.utils.keccak256(contractBytecode));
  }

  async isContractDeployedViaNickSFactory(deployer, contractName, constructorTypes, constructorArgs, salt) {
    if (!salt && !Array.isArray(constructorTypes)) {
      salt = constructorTypes;
      constructorTypes = undefined;
      constructorArgs = undefined;
    }
    const address = await this.getAddressOfContractDeployedViaNickSFactory(
      deployer,
      contractName,
      constructorTypes,
      constructorArgs,
      salt,
    );

    const code = await ethers.provider.getCode(address);
    return code !== "0x";
  }

  keccak256(str) {
    const bytes = ethers.utils.toUtf8Bytes(str);
    return ethers.utils.keccak256(bytes);
  }

  bytes4(bytes32value) {
    return ethers.utils.hexDataSlice(bytes32value, 0, 4);
  }

  network(chainId) {
    return networkNames[chainId] || "unknown-" + chainId;
  }

  async currentChainId() {
    return (await ethers.provider.getNetwork()).chainId;
  }

  async saveDeployed(chainId, names, addresses, extras) {
    if (this.rootDir) {
      if (names.length !== addresses.length) {
        throw new Error("Inconsistent arrays");
      }
      const deployedJsonPath = path.resolve(this.rootDir, "export/deployed.json");
      const deployed = JSON.parse(await fs.readFile(deployedJsonPath, "utf8"));
      if (!deployed[chainId]) {
        deployed[chainId] = {};
      }
      const data = {};
      for (let i = 0; i < names.length; i++) {
        if (!deployed[chainId][names[i]]) {
          deployed[chainId][names[i]] = addresses[i];
        } else if (!Array.isArray(deployed[chainId][names[i]])) {
          deployed[chainId][names[i]] = [deployed[chainId][names[i]], addresses[i]];
        } else {
          deployed[chainId][names[i]].push(addresses[i]);
        }
      }
      if (extras) {
        // data needed for verifications
        if (!deployed.extras) {
          deployed.extras = {};
        }
        if (!deployed.extras[chainId]) {
          deployed.extras[chainId] = {};
        }
        deployed.extras[chainId] = Object.assign(deployed.extras[chainId], extras);
      }
      await fs.writeFile(deployedJsonPath, JSON.stringify(deployed, null, 2));
    }
  }

  encodeArguments(parameterTypes, parameterValues) {
    return abi.rawEncode(parameterTypes, parameterValues).toString("hex");
  }

  async deployNickSFactory(deployer) {
    if ((await ethers.provider.getCode(this.nickSFactoryAddress())) === `0x`) {
      const addressOfDeployer = `0x3fab184622dc19b6109349b94811493bf2a45362`;
      let txResponse = await deployer.sendTransaction({
        to: addressOfDeployer,
        value: ethers.utils.parseUnits(`0.1`, `ether`),
        gasLimit: 100000,
      });
      await txResponse.wait();
      const serializedTx = `0xf8a58085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf31ba02222222222222222222222222222222222222222222222222222222222222222a02222222222222222222222222222222222222222222222222222222222222222`;
      txResponse = await ethers.provider.sendTransaction(serializedTx);
      this.debug("Deploying Nick's Factory");
      return txResponse.wait();
    } else {
      this.debug("Nick's factory already deployed on this network");
    }
  }
  async verifyCodeInstructions(contractName, tx) {
    if (this.rootDir) {
      const chainId = await this.currentChainId();
      let chainName = networkNames[chainId] || "unknown-" + chainId;
      const oz = JSON.parse(await fs.readFile(path.resolve(this.rootDir, ".openzeppelin", chainName + ".json")));
      let address;
      let keys = Object.keys(oz.impls);
      let i = keys.length - 1;
      LOOP: while (i >= 0) {
        let key = keys[i];
        let storage = oz.impls[key].layout.storage;
        for (let s of storage) {
          if (s.contract === contractName) {
            address = oz.impls[key].address;
            break LOOP;
          }
        }
        i--;
      }
      let response;
      if (!!scanner[chainId]) {
        response = `To verify ${contractName} source code, flatten the source code and find the address of the implementation looking at the data in the following transaction 
    
https://${scanner[chainId]}/tx/${tx}

as a single file, without constructor's parameters    

`;
      }
      return this.saveLog(contractName, response);
    }
  }

  async saveLog(contractName, response) {
    if (this.rootDir) {
      const chainId = await this.currentChainId();
      const logDir = path.resolve(this.rootDir, "log");
      await fs.ensureDir(logDir);
      const shortDate = new Date().toISOString().substring(5, 16);
      const fn = [contractName, chainId, shortDate].join("_") + ".log";
      if (this.rootDir) {
        await fs.writeFile(path.resolve(logDir, fn), response);
        return `${response}
    
Info saved in:
    
    log/${fn}
`;
      } else {
        return response;
      }
    }
  }
}

module.exports = EthDeployUtils;
