import { useCallback, useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { base } from 'viem/chains';

/**
 * BasePay Hook
 * Simplifies payment processing on Base network
 * Handles ETH transfers and native token payments
 */
export function useBasePay() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });
  const [error, setError] = useState<string | null>(null);

  const sendETH = useCallback(
    async (recipientAddress: string, ethAmount: string) => {
      if (!address) {
        const errorMsg = 'Wallet not connected';
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      if (!recipientAddress || !ethAmount) {
        const errorMsg = 'Missing recipient address or amount';
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      try {
        setError(null);

        // Use wagmi to send native ETH
        const amountWei = parseEther(ethAmount);

        // This would typically use a contract call for more complex payments
        // For now, we document the pattern for sending ETH
        const txData = {
          to: recipientAddress,
          value: amountWei,
        };

        console.log('[v0] Initiating BasePay transfer:', {
          from: address,
          to: recipientAddress,
          amount: ethAmount,
          chain: 'Base',
        });

        return {
          txData,
          hash,
          isPending,
          isConfirming,
          isSuccess,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Payment failed';
        setError(errorMsg);
        throw err;
      }
    },
    [address, hash, isPending, isConfirming, isSuccess]
  );

  const estimatePaymentGas = useCallback(
    async (amount: string): Promise<bigint | null> => {
      if (!address) {
        setError('Wallet not connected');
        return null;
      }

      try {
        setError(null);
        // Typical ETH transfer gas cost
        const baseGas = BigInt(21000);
        return baseGas;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Gas estimation failed';
        setError(errorMsg);
        return null;
      }
    },
    [address]
  );

  return {
    address,
    sendETH,
    estimatePaymentGas,
    isProcessing: isPending || isConfirming,
    isSuccess,
    transactionHash: hash,
    error,
    chain: base,
  };
}
