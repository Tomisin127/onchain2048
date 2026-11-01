import { ethers } from 'ethers';

// Single shared Base mainnet read provider. Creating a provider on every poll
// leaks connections and races the RPC; one instance keeps balance reads fast
// and consistent.
let provider: ethers.JsonRpcProvider | null = null;

export function getBaseProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.JsonRpcProvider('https://mainnet.base.org', undefined, {
      staticNetwork: true,
      batchMaxCount: 10,
    });
  }
  return provider;
}
