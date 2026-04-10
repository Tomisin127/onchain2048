import { useState, useEffect, useCallback, useRef } from 'react';
import { base } from 'viem/chains';
import { createWalletClient, createPublicClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Attribution } from 'ox/erc8021';

// Payment recipient address for pay-per-move mode
const PAY_PER_MOVE_RECIPIENT = '0xEA549e458e77Fd93bf330e5EAEf730c50d8F5249';

// ERC-8021 builder attribution
const BUILDER_CODE = 'bc_dh0rqw67';
const getAttributionData = () => Attribution.toDataSuffix({ codes: [BUILDER_CODE] });

// Public client for balance checks
const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

export interface SelfPayPermissionParams {
  allowanceEth: string;
  durationDays: number;
  relayerAddress?: string;
  relayerPrivateKey?: string;
  useAdvancedMode?: boolean;
}

type SelfPayMode = 'pay-per-move' | 'advanced-relay';

export function useSelfPayWallet() {
  const [provider, setProvider] = useState<any>(null);
  const [address, setAddress] = useState('');
  const [connected, setConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<SelfPayMode>('pay-per-move');
  
  // Advanced mode state
  const [relayerClient, setRelayerClient] = useState<any>(null);
  const [relayerAddress, setRelayerAddress] = useState('');
  
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
      setAddress(primaryAddr);

      // Determine mode
      const useAdvanced = permissionParams?.useAdvancedMode === true;
      
      if (useAdvanced) {
        // Advanced mode: Setup custom relayer for direct transfers
        const customRelayerAddress = permissionParams?.relayerAddress?.trim();
        const customPrivateKey = permissionParams?.relayerPrivateKey?.trim();
        
        if (!customRelayerAddress || !customPrivateKey) {
          throw new Error('Advanced mode requires both relayer address and private key');
        }

        // Create wallet client with the provided private key
        const formattedKey = customPrivateKey.startsWith('0x') 
          ? customPrivateKey as `0x${string}`
          : `0x${customPrivateKey}` as `0x${string}`;
        
        const account = privateKeyToAccount(formattedKey);
        
        // Verify the address matches the provided key
        if (account.address.toLowerCase() !== customRelayerAddress.toLowerCase()) {
          throw new Error('Private key does not match the provided relayer address');
        }

        const client = createWalletClient({
          account,
          chain: base,
          transport: http(),
        });

        setRelayerClient(client);
        setRelayerAddress(customRelayerAddress);
        setMode('advanced-relay');
      } else {
        // Pay-per-move mode: Simple setup
        setMode('pay-per-move');
      }

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
    setMode('pay-per-move');
    setRelayerClient(null);
    setRelayerAddress('');
  }, []);

  // Send transaction - handles both modes
  const sendTransaction = useCallback(
    async (valueWei: bigint): Promise<string> => {
      // Get builder attribution data
      const attributionData = getAttributionData();
      
      if (mode === 'advanced-relay') {
        // Advanced mode: Use custom relayer for silent direct transfer
        if (!relayerClient || !relayerAddress) {
          throw new Error('Advanced relay not properly configured');
        }

        // Check relayer balance first
        const relayerBalance = await publicClient.getBalance({ 
          address: relayerAddress as `0x${string}` 
        });
        
        // Need enough for gas + the value being sent
        const estimatedGas = parseEther('0.00005');
        const totalNeeded = valueWei + estimatedGas;
        
        if (relayerBalance < totalNeeded) {
          throw new Error(`Insufficient relayer balance. Need ${formatEther(totalNeeded)} ETH, have ${formatEther(relayerBalance)} ETH`);
        }

        // Direct transfer from relayer wallet to the game recipient with builder code
        const txHash = await relayerClient.sendTransaction({
          to: PAY_PER_MOVE_RECIPIENT as `0x${string}`,
          value: valueWei,
          data: attributionData as `0x${string}`,
        });

        return txHash;
      } else {
        // Pay-per-move mode: User pays directly with wallet popup
        if (!provider || !address) {
          throw new Error('Wallet not connected');
        }
        
        // Check user balance first
        const userBalance = await publicClient.getBalance({ 
          address: address as `0x${string}` 
        });
        
        // Need enough for value + gas
        const estimatedGas = parseEther('0.00005');
        const totalNeeded = valueWei + estimatedGas;
        
        if (userBalance < totalNeeded) {
          throw new Error(`Insufficient balance. Need ${formatEther(totalNeeded)} ETH, have ${formatEther(userBalance)} ETH`);
        }

        // Send payment to the recipient address with builder code - this will trigger wallet popup
        const txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: address,
            to: PAY_PER_MOVE_RECIPIENT,
            value: '0x' + valueWei.toString(16),
            data: attributionData,
          }],
        });

        return txHash as string;
      }
    },
    [provider, address, mode, relayerClient, relayerAddress]
  );

  return {
    address,
    connected,
    isConnecting,
    error,
    connect,
    disconnect,
    sendTransaction,
    mode,
    hasRelayer: mode === 'advanced-relay' && !!relayerClient,
    payPerMoveRecipient: PAY_PER_MOVE_RECIPIENT,
  };
}
