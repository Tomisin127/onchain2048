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

interface WalletAddSubAccountResponse {
  address: `0x${string}`;
  factory?: `0x${string}`;
  factoryData?: `0x${string}`;
}

export function useBaseSubAccount() {
  const [provider, setProvider] = useState<any>(null);
  const [universalAddress, setUniversalAddress] = useState('');
  const [subAccountAddress, setSubAccountAddress] = useState('');
  const [connected, setConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [providerSource, setProviderSource] = useState<string>('none');
  const [error, setError] = useState<string>('');
  const initAttempted = useRef(false);
  const sdkRef = useRef<any>(null);

  // Initialize provider - try multiple sources in priority order
  useEffect(() => {
    if (initAttempted.current) return;
    initAttempted.current = true;

    const initProvider = async () => {
      console.log('[v0] Starting wallet provider initialization...');
      
      // 1. Try Farcaster miniapp SDK ethProvider (primary for miniapp context)
      try {
        const isInMiniApp = await farcasterSdk.isInMiniApp();
        console.log('[v0] Farcaster check:', isInMiniApp);
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
        console.warn('[v0] Farcaster miniapp provider not available:', error);
      }

      // 2. Try Base Account SDK (for standalone web context)
      try {
        console.log('[v0] Attempting to load Base Account SDK...');
        const { createBaseAccountSDK } = await import('@base-org/account');
        console.log('[v0] Base Account SDK imported successfully');
        
        const sdk = createBaseAccountSDK({
          appName: '2048 On-Chain',
          appLogoUrl: `${window.location.origin}/images/game-logo.png`,
          appChainIds: [base.id],
          subAccounts: {
            creation: 'on-connect',
            defaultAccount: 'sub',
          },
        });
        
        sdkRef.current = sdk;
        console.log('[v0] SDK created, getting provider...');
        
        const sdkProvider = sdk.getProvider();
        if (sdkProvider) {
          console.log('✅ Provider from Base Account SDK');
          console.log('[v0] Provider methods:', Object.keys(sdkProvider).slice(0, 5));
          setProvider(sdkProvider);
          setProviderSource('base-sdk');
          return;
        } else {
          console.warn('[v0] SDK getProvider() returned null/undefined');
        }
      } catch (error) {
        console.warn('[v0] Base Account SDK initialization failed:', error);
        setError(`Base Account SDK error: ${error instanceof Error ? error.message : String(error)}`);
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
        console.warn('[v0] window.ethereum not available:', error);
      }

      console.warn('⚠️ No wallet provider found');
      setError('No wallet provider detected. Please install the Base app or a Web3 wallet extension.');
    };

    initProvider();
  }, []);

  const connect = useCallback(async () => {
    if (!provider) {
      const errorMsg = 'No wallet provider available. Please open this app inside the Base app.';
      console.error(errorMsg);
      setError(errorMsg);
      throw new Error(errorMsg);
    }
    
    setIsConnecting(true);
    setError('');

    try {
      console.log('[v0] Starting connection...');
      
      // Request accounts - triggers wallet connection
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
        params: [],
      })) as string[];

      console.log('[v0] Accounts returned:', accounts);

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned from wallet');
      }

      const primaryAddr = accounts[0];
      console.log('[v0] Primary/Universal address:', primaryAddr);
      setUniversalAddress(primaryAddr);

      // For Base Account SDK with sub accounts auto-create enabled,
      // the sub account should be created automatically on connect
      let subAddr = '';
      
      try {
        console.log('[v0] Attempting to get existing sub accounts...');
        // Check for existing sub account
        const response = (await provider.request({
          method: 'wallet_getSubAccounts',
          params: [{ account: primaryAddr, domain: window.location.origin }],
        })) as GetSubAccountsResponse;

        const existing = response?.subAccounts?.[0];
        if (existing) {
          subAddr = existing.address;
          console.log('[v0] Sub Account found:', subAddr);
        } else {
          console.log('[v0] No existing sub accounts found');
        }
      } catch (e) {
        console.warn('[v0] wallet_getSubAccounts not supported or failed:', e);
      }

      // If no sub account exists, try to create one
      if (!subAddr) {
        try {
          console.log('[v0] Creating new sub account...');
          const newSub = (await provider.request({
            method: 'wallet_addSubAccount',
            params: [
              {
                account: {
                  type: 'create',
                },
              },
            ],
          })) as WalletAddSubAccountResponse;
          
          subAddr = newSub.address;
          console.log('[v0] Sub Account created:', subAddr);
        } catch (e) {
          console.warn('[v0] wallet_addSubAccount failed, using primary address as fallback:', e);
          setError(`Sub Account creation not supported. Transactions will require manual approval each time.`);
          // Use primary address as fallback - transactions will require approval each time
          subAddr = primaryAddr;
        }
      }

      setSubAccountAddress(subAddr);
      setConnected(true);
      console.log('[v0] ✅ Connected! Universal:', primaryAddr, 'Sub:', subAddr, 'Provider Source:', providerSource);
    } catch (error) {
      const errorMsg = `Base Account connection failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error('[v0]', errorMsg);
      setError(errorMsg);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [provider, providerSource]);

  const disconnect = useCallback(() => {
    setConnected(false);
    setUniversalAddress('');
    setSubAccountAddress('');
    setError('');
  }, []);

  // Send transaction from the sub account
  // First tx shows approval popup (Auto Spend Permission), subsequent ones are silent
  const sendTransaction = useCallback(
    async (valueWei: bigint): Promise<string> => {
      if (!provider) {
        throw new Error('Provider not initialized');
      }
      
      if (!subAccountAddress) {
        throw new Error('Sub account not connected');
      }

      const hexValue = `0x${valueWei.toString(16)}`;
      const hexChainId = `0x${base.id.toString(16)}`;

      console.log('[v0] Sending transaction from sub account:', {
        from: subAccountAddress,
        to: CREATOR_ADDRESS,
        value: hexValue,
        chainId: hexChainId,
      });

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

      console.log('[v0] ✅ Sub Account tx sent:', callsId);
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
    error,
    connect,
    disconnect,
    sendTransaction,
  };
}
