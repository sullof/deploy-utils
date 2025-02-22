const { expect } = require("chai");
const DeployUtils = require("../src/EthDeployUtils");
const path = require("path");
const fs = require("fs-extra");

describe("Testing contract deployments", function () {
  let erc20, upgradeableERC20;
  let deployer, bob, alice;
  let chainId;
  let deployUtils;
  let deployedJsonPath;

  before(async function () {
    const tmpDir = path.resolve(__dirname, "../tmp");
    await fs.ensureDir(tmpDir);
    deployUtils = new DeployUtils(tmpDir);
    deployedJsonPath = path.resolve(__dirname, "../tmp/export/deployed.json");

    [deployer, bob, alice] = await ethers.getSigners();
    chainId = await deployUtils.currentChainId();
  });

  beforeEach(async function () {
    deployUtils.ensureExport(true);
    erc20 = await deployUtils.deploy("SomeERC20");
    upgradeableERC20 = await deployUtils.deploy("SomeUpgradeableERC20");
  });

  it("should deploy everything as expected", async function () {
    expect(erc20).to.exist;
    expect(upgradeableERC20).to.exist;
  });

  it("should verify that the address has been saved in export/deployed.json", async function () {
    expect(await fs.pathExists(deployedJsonPath)).to.be.true;
    const deployedJson = JSON.parse(await fs.readFile(deployedJsonPath));

    const erc20Address = await erc20.getAddress();
    const upgradeableERC20Address = await upgradeableERC20.getAddress();
    expect(deployedJson[chainId].SomeERC20).to.equal(erc20Address);
    expect(deployedJson[chainId].SomeUpgradeableERC20).to.equal(upgradeableERC20Address);
  });

  // TODO add more tests
});
