import { PrivyProvider, dataSuffix } from '@privy-io/react-auth';
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets';
import { Attribution } from 'ox/erc8021';
import { base } from 'viem/chains';
import { ReactNode } from 'react';

const PRIVY_APP_ID = "cmhl7guet01tfjl0cukko8t0y";
const BUILDER_CODE = 'bc_dh0rqw67';
const ERC_8021_ATTRIBUTION_SUFFIX = Attribution.toDataSuffix({
  codes: [BUILDER_CODE],
});

export function PrivyWrapper({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email'],
        appearance: {
          theme: 'dark',
          accentColor: '#3B82F6',
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'all-users',
          },
          showWalletUIs: false,
        },
        defaultChain: base,
        supportedChains: [base],
        plugins: [dataSuffix(ERC_8021_ATTRIBUTION_SUFFIX)],
      }}
    >
      <SmartWalletsProvider>{children}</SmartWalletsProvider>
    </PrivyProvider>
  );
}

