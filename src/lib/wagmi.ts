import { createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { coinbaseWallet, metaMask, injected } from 'wagmi/connectors';

export const activeChain = base;

export const config = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({
      appName: 'Crypto2048',
      preference: 'all',
    }),
    metaMask({
      dappMetadata: {
        name: 'Crypto2048',
      },
    }),
    injected({ target: 'phantom' }),
    // Base Account connector for native Base App support and smart account functionality
    injected({
      target: 'baseWallet',
    }),
  ],
  transports: {
    [base.id]: http(),
  },
});
