import { useState, useEffect, useCallback, useRef } from 'react';
import { base } from 'viem/chains';
import { sdk as farcasterSdk } from '@farcaster/miniapp-sdk';

const CREATOR_ADDRESS = '0xEA549e458e77Fd93bf330e5EAEf730c50d8F5249';

interface SubAccount {
  address: `0x${string}`;
  factory?: `0x${string}`;
  factoryData?: `0x${string}`;
}

interface GetSubAccountsResponse {
  subAccounts: SubAccount[];
}

export function useBaseSubAccount() {
  const [provider, setProvider] = useState<any>(null);
  const [universalAddress, setUniversalAddress] = useState('');
  const [subAccountAddress, setSubAccountAddress] = useState('');
  const [connected, setConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [providerSource, setProviderSource] = useState<string>('none');
  const initAttempted = useRef(false);

  // Initialize provider - try multiple sources in priority order
  useEffect(() => {
    if (initAttempted.current) return;
    initAttempted.current = true;

    const initProvider = async () => {
      // 1. Try Farcaster miniapp SDK ethProvider (primary for miniapp context)
      try {
        const isInMiniApp = await farcasterSdk.isInMiniApp();
        if (isInMiniApp) {
          const ethProvider = farcasterSdk.wallet.ethProvider;
          if (ethProvider) {
            console.log('✅ Provider from Farcaster miniapp SDK (miniapp context)');
            setProvider(ethProvider);
            setProviderSource('farcaster');
            return;
          }
        }
      } catch (error) {
        console.warn('Farcaster miniapp provider not available:', error);
      }

      // 2. Try Base Account SDK (for standalone web context)
      try {
        const { createBaseAccountSDK } = await import('@base-org/account');
        const sdk = createBaseAccountSDK({
          appName: '2048 On-Chain',
          appLogoUrl: `${window.location.origin}/images/game-logo.png`,
          appChainIds: [base.id],
          subAccounts: {
            creation: 'on-connect',
            defaultAccount: 'sub',
          },
        });
        const sdkProvider = sdk.getProvider();
        if (sdkProvider) {
          console.log('✅ Provider from Base Account SDK');
          setProvider(sdkProvider);
          setProviderSource('base-sdk');
          return;
        }
      } catch (error) {
        console.warn('Base Account SDK getProvider failed:', error);
      }

      // 3. Fallback to window.ethereum
      try {
        const win = window as any;
        if (win.ethereum) {
          console.log('✅ Provider from window.ethereum');
          setProvider(win.ethereum);
          setProviderSource('injected');
          return;
        }
      } catch (error) {
        console.warn('window.ethereum not available:', error);
      }

      console.warn('⚠️ No wallet provider found');
    };

    initProvider();
  }, []);

  const connect = useCallback(async () => {
    if (!provider) {
      console.error('No provider available to connect');
      throw new Error('No wallet provider available. Please open this app inside the Base app.');
    }
    setIsConnecting(true);

    try {
      // Request accounts - triggers wallet connection
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
        params: [],
      })) as string[];

      console.log('📱 Accounts returned:', accounts);

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned');
      }

      const primaryAddr = accounts[0];
      setUniversalAddress(primaryAddr);

      // Try to get/create sub account for seamless transactions
      let subAddr = '';
      
      try {
        // Check for existing sub account
        const response = (await provider.request({
          method: 'wallet_getSubAccounts',
          params: [{ account: primaryAddr, domain: window.location.origin }],
        })) as GetSubAccountsResponse;

        const existing = response?.subAccounts?.[0];
        if (existing) {
          subAddr = existing.address;
          console.log('✅ Sub Account found:', subAddr);
        }
      } catch (e) {
        console.warn('wallet_getSubAccounts not supported, skipping:', e);
      }

      if (!subAddr) {
        try {
          // Create a new sub account
          const newSub = (await provider.request({
            method: 'wallet_addSubAccount',
            params: [{ account: { type: 'create' } }],
          })) as SubAccount;
          subAddr = newSub.address;
          console.log('✅ Sub Account created:', subAddr);
        } catch (e) {
          console.warn('wallet_addSubAccount not supported, using primary address:', e);
          // Use primary address as fallback - transactions will require approval each time
          subAddr = primaryAddr;
        }
      }

      setSubAccountAddress(subAddr);
      setConnected(true);
      console.log('✅ Connected! Universal:', primaryAddr, 'Sub:', subAddr, 'Provider:', providerSource);
    } catch (error) {
      console.error('Base Account connection failed:', error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [provider, providerSource]);

  const disconnect = useCallback(() => {
    setConnected(false);
    setUniversalAddress('');
    setSubAccountAddress('');
  }, []);

  // Send transaction from the sub account
  // First tx shows approval popup (Auto Spend Permission), subsequent ones are silent
  const sendTransaction = useCallback(
    async (valueWei: bigint): Promise<string> => {
      if (!provider || !subAccountAddress) {
        throw new Error('Not connected');
      }

      const hexValue = `0x${valueWei.toString(16)}`;
      const hexChainId = `0x${base.id.toString(16)}`;

      const callsId = (await provider.request({
        method: 'wallet_sendCalls',
        params: [
          {
            version: '2.0',
            atomicRequired: true,
            chainId: hexChainId,
            from: subAccountAddress,
            calls: [
              {
                to: CREATOR_ADDRESS,
                data: '0x',
                value: hexValue,
              },
            ],
          },
        ],
      })) as string;

      console.log('✅ Sub Account tx sent:', callsId);
      return callsId;
    },
    [provider, subAccountAddress]
  );

  return {
    provider,
    universalAddress,
    subAccountAddress,
    activeAddress: subAccountAddress || universalAddress,
    connected,
    isConnecting,
    providerSource,
    connect,
    disconnect,
    sendTransaction,
  };
}
