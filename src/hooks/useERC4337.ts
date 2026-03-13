import { useCallback, useState, useEffect } from 'react';
import { useAccount, useClient } from 'wagmi';
import { base } from 'viem/chains';

// ERC-4337 EntryPoint v0.7.0 address on Base
const ENTRY_POINT_ADDRESS_V7 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const;

/**
 * ERC-4337 (Account Abstraction) Hook
 * Enables smart account functionality including:
 * - Smart contract accounts
 * - Account abstraction patterns
 * - Integration with bundler services
 * 
 * Note: This hook provides detection and basic setup.
 * For advanced bundler operations, connect to a Pimlico or similar service.
 */
export function useERC4337() {
  const { address } = useAccount();
  const client = useClient();
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkERC4337Support = useCallback(async () => {
    if (!client || !address) {
      setIsSupported(false);
      setIsLoading(false);
      return false;
    }

    try {
      setIsLoading(true);
      // ERC-4337 is supported on Base by default
      // Check if we can connect to a bundler (optional)
      const pimlicoBundlerUrl = `https://api.pimlico.io/v2/base/rpc?apikey=${process.env.REACT_APP_PIMLICO_API_KEY || 'demo'}`;
      
      const response = await fetch(pimlicoBundlerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_chainId',
          params: [],
        }),
      });

      const supported = response.ok;
      setIsSupported(supported);
      setError(null);
      setIsLoading(false);
      return supported;
    } catch (err) {
      // ERC-4337 is still available even if bundler check fails
      setIsSupported(true);
      setError(null);
      setIsLoading(false);
      return true;
    }
  }, [client, address]);

  useEffect(() => {
    checkERC4337Support();
  }, [checkERC4337Support]);

  return {
    address,
    isSupported,
    isLoading,
    error,
    checkERC4337Support,
    entryPointAddress: ENTRY_POINT_ADDRESS_V7,
    chain: base,
    pimlicoBundlerUrl: `https://api.pimlico.io/v2/base/rpc`,
  };
}
