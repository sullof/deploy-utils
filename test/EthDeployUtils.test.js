const { expect } = require("chai");
const DeployUtils = require("../src/EthDeployUtils");
const path = require("path");
const fs = require("fs-extra");

describe("Testing contract deployments", async function () {
  let erc20, upgradeableERC20;
  let deployer, bob, alice;
  let chainId;
  const tmpDir = path.resolve(__dirname, "../tmp");
  await fs.ensureDif(tmpDir);
  const deployUtils = new DeployUtils(tmpDir);
  const deployedJsonPath = path.resolve(__dirname, "../tmp/export/deployed.json");

  before(async function () {
    [deployer, bob, alice] = await ethers.getSigners();
    chainId = await deployUtils.currentChainId();
  });

  beforeEach(async function () {
    deployUtils.ensureExport(true);
    erc20 = await deployUtils.deploy("SomeERC20");
    upgradeableERC20 = await deployUtils.deploy("SomeUpgradeableERC20");
  });

  it("should deploy everything as expected", async function () {
    // test the beforeEach
  });

  it("should verify that the address has been saved in export/deployed.json", async function () {
    expect(await fs.pathExists(deployedJsonPath)).to.be.true;
    const deployedJson = JSON.parse(await fs.readFile(deployedJsonPath));
    expect(deployedJson[chainId].SomeERC20).to.equal(erc20.address);
    expect(deployedJson[chainId].SomeUpgradeableERC20).to.equal(upgradeableERC20.address);
  });

  // TODO add more tests
});
