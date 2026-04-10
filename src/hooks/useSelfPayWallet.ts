import { useState, useEffect, useCallback, useRef } from 'react';
import { base } from 'viem/chains';
import { parseAbi } from 'viem';
import { supabase } from '@/integrations/supabase/client';

const SPEND_PERMISSION_MANAGER = '0xf85210B21cC50302F477BA56686d2019dC9b67Ad';
const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

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

const spendPermissionManagerAbi = parseAbi([
  'function approveWithSignature((address account, address spender, address token, uint160 allowance, uint48 period, uint48 start, uint48 end, uint256 salt, bytes extraData) permission, bytes signature) external',
  'function spend((address account, address spender, address token, uint160 allowance, uint48 period, uint48 start, uint48 end, uint256 salt, bytes extraData) permission, uint160 value) external',
]);

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

export interface SelfPayPermissionParams {
  allowanceEth: string;
  durationDays: number;
}

export function useSelfPayWallet() {
  const [provider, setProvider] = useState<any>(null);
  const [address, setAddress] = useState('');
  const [connected, setConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  const [spendPermission, setSpendPermission] = useState<SpendPermission | null>(null);
  const [spendSignature, setSpendSignature] = useState('');
  const initAttempted = useRef(false);

  // Detect provider
  useEffect(() => {
    if (initAttempted.current) return;
    initAttempted.current = true;
    const win = window as any;
    if (win.ethereum && typeof win.ethereum.request === 'function') {
      setProvider(win.ethereum);
    }
  }, []);

  const connect = useCallback(async (permissionParams?: SelfPayPermissionParams) => {
    let activeProvider = provider;
    if (!activeProvider) {
      const win = window as any;
      if (win.ethereum) {
        activeProvider = win.ethereum;
        setProvider(win.ethereum);
      }
    }
    if (!activeProvider) {
      const msg = 'No wallet provider found. Please install a Web3 wallet.';
      setError(msg);
      throw new Error(msg);
    }

    setIsConnecting(true);
    setError('');

    try {
      const accounts = (await activeProvider.request({
        method: 'eth_requestAccounts',
        params: [],
      })) as string[];

      if (!accounts?.length) throw new Error('No accounts returned');

      const primaryAddr = accounts[0];
      console.log('[self-pay] Connected:', primaryAddr);
      setAddress(primaryAddr);

      // Get relayer address from backend
      let relayerAddr = '';
      try {
        const { data, error: invokeError } = await supabase.functions.invoke('relay-transaction');
        if (invokeError) throw invokeError;
        relayerAddr = data?.spenderAddress;
        console.log('[self-pay] Relayer address:', relayerAddr);
      } catch (err) {
        console.error('[self-pay] Failed to get relayer address:', err);
        throw new Error('Cannot retrieve relayer address');
      }

      if (!relayerAddr) {
        throw new Error('No relayer address returned');
      }

      // Build spend permission where:
      // - account = player's address (the one being charged)
      // - spender = relayer's address (pays fees on behalf of player)
      const now = Math.floor(Date.now() / 1000);
      const allowanceEth = permissionParams?.allowanceEth || '1';
      const durationDays = permissionParams?.durationDays || 30;
      const allowanceWei = BigInt(Math.floor(parseFloat(allowanceEth) * 1e18)).toString();

      console.log('[self-pay] Spend permission config:', { allowanceEth, durationDays, account: primaryAddr, spender: relayerAddr });

      const permission: SpendPermission = {
        account: primaryAddr,
        spender: relayerAddr, // Relayer is the spender (pays for everything)
        token: NATIVE_TOKEN_ADDRESS,
        allowance: allowanceWei,
        period: 86400,
        start: now,
        end: now + durationDays * 86400,
        salt: '0x' + Math.floor(Math.random() * 1e18).toString(16).padStart(64, '0'),
        extraData: '0x',
      };

      // Sign the spend permission
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

      console.log('[self-pay] ✅ Spend permission signed!');
      setSpendPermission(permission);
      setSpendSignature(signature as string);
      setConnected(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, [provider]);

  const disconnect = useCallback(() => {
    setConnected(false);
    setAddress('');
    setError('');
    setSpendPermission(null);
    setSpendSignature('');
  }, []);

  // Each move: relay through backend (completely silent, no wallet popup)
  const sendTransaction = useCallback(
    async (valueWei: bigint): Promise<string> => {
      if (!spendPermission || !spendSignature) {
        throw new Error('Wallet not connected or spend permission not signed');
      }

      console.log('[self-pay] Sending transaction via relayer...', { value: valueWei.toString() });

      const { data, error: invokeError } = await supabase.functions.invoke('relay-transaction', {
        body: {
          permission: spendPermission,
          signature: spendSignature,
          amount: valueWei.toString(),
        },
      });

      if (invokeError) {
        console.error('[self-pay] Relayer invoke error:', invokeError);
        throw new Error(invokeError.message || 'Transaction relay failed');
      }

      if (data?.error) {
        console.error('[self-pay] Relayer returned error:', data.error);
        throw new Error(data.error);
      }

      const txHash = data?.txHashes?.[data.txHashes.length - 1] || '';
      if (!txHash) {
        throw new Error('Transaction sent but tx hash was missing');
      }

      console.log('[self-pay] ✅ Transaction via relayer:', txHash);
      return txHash as string;
    },
    [spendPermission, spendSignature]
  );

  return {
    address,
    connected,
    isConnecting,
    error,
    connect,
    disconnect,
    sendTransaction,
    hasSpendPermission: !!spendPermission && !!spendSignature,
  };
}
