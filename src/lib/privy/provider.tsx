import { PrivyProvider, dataSuffix } from '@privy-io/react-auth';
import { base } from 'viem/chains';
import { ReactNode, useEffect } from 'react';
import { Attribution } from 'ox/erc8021';

const PRIVY_APP_ID = 'cmhl7guet01tfjl0cukko8t0y';

// Generate the ERC-8021 attribution suffix with your Builder Code
const ERC_8021_ATTRIBUTION_SUFFIX = Attribution.toDataSuffix({
  codes: ['bc_dh0rqw67'],
});

export function PrivyWrapper({ children }: { children: ReactNode }) {
  useEffect(() => {
    console.log('🔐 Privy Configuration:');
    console.log('- App ID:', PRIVY_APP_ID);
    console.log('- Current URL:', window.location.href);
    console.log('- Current Origin:', window.location.origin);
    console.log('- Protocol:', window.location.protocol);
  }, []);

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email'],
        appearance: {
          theme: 'light',
          accentColor: '#3B82F6',
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'all-users',
          },
          createOnLogin: 'all-users',
          requireUserPasswordOnTransaction: false,
          noPromptOnSignature: true,
          showWalletUIs: false,
        } as any,
        defaultChain: base,
        supportedChains: [base],
        plugins: [dataSuffix(ERC_8021_ATTRIBUTION_SUFFIX)],
      }}
    >
      {children}
    </PrivyProvider>
  );
}


