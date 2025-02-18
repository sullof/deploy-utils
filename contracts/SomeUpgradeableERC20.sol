// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

// Author: Jerry Bassat <jerry@superpower.io>
// Superpower Labs / Syn City

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract SomeUpgradeableERC20 is ERC20Upgradeable, UUPSUpgradeable {
  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize() public initializer {
    __ERC20_init("Some ERC20 Upgradeable", "SOMEUP");
    __UUPSUpgradeable_init();
  }

  // solhint-disable-next-line no-empty-blocks
  function _authorizeUpgrade(address) internal override {}

  function mint(address to, uint256 amount) public {
    _mint(to, amount);
  }
}
