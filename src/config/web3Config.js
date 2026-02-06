require('dotenv').config();

const web3Config = {
  base: {
    rpcUrl: process.env.ALCHEMY_API_KEY
      ? `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
      : 'https://mainnet.base.org',
    privateKey: process.env.BASE_PRIVATE_KEY || process.env.ETHEREUM_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000',
    contractAddress: process.env.BASE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000',
  },
  ethereum: {
    rpcUrl: process.env.INFURA_PROJECT_ID 
      ? `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
      : 'https://mainnet.infura.io/v3/default',
    privateKey: process.env.ETHEREUM_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000',
    contractAddress: process.env.ETHEREUM_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000',
  },
  polygon: {
    rpcUrl: process.env.INFURA_PROJECT_ID 
      ? `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
      : 'https://polygon-mainnet.infura.io/v3/default',
    privateKey: process.env.POLYGON_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000',
    contractAddress: process.env.POLYGON_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000',
  },
  bsc: {
    rpcUrl: 'https://bsc-dataseed.binance.org/',
    privateKey: process.env.BSC_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000',
    contractAddress: process.env.BSC_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000',
  },
};

const activeNetwork = process.env.ACTIVE_NETWORK || 'base';

// Check if the active network configuration exists
if (!web3Config[activeNetwork]) {
  console.warn(`Network '${activeNetwork}' not found, using base as default`);
  module.exports = {
    ...web3Config.base,
    activeNetwork: 'base',
  };
} else {
  module.exports = {
    ...web3Config[activeNetwork],
    activeNetwork,
  };
}