import { useState, useEffect, useCallback, useRef } from 'react';
import { base } from 'viem/chains';
import { sdk as farcasterSdk } from '@farcaster/miniapp-sdk';
import { supabase } from '@/integrations/supabase/client';

const CREATOR_ADDRESS = '0xEA549e458e77Fd93bf330e5EAEf730c50d8F5249';

// EIP-712 typed data for SpendPermission
const SPEND_PERMISSION_TYPES = {
  SpendPermission: [
    { name: 'account', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'allowance', type: 'uint160' },
    { name: 'period', type: 'uint48' },
    { name: 'start', type: 'uint48' },
    { name: 'end', type: 'uint48' },
    { name: 'salt', type: 'uint256' },
    { name: 'extraData', type: 'bytes' },
  ],
} as const;

const SPEND_PERMISSION_MANAGER = '0xf85210B21cBe22aa85e8203C7B407073C7530070';

interface SpendPermission {
  account: string;
  spender: string;
  token: string;
  allowance: string;
  period: number;
  start: number;
  end: number;
  salt: string;
  extraData: string;
}

export function useBaseSubAccount() {
  const [provider, setProvider] = useState<any>(null);
  const [universalAddress, setUniversalAddress] = useState('');
  const [subAccountAddress, setSubAccountAddress] = useState('');
  const [connected, setConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [providerSource, setProviderSource] = useState<string>('none');
  const [error, setError] = useState<string>('');
  const [spendPermission, setSpendPermission] = useState<SpendPermission | null>(null);
  const [spendSignature, setSpendSignature] = useState<string>('');
  const initAttempted = useRef(false);

  // Initialize provider
  useEffect(() => {
    if (initAttempted.current) return;
    initAttempted.current = true;

    const initProvider = async () => {
      console.log('[v0] Starting wallet provider initialization...');
      setError('');

      // 1. Farcaster miniapp SDK ethProvider (most reliable in Base app)
      try {
        const directFarcasterProvider = (farcasterSdk as any)?.wallet?.ethProvider;
        if (directFarcasterProvider && typeof directFarcasterProvider.request === 'function') {
          console.log('✅ Provider from Farcaster miniapp SDK (direct wallet provider)');
          setProvider(directFarcasterProvider);
          setProviderSource('farcaster');
          return;
        }
      } catch (err) {
        console.warn('[v0] Direct Farcaster provider check failed:', err);
      }

      // 2. Farcaster miniapp context check
      try {
        const isInMiniApp = await farcasterSdk.isInMiniApp();
        if (isInMiniApp) {
          const ethProvider = (farcasterSdk as any)?.wallet?.ethProvider;
          if (ethProvider && typeof ethProvider.request === 'function') {
            console.log('✅ Provider from Farcaster miniapp SDK (miniapp context)');
            setProvider(ethProvider);
            setProviderSource('farcaster');
            return;
          }
        }
      } catch (err) {
        console.warn('[v0] Farcaster miniapp provider not available:', err);
      }

      // 3. window.ethereum fallback
      try {
        const win = window as any;
        if (win.ethereum && typeof win.ethereum.request === 'function') {
          console.log('✅ Provider from window.ethereum');
          setProvider(win.ethereum);
          setProviderSource('injected');
          return;
        }
      } catch (err) {
        console.warn('[v0] window.ethereum not available:', err);
      }

      console.warn('⚠️ No wallet provider found');
      setError('No wallet provider detected. Please open this app in the Base app.');
    };

    void initProvider();
  }, []);

  const connect = useCallback(async () => {
    let activeProvider = provider;

    // Retry provider detection if missing
    if (!activeProvider) {
      try {
        const fp = (farcasterSdk as any)?.wallet?.ethProvider;
        if (fp && typeof fp.request === 'function') {
          activeProvider = fp;
          setProvider(fp);
          setProviderSource('farcaster');
        }
      } catch {}
    }
    if (!activeProvider) {
      try {
        const win = window as any;
        if (win.ethereum && typeof win.ethereum.request === 'function') {
          activeProvider = win.ethereum;
          setProvider(win.ethereum);
          setProviderSource('injected');
        }
      } catch {}
    }

    if (!activeProvider) {
      const errorMsg = 'No wallet provider available. Please open this app inside the Base app.';
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    setIsConnecting(true);
    setError('');

    try {
      console.log('[v0] Starting connection...');

      const accounts = (await activeProvider.request({
        method: 'eth_requestAccounts',
        params: [],
      })) as string[];

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned from wallet');
      }

      const primaryAddr = accounts[0];
      console.log('[v0] Primary address:', primaryAddr);
      setUniversalAddress(primaryAddr);
      setSubAccountAddress(primaryAddr);

      // Now request Spend Permission (one-time popup)
      console.log('[v0] Requesting spend permission signature...');
      const now = Math.floor(Date.now() / 1000);
      const permission: SpendPermission = {
        account: primaryAddr,
        spender: CREATOR_ADDRESS,
        token: '0x0000000000000000000000000000000000000000', // Native ETH
        allowance: '1000000000000000000', // 1 ETH
        period: 86400, // 1 day
        start: now,
        end: now + 30 * 86400, // 30 days
        salt: '0x' + Math.floor(Math.random() * 1e18).toString(16).padStart(64, '0'),
        extraData: '0x',
      };

      try {
        // EIP-712 domain for SpendPermissionManager on Base
        const domain = {
          name: 'Spend Permission Manager',
          version: '1',
          chainId: base.id,
          verifyingContract: SPEND_PERMISSION_MANAGER,
        };

        const signature = await activeProvider.request({
          method: 'eth_signTypedData_v4',
          params: [
            primaryAddr,
            JSON.stringify({
              types: {
                EIP712Domain: [
                  { name: 'name', type: 'string' },
                  { name: 'version', type: 'string' },
                  { name: 'chainId', type: 'uint256' },
                  { name: 'verifyingContract', type: 'address' },
                ],
                ...SPEND_PERMISSION_TYPES,
              },
              primaryType: 'SpendPermission',
              domain,
              message: permission,
            }),
          ],
        });

        console.log('[v0] ✅ Spend permission signed!');
        setSpendPermission(permission);
        setSpendSignature(signature as string);
      } catch (signError) {
        console.warn('[v0] Spend permission signing failed (user may have rejected):', signError);
        // Still connect, but transactions will use direct eth_sendTransaction as fallback
      }

      setConnected(true);
      console.log('[v0] ✅ Connected! Address:', primaryAddr);
    } catch (err) {
      const errorMsg = `Connection failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error('[v0]', errorMsg);
      setError(errorMsg);
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, [provider]);

  const disconnect = useCallback(() => {
    setConnected(false);
    setUniversalAddress('');
    setSubAccountAddress('');
    setSpendPermission(null);
    setSpendSignature('');
    setError('');
  }, []);

  // Send transaction - uses backend relayer if spend permission available, else direct tx
  const sendTransaction = useCallback(
    async (valueWei: bigint): Promise<string> => {
      // If we have a signed spend permission, use the backend relayer (silent!)
      if (spendPermission && spendSignature) {
        console.log('[v0] Using backend relayer for silent transaction...');
        try {
          const { data, error: invokeError } = await supabase.functions.invoke('relay-transaction', {
            body: {
              permission: spendPermission,
              signature: spendSignature,
              amount: valueWei.toString(),
            },
          });

          if (invokeError) {
            console.error('[v0] Relayer invoke error:', invokeError);
            throw new Error(invokeError.message || 'Relay failed');
          }

          if (data?.error) {
            console.error('[v0] Relayer returned error:', data.error);
            throw new Error(data.error);
          }

          const txHash = data?.txHashes?.[data.txHashes.length - 1] || '';
          console.log('[v0] ✅ Silent transaction via relayer:', txHash);
          return txHash;
        } catch (relayError) {
          console.warn('[v0] Relayer failed, falling back to direct tx:', relayError);
          // Fall through to direct transaction
        }
      }

      // Fallback: direct transaction (will show popup)
      if (!provider) throw new Error('Provider not initialized');
      const fromAddr = subAccountAddress || universalAddress;
      if (!fromAddr) throw new Error('No account connected');

      const hexValue = `0x${valueWei.toString(16)}`;
      console.log('[v0] Fallback: direct eth_sendTransaction (will show popup)');

      const txHash = (await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: fromAddr, to: CREATOR_ADDRESS, value: hexValue, data: '0x' }],
      })) as string;

      console.log('[v0] ✅ Direct tx sent:', txHash);
      return txHash;
    },
    [provider, subAccountAddress, universalAddress, spendPermission, spendSignature]
  );

  // No-op for backward compatibility
  const requestSpendPermission = useCallback(async () => null, []);

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
    requestSpendPermission,
    hasSpendPermission: !!spendPermission && !!spendSignature,
  };
}
