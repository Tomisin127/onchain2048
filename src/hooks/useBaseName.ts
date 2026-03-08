import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

// Base Mainnet ENS Universal Resolver
const BASE_PROVIDER = new ethers.JsonRpcProvider('https://mainnet.base.org');

export function useBaseName(address: string) {
  const [baseName, setBaseName] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setBaseName(null);
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      try {
        // Reverse-resolve address to name using Base's ENS integration
        const name = await BASE_PROVIDER.lookupAddress(address);
        if (!cancelled && name) {
          setBaseName(name);
        }
      } catch {
        // No base name registered – that's fine
      }
    };

    void resolve();
    return () => { cancelled = true; };
  }, [address]);

  const displayName = baseName || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '');

  return { baseName, displayName };
}
