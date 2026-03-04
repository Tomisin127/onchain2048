import { useState, useEffect, useCallback } from 'react';
import { ArrowLeftRight, ArrowDownUp, Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSimulateContract } from 'wagmi';
import { parseEther, formatEther, parseUnits, formatUnits, encodeFunctionData } from 'viem';
import { base } from 'wagmi/chains';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { toast } from 'sonner';

// Contract addresses on Base Mainnet
const TOKEN_ADDRESS = '0xa27567af20caff5747869a493c8a6a7444b20f9c' as const;
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as const;
const UNISWAP_V3_QUOTER = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as const;
const UNISWAP_V3_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481' as const;

// Pool fee tier (0.3% = 3000, 1% = 10000)
const POOL_FEE = 10000;

// ABIs
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

const QUOTER_ABI = [
  {
    name: 'quoteExactInputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const;

const SWAP_ROUTER_ABI = [
  {
    name: 'exactInputSingle',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  {
    name: 'multicall',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'deadline', type: 'uint256' },
      { name: 'data', type: 'bytes[]' },
    ],
    outputs: [{ name: 'results', type: 'bytes[]' }],
  },
  {
    name: 'unwrapWETH9',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountMinimum', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [],
  },
] as const;

interface SwapModalProps {
  walletAddress?: string;
  onSwapSuccess?: () => void;
}

export function SwapModal({ walletAddress, onSwapSuccess }: SwapModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isBuyMode, setIsBuyMode] = useState(true); // true = ETH -> Token, false = Token -> ETH
  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('');
  const [isQuoting, setIsQuoting] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [slippage, setSlippage] = useState(5); // 5% default slippage

  const { address: wagmiAddress, isConnected } = useAccount();
  
  // Use the passed walletAddress (which includes Privy embedded wallet) or fall back to wagmi
  const activeAddress = (walletAddress || wagmiAddress) as `0x${string}` | undefined;
  
  // ETH balance
  const { data: ethBalance } = useBalance({
    address: activeAddress,
  });

  // Token balance
  const { data: tokenBalance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  });

  // Token allowance
  const { data: tokenAllowance, refetch: refetchAllowance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, UNISWAP_V3_ROUTER] : undefined,
  });

  // Approve transaction
  const { writeContract: approve, data: approveHash, isPending: isApproving } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  // Swap transaction
  const { writeContract: swap, data: swapHash, isPending: isSwapping } = useWriteContract();
  const { isLoading: isSwapConfirming, isSuccess: isSwapSuccess } = useWaitForTransactionReceipt({
    hash: swapHash,
  });

  // Check if approval is needed when selling tokens
  useEffect(() => {
    if (!isBuyMode && inputAmount && tokenAllowance !== undefined) {
      try {
        const amountIn = parseUnits(inputAmount || '0', 18);
        setNeedsApproval(tokenAllowance < amountIn);
      } catch {
        setNeedsApproval(false);
      }
    } else {
      setNeedsApproval(false);
    }
  }, [isBuyMode, inputAmount, tokenAllowance]);

  // Handle approval success
  useEffect(() => {
    if (isApproveSuccess) {
      toast.success('Approval confirmed!');
      refetchAllowance();
    }
  }, [isApproveSuccess, refetchAllowance]);

  // Handle swap success
  useEffect(() => {
    if (isSwapSuccess) {
      toast.success('Swap completed successfully!');
      setInputAmount('');
      setOutputAmount('');
      onSwapSuccess?.();
    }
  }, [isSwapSuccess, onSwapSuccess]);

  // Get real on-chain quote from Uniswap V3 Quoter
  const getQuote = useCallback(async (amount: string) => {
    if (!amount || parseFloat(amount) === 0) {
      setOutputAmount('');
      return;
    }

    setIsQuoting(true);
    try {
      const amountIn = isBuyMode
        ? parseEther(amount)
        : parseUnits(amount, 18);

      const tokenIn = isBuyMode ? WETH_ADDRESS : TOKEN_ADDRESS;
      const tokenOut = isBuyMode ? TOKEN_ADDRESS : WETH_ADDRESS;

      const { createPublicClient, http } = await import('viem');
      const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });

      const result = await client.simulateContract({
        address: UNISWAP_V3_QUOTER,
        abi: QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{
          tokenIn,
          tokenOut,
          amountIn,
          fee: POOL_FEE,
          sqrtPriceLimitX96: BigInt(0),
        }],
      });

      const amountOut = result.result[0];
      const formatted = formatUnits(amountOut, 18);
      setOutputAmount(formatted);
    } catch (error) {
      console.error('Quote error:', error);
      setOutputAmount('');
      toast.error('Could not fetch quote. The pool may lack liquidity for this amount.');
    } finally {
      setIsQuoting(false);
    }
  }, [isBuyMode]);

  // Debounced quote
  useEffect(() => {
    const timer = setTimeout(() => {
      getQuote(inputAmount);
    }, 500);
    return () => clearTimeout(timer);
  }, [inputAmount, getQuote]);

  const handleApprove = () => {
    if (!address) return;
    
    approve({
      address: TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [UNISWAP_V3_ROUTER, parseUnits('1000000000', 18)],
      account: address,
      chain: base,
    });
  };

  const handleSwap = () => {
    if (!address || !inputAmount) return;

    try {
      const amountIn = isBuyMode 
        ? parseEther(inputAmount)
        : parseUnits(inputAmount, 18);
      
      // Apply slippage to the quoted output amount
      let minOut = BigInt(0);
      if (outputAmount) {
        const quotedOut = parseUnits(outputAmount, 18);
        minOut = quotedOut * BigInt(100 - slippage) / BigInt(100);
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

      if (isBuyMode) {
        // ETH -> Token: Use exactInputSingle with ETH value
        const swapData = encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [{
            tokenIn: WETH_ADDRESS,
            tokenOut: TOKEN_ADDRESS,
            fee: POOL_FEE,
            recipient: address,
            amountIn: amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: BigInt(0),
          }],
        });

        swap({
          address: UNISWAP_V3_ROUTER,
          abi: SWAP_ROUTER_ABI,
          functionName: 'multicall',
          args: [deadline, [swapData]],
          value: amountIn,
          account: address,
          chain: base,
        });
      } else {
        // Token -> ETH: exactInputSingle then unwrapWETH9
        const swapData = encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [{
            tokenIn: TOKEN_ADDRESS,
            tokenOut: WETH_ADDRESS,
            fee: POOL_FEE,
            recipient: UNISWAP_V3_ROUTER, // Send to router for unwrap
            amountIn: amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: BigInt(0),
          }],
        });

        const unwrapData = encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: 'unwrapWETH9',
          args: [minOut, address],
        });

        swap({
          address: UNISWAP_V3_ROUTER,
          abi: SWAP_ROUTER_ABI,
          functionName: 'multicall',
          args: [deadline, [swapData, unwrapData]],
          account: address,
          chain: base,
        });
      }
    } catch (error) {
      console.error('Swap error:', error);
      toast.error('Failed to initiate swap');
    }
  };

  const toggleDirection = () => {
    setIsBuyMode(!isBuyMode);
    setInputAmount('');
    setOutputAmount('');
  };

  const setMaxAmount = () => {
    if (isBuyMode && ethBalance) {
      // Leave some ETH for gas
      const maxEth = Math.max(0, parseFloat(formatEther(ethBalance.value)) - 0.001);
      setInputAmount(maxEth.toFixed(6));
    } else if (!isBuyMode && tokenBalance) {
      setInputAmount(formatUnits(tokenBalance, 18));
    }
  };

  const isLoading = isApproving || isApproveConfirming || isSwapping || isSwapConfirming;
  const inputToken = isBuyMode ? 'ETH' : '2048';
  const outputToken = isBuyMode ? '2048' : 'ETH';
  const inputBalance = isBuyMode 
    ? (ethBalance ? formatEther(ethBalance.value) : '0')
    : (tokenBalance ? formatUnits(tokenBalance, 18) : '0');

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed right-4 top-1/2 -translate-y-1/2 z-50 h-14 w-14 rounded-full border-2 border-primary/50 bg-background/95 backdrop-blur-sm shadow-lg hover:bg-primary/10 hover:border-primary transition-all duration-300 hover:scale-110"
          title="Trade 2048 Token"
        >
          <ArrowLeftRight className="h-6 w-6 text-primary" />
          <span className="sr-only">Trade Token</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md bg-background/95 backdrop-blur-md border-l border-border/50 overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border/50">
          <SheetTitle className="flex items-center gap-2 text-xl font-display gradient-text">
            <ArrowLeftRight className="h-5 w-5" />
            Trade 2048 Coin
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6">
          {!isConnected || !address ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground font-body">
                Please connect your wallet to trade
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground font-body text-center">
                {isBuyMode 
                  ? 'Buy 2048 tokens with ETH to power your gameplay'
                  : 'Sell your 2048 tokens back to ETH'}
              </p>

              {/* Input Section */}
              <div className="bg-card/50 rounded-xl p-4 border border-border/50 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">You pay</span>
                  <span className="text-xs text-muted-foreground">
                    Balance: {parseFloat(inputBalance).toFixed(4)} {inputToken}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="0.0"
                    value={inputAmount}
                    onChange={(e) => setInputAmount(e.target.value)}
                    className="flex-1 text-lg font-mono bg-transparent border-none focus-visible:ring-0 p-0 h-auto"
                    disabled={isLoading}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={setMaxAmount}
                      className="text-xs text-primary hover:text-primary/80"
                      disabled={isLoading}
                    >
                      MAX
                    </Button>
                    <span className="font-semibold text-foreground">{inputToken}</span>
                  </div>
                </div>
              </div>

              {/* Toggle Button */}
              <div className="flex justify-center -my-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={toggleDirection}
                  disabled={isLoading}
                  className="rounded-full h-10 w-10 border-2 border-border bg-background hover:bg-primary/10 hover:border-primary transition-all"
                >
                  <ArrowDownUp className="h-4 w-4" />
                </Button>
              </div>

              {/* Output Section */}
              <div className="bg-card/50 rounded-xl p-4 border border-border/50 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">You receive</span>
                </div>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 text-lg font-mono">
                    {isQuoting ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      outputAmount || '0.0'
                    )}
                  </div>
                  <span className="font-semibold text-foreground">{outputToken}</span>
                </div>
              </div>

              {/* Slippage Setting */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Max slippage</span>
                <div className="flex gap-1">
                  {[1, 3, 5].map((s) => (
                    <Button
                      key={s}
                      variant={slippage === s ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSlippage(s)}
                      className="h-7 px-2 text-xs"
                      disabled={isLoading}
                    >
                      {s}%
                    </Button>
                  ))}
                </div>
              </div>

              {/* Warning for low liquidity */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-yellow-500/90">
                  This swap uses Uniswap V3 on Base. Ensure sufficient liquidity exists for the token pair. Large trades may have significant price impact.
                </p>
              </div>

              {/* Action Buttons */}
              {needsApproval ? (
                <Button
                  onClick={handleApprove}
                  disabled={isLoading || !inputAmount}
                  className="w-full h-12 text-base font-semibold"
                >
                  {isApproving || isApproveConfirming ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Approving...
                    </>
                  ) : (
                    'Approve 2048 Token'
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleSwap}
                  disabled={isLoading || !inputAmount || !outputAmount}
                  className="w-full h-12 text-base font-semibold"
                >
                  {isSwapping || isSwapConfirming ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Swapping...
                    </>
                  ) : (
                    `Swap ${inputToken} for ${outputToken}`
                  )}
                </Button>
              )}

              {/* Transaction Link */}
              {swapHash && (
                <a
                  href={`https://basescan.org/tx/${swapHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 text-xs text-primary hover:underline"
                >
                  View transaction <ExternalLink className="h-3 w-3" />
                </a>
              )}

              {/* Info Footer */}
              <div className="text-xs text-muted-foreground/70 text-center space-y-1 font-mono pt-4 border-t border-border/30">
                <p>Token: {TOKEN_ADDRESS.slice(0, 6)}...{TOKEN_ADDRESS.slice(-4)}</p>
                <p>Network: Base Mainnet</p>
                <p>DEX: Uniswap V3</p>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
