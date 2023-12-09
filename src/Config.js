const networkNames = {
  1: 'mainnet',
  2: 'morden',
  3: 'ropsten',
  4: 'rinkeby',
  5: 'goerli',
  10: 'optimism',
  42: 'kovan',
  56: 'bsc',
  97: 'bsc-testnet',
  137: 'polygon',
  420: 'optimism-goerli',
  80001: 'polygon-mumbai',
  42161: 'arbitrum-one',
  42170: 'arbitrum-nova',
  421613: 'arbitrum-goerli',
  43113: 'avalanche-fuji',
  43114: 'avalanche',
  42220: 'celo',
  44787: 'celo-alfajores',
  11155111: 'sepolia'
};

const scanner = {
  1337: "localhost",
  1: "etherscan.io",
  5: "goerli.etherscan.io",
  56: "bscscan.com",
  97: "testnet.bscscan.com",
  41224: "snowtrace.io",
  43113: "testnet.snowtrace.io",
  44787: "alfajores-blockscout.celo-testnet.org",
};

module.exports = {
  networkNames,
  scanner,
}
