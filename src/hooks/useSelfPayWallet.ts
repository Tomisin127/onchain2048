import { useState, useEffect, useCallback, useRef } from 'react';
import { base } from 'viem/chains';
import { createWalletClient, createPublicClient, http, fallback, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Attribution } from 'ox/erc8021';

// Payment recipient address for pay-per-move mode
const PAY_PER_MOVE_RECIPIENT = '0xEA549e458e77Fd93bf330e5EAEf730c50d8F5249';

// ERC-8021 builder attribution
const BUILDER_CODE = 'bc_dh0rqw67';
const getAttributionData = () => Attribution.toDataSuffix({ codes: [BUILDER_CODE] });

// Multiple Base RPCs for reliability (heavy txs like Uniswap swaps fail on the
// default public RPC frequently — using a fallback transport avoids that)
const BASE_RPC_URLS = [
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
  'https://1rpc.io/base',
  'https://base.drpc.org',
] as const;

const baseTransport = () =>
  fallback(BASE_RPC_URLS.map((url) => http(url, { timeout: 15000, retryCount: 1 })));

// Public client for balance checks
const publicClient = createPublicClient({
  chain: base,
  transport: baseTransport(),
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
          transport: baseTransport(),
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

        // Send payment to the recipient address with builder code - this will trigger wallet popup
        // Let the wallet handle balance/gas validation instead of pre-checking
        const txParams = {
          from: address,
          to: PAY_PER_MOVE_RECIPIENT,
          value: '0x' + valueWei.toString(16),
          data: attributionData,
        };

        const txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [txParams],
        });

        if (!txHash) {
          throw new Error('Transaction was not submitted');
        }

        return txHash as string;
      }
    },
    [provider, address, mode, relayerClient, relayerAddress]
  );

  // Generic transaction sender for arbitrary calls (e.g. token approvals, swaps)
  // Routes through the relayer in advanced mode, or the browser wallet in pay-per-move mode
  const sendArbitraryTransaction = useCallback(
    async (params: { to: string; value?: bigint; data?: string }): Promise<string> => {
      // Append the ERC-8021 builder attribution suffix to the calldata so swaps
      // (and other arbitrary calls) are credited to our builder code on Base.
      // The suffix is trailing data the target contract ignores but indexers read.
      const attributionSuffix = getAttributionData(); // "0x..."
      const baseData = (params.data ?? '0x') as `0x${string}`;
      const dataWithAttribution = (
        baseData === '0x'
          ? attributionSuffix
          : (baseData + attributionSuffix.slice(2))
      ) as `0x${string}`;

      if (mode === 'advanced-relay') {
        if (!relayerClient || !relayerAddress) {
          throw new Error('Advanced relay not properly configured');
        }

        const value = params.value ?? BigInt(0);
        const data = dataWithAttribution;
        const to = params.to as `0x${string}`;

        // Pre-flight: simulate the call so we surface revert reasons clearly
        // (Uniswap swaps fail with detailed reasons like "STF" / "Too little received")
        let gasLimit: bigint;
        try {
          const estimated = await publicClient.estimateGas({
            account: relayerAddress as `0x${string}`,
            to,
            value,
            data,
          });
          // Add a 25% buffer for safety
          gasLimit = (estimated * BigInt(125)) / BigInt(100);
        } catch (err: any) {
          const reason =
            err?.shortMessage ||
            err?.details ||
            err?.message ||
            'Transaction would revert';
          console.error('[v0] Relayer gas estimate failed:', err);
          throw new Error(`Transaction would fail: ${reason}`);
        }

        // Get gas price to compute total cost
        let gasPrice: bigint;
        try {
          gasPrice = await publicClient.getGasPrice();
        } catch {
          gasPrice = parseEther('0.000000001'); // 1 gwei fallback
        }
        const gasCost = gasLimit * gasPrice;

        // Pre-check balance for clearer errors
        const relayerBalance = await publicClient.getBalance({
          address: relayerAddress as `0x${string}`,
        });
        const totalNeeded = value + gasCost;
        if (relayerBalance < totalNeeded) {
          throw new Error(
            `Insufficient relayer balance. Need ~${formatEther(totalNeeded)} ETH (${formatEther(value)} value + ${formatEther(gasCost)} gas), have ${formatEther(relayerBalance)} ETH`
          );
        }

        try {
          const txHash = await relayerClient.sendTransaction({
            to,
            value,
            data,
            gas: gasLimit,
          });
          return txHash;
        } catch (err: any) {
          const reason =
            err?.shortMessage ||
            err?.details ||
            err?.message ||
            'Unknown error';
          console.error('[v0] Relayer sendTransaction failed:', err);
          throw new Error(`Relayer tx failed: ${reason}`);
        }
      } else {
        if (!provider || !address) {
          throw new Error('Wallet not connected');
        }

        const txParams: Record<string, string> = {
          from: address,
          to: params.to,
          // Always include the attribution-suffixed data so the builder code
          // is attached to swaps signed via the browser wallet too.
          data: dataWithAttribution,
        };
        if (params.value && params.value > BigInt(0)) {
          txParams.value = '0x' + params.value.toString(16);
        }

        const txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [txParams],
        });

        if (!txHash) {
          throw new Error('Transaction was not submitted');
        }

        return txHash as string;
      }
    },
    [provider, address, mode, relayerClient, relayerAddress]
  );

  // The address that should be considered the user's "self-pay wallet"
  // - In advanced mode, this is the relayer (the wallet that actually holds funds and signs)
  // - In pay-per-move mode, this is the browser wallet
  const activeAddress = mode === 'advanced-relay' ? relayerAddress : address;

  return {
    address,
    activeAddress,
    relayerAddress,
    connected,
    isConnecting,
    error,
    connect,
    disconnect,
    sendTransaction,
    sendArbitraryTransaction,
    mode,
    hasRelayer: mode === 'advanced-relay' && !!relayerClient,
    payPerMoveRecipient: PAY_PER_MOVE_RECIPIENT,
  };
}
