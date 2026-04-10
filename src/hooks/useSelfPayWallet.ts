import { useState, useEffect, useCallback, useRef } from 'react';
import { base } from 'viem/chains';
import { createWalletClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Payment recipient address for pay-per-move mode
const PAY_PER_MOVE_RECIPIENT = '0xEA549e458e77Fd93bf330e5EAEf730c50d8F5249';
const MOVE_COST_WEI = parseEther('0.0001'); // Cost per move

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
  const [spendPermission, setSpendPermission] = useState<SpendPermission | null>(null);
  const [spendSignature, setSpendSignature] = useState('');
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
        // Advanced mode: Setup custom relayer
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

        // Build spend permission
        const now = Math.floor(Date.now() / 1000);
        const allowanceEth = permissionParams?.allowanceEth || '1';
        const durationDays = permissionParams?.durationDays || 30;
        const allowanceWei = BigInt(Math.floor(parseFloat(allowanceEth) * 1e18)).toString();

        const permission: SpendPermission = {
          account: primaryAddr,
          spender: customRelayerAddress,
          token: NATIVE_TOKEN_ADDRESS,
          allowance: allowanceWei,
          period: 86400,
          start: now,
          end: now + durationDays * 86400,
          salt: '0x' + Math.floor(Math.random() * 1e18).toString(16).padStart(64, '0'),
          extraData: '0x',
        };

        // Sign the spend permission with user's wallet
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

        console.log('[self-pay] Advanced mode: Spend permission signed');
        setSpendPermission(permission);
        setSpendSignature(signature as string);
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
    setSpendPermission(null);
    setSpendSignature('');
    setRelayerClient(null);
    setRelayerAddress('');
  }, []);

  // Send transaction - handles both modes
  const sendTransaction = useCallback(
    async (valueWei: bigint): Promise<string> => {
      if (!provider || !address) {
        throw new Error('Wallet not connected');
      }

      if (mode === 'advanced-relay') {
        // Advanced mode: Use custom relayer for silent transactions
        if (!relayerClient || !spendPermission || !spendSignature) {
          throw new Error('Advanced relay not properly configured');
        }

        console.log('[self-pay] Advanced mode: Sending optimistic transaction...');

        // The relayer wallet sends the transaction (silent, no popup)
        const txHash = await relayerClient.sendTransaction({
          to: SPEND_PERMISSION_MANAGER,
          value: valueWei,
          data: '0x', // Simple transfer for now
        });

        console.log('[self-pay] Advanced mode tx:', txHash);
        return txHash;
      } else {
        // Pay-per-move mode: User pays directly with wallet popup
        console.log('[self-pay] Pay-per-move: Requesting payment...');

        // Send payment to the recipient address
        const txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: address,
            to: PAY_PER_MOVE_RECIPIENT,
            value: '0x' + MOVE_COST_WEI.toString(16),
          }],
        });

        console.log('[self-pay] Pay-per-move tx:', txHash);
        return txHash as string;
      }
    },
    [provider, address, mode, relayerClient, spendPermission, spendSignature]
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
    hasSpendPermission: mode === 'advanced-relay' && !!spendPermission && !!spendSignature,
    payPerMoveRecipient: PAY_PER_MOVE_RECIPIENT,
    moveCost: formatEther(MOVE_COST_WEI),
  };
}
