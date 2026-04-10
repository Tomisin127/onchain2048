import { useState, useEffect, useCallback, useRef } from 'react';
import { base } from 'viem/chains';
import { createWalletClient, createPublicClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Payment recipient address for pay-per-move mode
const PAY_PER_MOVE_RECIPIENT = '0xEA549e458e77Fd93bf330e5EAEf730c50d8F5249';

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
      console.log('[self-pay] Connected:', primaryAddr);
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

        // Check relayer has some balance
        const relayerBalance = await publicClient.getBalance({ 
          address: customRelayerAddress as `0x${string}` 
        });
        
        console.log('[v0] Advanced mode setup - Relayer balance:', formatEther(relayerBalance), 'ETH');
        
        if (relayerBalance < parseEther('0.0001')) {
          throw new Error(`Relayer wallet has very low balance (${formatEther(relayerBalance)} ETH). Please fund it before playing.`);
        }

        setRelayerClient(client);
        setRelayerAddress(customRelayerAddress);
        setMode('advanced-relay');
        
        console.log('[v0] Advanced mode: Relayer configured successfully');
      } else {
        // Pay-per-move mode: Simple setup
        setMode('pay-per-move');
        console.log('[self-pay] Pay-per-move mode enabled');
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
      console.log('[v0] sendTransaction called with mode:', mode, 'valueWei:', valueWei.toString());
      
      if (mode === 'advanced-relay') {
        // Advanced mode: Use custom relayer for silent direct transfer
        if (!relayerClient || !relayerAddress) {
          console.error('[v0] Advanced relay missing:', { relayerClient: !!relayerClient, relayerAddress });
          throw new Error('Advanced relay not properly configured');
        }

        // Check relayer balance first
        const relayerBalance = await publicClient.getBalance({ 
          address: relayerAddress as `0x${string}` 
        });
        
        console.log('[v0] Relayer balance:', formatEther(relayerBalance), 'ETH');
        
        // Need enough for gas + the value being sent
        const estimatedGas = parseEther('0.00005');
        const totalNeeded = valueWei + estimatedGas;
        
        if (relayerBalance < totalNeeded) {
          throw new Error(`Relayer wallet has insufficient balance. Need ${formatEther(totalNeeded)} ETH, have ${formatEther(relayerBalance)} ETH`);
        }

        console.log('[v0] Advanced mode: Sending direct transfer from relayer to recipient...');

        // Simple direct transfer from relayer wallet to the game recipient
        const txHash = await relayerClient.sendTransaction({
          to: PAY_PER_MOVE_RECIPIENT as `0x${string}`,
          value: valueWei,
        });

        console.log('[v0] Advanced mode tx sent:', txHash);
        return txHash;
      } else {
        // Pay-per-move mode: User pays directly with wallet popup
        if (!provider || !address) {
          console.error('[v0] Pay-per-move missing:', { provider: !!provider, address });
          throw new Error('Wallet not connected');
        }
        
        console.log('[v0] Pay-per-move: Checking balance...');
        
        // Check user balance first
        const userBalance = await publicClient.getBalance({ 
          address: address as `0x${string}` 
        });
        
        console.log('[v0] User balance:', formatEther(userBalance), 'ETH');
        
        // Need enough for value + gas
        const estimatedGas = parseEther('0.00005');
        const totalNeeded = valueWei + estimatedGas;
        
        if (userBalance < totalNeeded) {
          throw new Error(`Insufficient balance. You need at least ${formatEther(totalNeeded)} ETH, you have ${formatEther(userBalance)} ETH`);
        }

        console.log('[v0] Pay-per-move: Requesting wallet transaction...', {
          from: address,
          to: PAY_PER_MOVE_RECIPIENT,
          value: valueWei.toString(),
          valueHex: '0x' + valueWei.toString(16),
        });

        // Send payment to the recipient address
        const txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: address,
            to: PAY_PER_MOVE_RECIPIENT,
            value: '0x' + valueWei.toString(16),
          }],
        });

        console.log('[v0] Pay-per-move tx sent:', txHash);
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
