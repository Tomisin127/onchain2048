import { useState, useEffect, useCallback, useRef } from 'react';
import { base } from 'viem/chains';
import { encodeFunctionData, parseAbi } from 'viem';
import { Attribution } from 'ox/erc8021';

const SPEND_PERMISSION_MANAGER = '0xf85210B21cC50302F477BA56686d2019dC9b67Ad';
const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// ERC-8021 attribution suffix using ox library
const ERC_8021_SUFFIX_RAW = Attribution.toDataSuffix({ codes: ['bc_dh0rqw67'] });
const ERC_8021_SUFFIX = ERC_8021_SUFFIX_RAW.startsWith('0x') ? ERC_8021_SUFFIX_RAW.slice(2) : ERC_8021_SUFFIX_RAW;

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

      // Build spend permission where spender = the player's own address
      const now = Math.floor(Date.now() / 1000);
      const allowanceEth = permissionParams?.allowanceEth || '1';
      const durationDays = permissionParams?.durationDays || 30;
      const allowanceWei = BigInt(Math.floor(parseFloat(allowanceEth) * 1e18)).toString();

      console.log('[self-pay] Spend permission config:', { allowanceEth, durationDays, spender: primaryAddr });

      const permission: SpendPermission = {
        account: primaryAddr,
        spender: primaryAddr, // Player is their own spender
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
      setPermissionApproved(false);
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
    setPermissionApproved(false);
  }, []);

  // Each move: user's wallet calls approveWithSignature (once) then spend() on SpendPermissionManager
  const sendTransaction = useCallback(
    async (valueWei: bigint): Promise<string> => {
      if (!provider || !address || !spendPermission || !spendSignature) {
        throw new Error('Wallet not connected or spend permission not signed');
      }

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

      // First call: approve the permission on-chain if not yet done
      if (!permissionApproved) {
        console.log('[self-pay] Approving spend permission on-chain...');
        const approveData = encodeFunctionData({
          abi: spendPermissionManagerAbi,
          functionName: 'approveWithSignature',
          args: [permissionTuple, spendSignature as `0x${string}`],
        });
        const approveDataWithAttribution = (approveData + ERC_8021_SUFFIX) as `0x${string}`;

        const approveHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: address,
            to: SPEND_PERMISSION_MANAGER,
            data: approveDataWithAttribution,
          }],
        });
        console.log('[self-pay] ✅ approveWithSignature tx:', approveHash);
        setPermissionApproved(true);
      }

      // Call spend() — user pays gas, builder code in calldata
      const spendData = encodeFunctionData({
        abi: spendPermissionManagerAbi,
        functionName: 'spend',
        args: [permissionTuple, valueWei],
      });
      const spendDataWithAttribution = (spendData + ERC_8021_SUFFIX) as `0x${string}`;

      console.log('[self-pay] Sending spend() tx...', { value: valueWei.toString() });

      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: SPEND_PERMISSION_MANAGER,
          data: spendDataWithAttribution,
        }],
      });

      console.log('[self-pay] ✅ spend tx:', txHash);
      return txHash as string;
    },
    [provider, address, spendPermission, spendSignature, permissionApproved]
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
