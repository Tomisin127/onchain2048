import { useState, useEffect, useCallback, useRef } from 'react';
import { createBaseAccountSDK } from '@base-org/account';
import { base } from 'viem/chains';

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
  const sdkRef = useRef<ReturnType<typeof createBaseAccountSDK> | null>(null);

  // Initialize SDK once
  useEffect(() => {
    try {
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
      setProvider(sdk.getProvider());
    } catch (error) {
      console.error('Base Account SDK init failed:', error);
    }
  }, []);

  const connect = useCallback(async () => {
    if (!provider) return;
    setIsConnecting(true);

    try {
      // Connect + auto-create sub account (creation: 'on-connect')
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
        params: [],
      })) as string[];

      // With defaultAccount: 'sub', sub account is first if it exists
      // Otherwise universal is first
      const universalAddr = accounts[0];
      setUniversalAddress(universalAddr);

      // Check for existing sub account
      const response = (await provider.request({
        method: 'wallet_getSubAccounts',
        params: [{ account: universalAddr, domain: window.location.origin }],
      })) as GetSubAccountsResponse;

      const existing = response.subAccounts[0];
      if (existing) {
        setSubAccountAddress(existing.address);
        console.log('✅ Sub Account found:', existing.address);
      } else {
        // Create one if not exists (shouldn't happen with on-connect, but fallback)
        try {
          const newSub = (await provider.request({
            method: 'wallet_addSubAccount',
            params: [{ account: { type: 'create' } }],
          })) as SubAccount;
          setSubAccountAddress(newSub.address);
          console.log('✅ Sub Account created:', newSub.address);
        } catch (e) {
          console.warn('Sub account creation failed, using universal:', e);
          setSubAccountAddress(universalAddr);
        }
      }

      setConnected(true);
    } catch (error) {
      console.error('Base Account connection failed:', error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [provider]);

  const disconnect = useCallback(() => {
    setConnected(false);
    setUniversalAddress('');
    setSubAccountAddress('');
  }, []);

  // Send a silent transaction from the sub account
  // First tx shows approval popup, subsequent ones are silent
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
    connect,
    disconnect,
    sendTransaction,
  };
}
