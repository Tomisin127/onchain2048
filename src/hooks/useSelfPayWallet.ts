import { useState, useEffect, useCallback, useRef } from 'react';
import { encodeFunctionData, parseAbi } from 'viem';

const CREATOR_ADDRESS = '0xEA549e458e77Fd93bf330e5EAEf730c50d8F5249';

// ERC-8021 builder attribution suffix (bc_dh0rqw67)
// We manually encode: magic bytes 802180218021 + builder code
const BUILDER_CODE_SUFFIX = '626f746833300000000000000000000000000000000000000000000000000000802180218021';

export function useSelfPayWallet() {
  const [provider, setProvider] = useState<any>(null);
  const [address, setAddress] = useState('');
  const [connected, setConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
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

  const connect = useCallback(async () => {
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

      const addr = accounts[0];
      console.log('[self-pay] Connected:', addr);
      setAddress(addr);
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
  }, []);

  // Send ETH transfer to creator with builder code in data
  const sendTransaction = useCallback(
    async (valueWei: bigint): Promise<string> => {
      if (!provider || !address) {
        throw new Error('Wallet not connected');
      }

      const valueHex = '0x' + valueWei.toString(16);

      // Builder code attribution as data suffix
      const data = '0x' + BUILDER_CODE_SUFFIX;

      console.log('[self-pay] Sending tx with builder code attribution:', {
        from: address,
        to: CREATOR_ADDRESS,
        value: valueHex,
        dataLength: data.length,
      });

      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: CREATOR_ADDRESS,
          value: valueHex,
          data,
        }],
      });

      console.log('[self-pay] ✅ Tx sent:', txHash);
      return txHash as string;
    },
    [provider, address]
  );

  return {
    address,
    connected,
    isConnecting,
    error,
    connect,
    disconnect,
    sendTransaction,
  };
}
