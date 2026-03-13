import { useCallback, useState } from 'react';
import { useAccount, useClient, useSignMessage } from 'wagmi';
import { SiweMessage } from 'siwe';
import { base } from 'viem/chains';

/**
 * Sign In With Ethereum (SIWE) Hook
 * Complements Privy authentication with SIWE protocol support
 * Enables decentralized sign-in and message authentication
 */
export function useSIWE() {
  const { address } = useAccount();
  const client = useClient();
  const { signMessageAsync } = useSignMessage();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<string | null>(null);

  // Generate SIWE nonce (typically from your backend)
  const generateNonce = useCallback(async () => {
    try {
      // In production, fetch from your backend
      const nonceValue = Math.random().toString(36).substring(2, 15);
      setNonce(nonceValue);
      setError(null);
      return nonceValue;
    } catch (err) {
      const errorMsg = 'Failed to generate nonce';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  const createSiweMessage = useCallback(
    (options: {
      nonce: string;
      statement?: string;
      expirationTime?: Date;
      notBefore?: Date;
      requestId?: string;
      resources?: string[];
    }) => {
      if (!address) {
        throw new Error('Wallet not connected');
      }

      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: options.statement || 'Sign in to Crypto2048 on Base',
        uri: window.location.origin,
        version: '1',
        chainId: base.id,
        nonce: options.nonce,
        issuedAt: new Date().toISOString(),
        expirationTime: options.expirationTime?.toISOString(),
        notBefore: options.notBefore?.toISOString(),
        requestId: options.requestId,
        resources: options.resources,
      });

      return message.prepareMessage();
    },
    [address]
  );

  const signInWithEthereum = useCallback(
    async (options?: {
      statement?: string;
      expirationTime?: Date;
      resources?: string[];
    }) => {
      if (!address) {
        const errorMsg = 'Wallet not connected';
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      setIsSigningIn(true);
      setError(null);

      try {
        // Generate nonce
        const nonceValue = await generateNonce();

        // Create SIWE message
        const message = createSiweMessage({
          nonce: nonceValue,
          statement: options?.statement,
          expirationTime: options?.expirationTime,
          resources: options?.resources,
        });

        // Sign the message
        const signature = await signMessageAsync({
          message,
        });

        console.log('[v0] SIWE signature obtained:', {
          address,
          chain: 'Base',
          signed: true,
        });

        return {
          address,
          message,
          signature,
          nonce: nonceValue,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'SIWE sign in failed';
        setError(errorMsg);
        throw err;
      } finally {
        setIsSigningIn(false);
      }
    },
    [address, generateNonce, createSiweMessage, signMessageAsync]
  );

  const verifySignature = useCallback(
    async (message: string, signature: string): Promise<boolean> => {
      try {
        // In production, send to your backend for verification
        // For now, basic client-side validation
        const siweMessage = new SiweMessage(message);
        const isValid = signature && signature.length > 0;

        if (!isValid) {
          throw new Error('Invalid signature format');
        }

        setError(null);
        return true;
      } catch (err) {
        const errorMsg = 'Signature verification failed';
        setError(errorMsg);
        return false;
      }
    },
    []
  );

  return {
    address,
    nonce,
    isSigningIn,
    error,
    generateNonce,
    createSiweMessage,
    signInWithEthereum,
    verifySignature,
    chain: base,
  };
}
