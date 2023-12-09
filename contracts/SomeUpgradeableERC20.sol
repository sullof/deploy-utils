// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

// Author: Jerry Bassat <jerry@superpower.io>
// Superpower Labs / Syn City

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract SomeUpgradeableERC20 is ERC20Upgradeable, UUPSUpgradeable {

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize() initializer public {
    __ERC20_init("Some ERC20 Upgradeable", "SOMEUP");
    __UUPSUpgradeable_init();
  }

  // solhint-disable-next-line no-empty-blocks
  function _authorizeUpgrade(address) internal override {}

  function mint(address to, uint256 amount) public {
    _mint(to, amount);
  }
}
