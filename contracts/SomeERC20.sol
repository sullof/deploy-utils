// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SomeERC20 is ERC20 {
  constructor() ERC20("Some ERC20", "SOME") {}

  function mint(address to, uint256 amount) public {
    _mint(to, amount);
  }
}
