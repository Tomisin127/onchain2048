import { useCallback, useState } from 'react';
import { useAccount, useClient } from 'wagmi';
import { publicActions } from 'viem';
import { getEntryPointAddress } from 'permissionless';
import { pimlicoBundlerActions } from 'permissionless/actions/pimlico';
import { base } from 'viem/chains';

/**
 * ERC-4337 (Account Abstraction) Hook
 * Enables smart account functionality including:
 * - Batch transactions
 * - Sponsored transactions (with Paymaster)
 * - Custom validation logic
 */
export function useERC4337() {
  const { address } = useAccount();
  const client = useClient();
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkERC4337Support = useCallback(async () => {
    if (!client || !address) {
      setIsSupported(false);
      return false;
    }

    try {
      // Check if EntryPoint contract is accessible on Base
      const entryPointAddress = getEntryPointAddress('0.7.0');
      const publicClient = client.extend(publicActions);
      
      const code = await publicClient.getCode({
        address: entryPointAddress,
        blockTag: 'latest',
      });

      const supported = code && code !== '0x';
      setIsSupported(supported);
      setError(null);
      return supported;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check ERC-4337 support');
      setIsSupported(false);
      return false;
    }
  }, [client, address]);

  const getPimlicoBundlerClient = useCallback(() => {
    if (!client) {
      throw new Error('Wagmi client not available');
    }

    return client.extend(pimlicoBundlerActions('v2'));
  }, [client]);

  const estimateGasForUserOp = useCallback(async (userOp: any) => {
    try {
      const bundler = getPimlicoBundlerClient();
      const estimation = await bundler.estimateUserOperationGas({
        userOperation: userOp,
        entryPoint: getEntryPointAddress('0.7.0'),
      });
      return estimation;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Gas estimation failed';
      setError(errorMsg);
      throw err;
    }
  }, [getPimlicoBundlerClient]);

  return {
    address,
    isSupported,
    error,
    checkERC4337Support,
    estimateGasForUserOp,
    bundlerClient: getPimlicoBundlerClient(),
    chain: base,
  };
}
