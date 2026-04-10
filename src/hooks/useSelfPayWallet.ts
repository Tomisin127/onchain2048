import { useState, useEffect, useCallback, useRef } from 'react';
import { base } from 'viem/chains';
import { createWalletClient, createPublicClient, http, parseEther, formatEther, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Payment recipient address for pay-per-move mode
const PAY_PER_MOVE_RECIPIENT = '0xEA549e458e77Fd93bf330e5EAEf730c50d8F5249';

const SPEND_PERMISSION_MANAGER = '0xf85210B21cC50302F477BA56686d2019dC9b67Ad';
const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Public client for balance checks
const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

// ABI for spend permission manager
const spendPermissionManagerAbi = [
  {
    name: 'approveWithSignature',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'permission',
        type: 'tuple',
        components: [
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
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'spend',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'permission',
        type: 'tuple',
        components: [
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
      },
      { name: 'value', type: 'uint160' },
    ],
    outputs: [],
  },
] as const;

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
  const [permissionApproved, setPermissionApproved] = useState(false);
  
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
    setPermissionApproved(false);
  }, []);

  // Send transaction - handles both modes
  const sendTransaction = useCallback(
    async (valueWei: bigint): Promise<string> => {
      if (!provider || !address) {
        throw new Error('Wallet not connected');
      }

      if (mode === 'advanced-relay') {
        // Advanced mode: Use custom relayer for silent transactions
        if (!relayerClient || !spendPermission || !spendSignature || !relayerAddress) {
          throw new Error('Advanced relay not properly configured');
        }

        // Check relayer balance first
        const relayerBalance = await publicClient.getBalance({ 
          address: relayerAddress as `0x${string}` 
        });
        
        // Need enough for gas (estimate ~0.0001 ETH for gas) + the value
        const estimatedGas = parseEther('0.0001');
        if (relayerBalance < estimatedGas) {
          throw new Error('Relayer wallet has insufficient balance for gas fees');
        }

        console.log('[self-pay] Advanced mode: Sending transaction via relayer...');

        const permissionTuple = {
          account: spendPermission.account as `0x${string}`,
          spender: spendPermission.spender as `0x${string}`,
          token: spendPermission.token as `0x${string}`,
          allowance: BigInt(spendPermission.allowance),
          period: spendPermission.period,
          start: spendPermission.start,
          end: spendPermission.end,
          salt: BigInt(spendPermission.salt),
          extraData: (spendPermission.extraData || '0x') as `0x${string}`,
        };

        // First transaction: approve the permission if not already approved
        if (!permissionApproved) {
          console.log('[self-pay] Approving spend permission on-chain...');
          
          const approveData = encodeFunctionData({
            abi: spendPermissionManagerAbi,
            functionName: 'approveWithSignature',
            args: [permissionTuple, spendSignature as `0x${string}`],
          });

          const approveHash = await relayerClient.sendTransaction({
            to: SPEND_PERMISSION_MANAGER as `0x${string}`,
            data: approveData,
          });

          console.log('[self-pay] Permission approved:', approveHash);
          
          // Wait for confirmation
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
          setPermissionApproved(true);
        }

        // Now call spend() to transfer the value
        const spendData = encodeFunctionData({
          abi: spendPermissionManagerAbi,
          functionName: 'spend',
          args: [permissionTuple, valueWei],
        });

        const txHash = await relayerClient.sendTransaction({
          to: SPEND_PERMISSION_MANAGER as `0x${string}`,
          data: spendData,
        });

        console.log('[self-pay] Advanced mode spend tx:', txHash);
        return txHash;
      } else {
        // Pay-per-move mode: User pays directly with wallet popup
        console.log('[self-pay] Pay-per-move: Requesting payment...');
        
        // Check user balance first
        const userBalance = await publicClient.getBalance({ 
          address: address as `0x${string}` 
        });
        
        // Need enough for value + gas (estimate ~0.0001 ETH for gas)
        const estimatedGas = parseEther('0.00005');
        const totalNeeded = valueWei + estimatedGas;
        
        if (userBalance < totalNeeded) {
          throw new Error(`Insufficient balance. You need at least ${formatEther(totalNeeded)} ETH`);
        }

        // Send payment to the recipient address
        const txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: address,
            to: PAY_PER_MOVE_RECIPIENT,
            value: '0x' + valueWei.toString(16),
          }],
        });

        console.log('[self-pay] Pay-per-move tx:', txHash);
        return txHash as string;
      }
    },
    [provider, address, mode, relayerClient, relayerAddress, spendPermission, spendSignature, permissionApproved]
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
  };
}
