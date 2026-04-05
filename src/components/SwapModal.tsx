import { useState, useEffect, useCallback } from 'react';
import { ArrowLeftRight, ArrowDownUp, Loader2, ExternalLink, AlertCircle } from 'lucide-react';
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

const POOL_FEES = [10000, 3000, 500, 100] as const;

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
  sendTransaction: (params: { to: string; value?: bigint; data?: string; chainId?: number }, options?: any) => Promise<any>;
  embeddedWalletAddress?: string;
}

export function SwapModal({ walletAddress, onSwapSuccess, sendTransaction, embeddedWalletAddress }: SwapModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isBuyMode, setIsBuyMode] = useState(true);
  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('');
  const [isQuoting, setIsQuoting] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [slippage, setSlippage] = useState(5);
  const [bestFee, setBestFee] = useState<number>(10000);
  const [isLoading, setIsLoading] = useState(false);
  const [lastTxHash, setLastTxHash] = useState('');
  const [ethBalance, setEthBalance] = useState('0');
  const [tokenBalance, setTokenBalance] = useState(BigInt(0));

  const activeAddress = walletAddress as `0x${string}` | undefined;

  // Fetch balances
  const fetchBalances = useCallback(async () => {
    if (!activeAddress) return;
    try {
      const { createPublicClient, http } = await import('viem');
      const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });

      const [ethBal, tokenBal, allowance] = await Promise.all([
        client.getBalance({ address: activeAddress }),
        client.readContract({
          address: TOKEN_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [activeAddress],
        } as any),
        client.readContract({
          address: TOKEN_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [activeAddress, UNISWAP_V3_ROUTER],
        } as any),
      ]);

      setEthBalance(formatEther(ethBal));
      setTokenBalance(tokenBal as bigint);

      // Check approval need
      if (!isBuyMode && inputAmount) {
        try {
          const amountIn = parseUnits(inputAmount, 18);
          setNeedsApproval((allowance as bigint) < amountIn);
        } catch {
          setNeedsApproval(false);
        }
      } else {
        setNeedsApproval(false);
      }
    } catch (error) {
      console.error('Balance fetch error:', error);
    }
  }, [activeAddress, isBuyMode, inputAmount]);

  useEffect(() => {
    if (isOpen) {
      fetchBalances();
      const interval = setInterval(fetchBalances, 10000);
      return () => clearInterval(interval);
    }
  }, [isOpen, fetchBalances]);

  // Re-check approval when input changes
  useEffect(() => {
    if (!isBuyMode && inputAmount && isOpen) {
      fetchBalances();
    }
  }, [inputAmount, isBuyMode, isOpen]);

  // Get quote
  const getQuote = useCallback(async (amount: string) => {
    if (!amount || parseFloat(amount) === 0) {
      setOutputAmount('');
      return;
    }
    setIsQuoting(true);
    try {
      const amountIn = isBuyMode ? parseEther(amount) : parseUnits(amount, 18);
      const tokenIn = isBuyMode ? WETH_ADDRESS : TOKEN_ADDRESS;
      const tokenOut = isBuyMode ? TOKEN_ADDRESS : WETH_ADDRESS;

      const { createPublicClient, http } = await import('viem');
      const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });

      let bestOutput = BigInt(0);
      let foundFee: number = POOL_FEES[0];

      for (const fee of POOL_FEES) {
        try {
          const result = await client.simulateContract({
            address: UNISWAP_V3_QUOTER,
            abi: QUOTER_ABI,
            functionName: 'quoteExactInputSingle',
            args: [{
              tokenIn,
              tokenOut,
              amountIn,
              fee,
              sqrtPriceLimitX96: BigInt(0),
            }],
          });
          const out = result.result[0];
          if (out > bestOutput) {
            bestOutput = out;
            foundFee = fee;
          }
        } catch {
          // This fee tier has no pool or no liquidity, skip
        }
      }

      if (bestOutput > BigInt(0)) {
        setOutputAmount(formatUnits(bestOutput, 18));
        setBestFee(foundFee);
      } else {
        setOutputAmount('');
        toast.error('No liquidity found for this pair.');
      }
    } catch (error) {
      console.error('Quote error:', error);
      setOutputAmount('');
      toast.error('Could not fetch quote.');
    } finally {
      setIsQuoting(false);
    }
  }, [isBuyMode]);

  useEffect(() => {
    const timer = setTimeout(() => { getQuote(inputAmount); }, 500);
    return () => clearTimeout(timer);
  }, [inputAmount, getQuote]);

  const extractTxHash = (result: any): string => {
    if (typeof result === 'string') return result;
    return result?.hash || result?.transactionHash || '';
  };

  const handleApprove = async () => {
    if (!activeAddress) return;
    setIsLoading(true);
    try {
      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP_V3_ROUTER, parseUnits('1000000000', 18)],
      });

      const result = await sendTransaction(
        { to: TOKEN_ADDRESS, data, chainId: 8453 },
        { address: embeddedWalletAddress || activeAddress, sponsor: false, uiOptions: { showWalletUIs: false } }
      );

      const hash = extractTxHash(result);
      if (hash) {
        toast.success('Approval sent! Waiting for confirmation...');
        // Wait for confirmation
        const { createPublicClient, http } = await import('viem');
        const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
        await client.waitForTransactionReceipt({ hash: hash as `0x${string}` });
        toast.success('Approval confirmed!');
        await fetchBalances();
      }
    } catch (error) {
      console.error('Approve error:', error);
      toast.error('Approval failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwap = async () => {
    if (!activeAddress || !inputAmount) return;
    setIsLoading(true);

    try {
      const amountIn = isBuyMode ? parseEther(inputAmount) : parseUnits(inputAmount, 18);

      let minOut = BigInt(0);
      if (outputAmount) {
        const quotedOut = parseUnits(outputAmount, 18);
        minOut = quotedOut * BigInt(100 - slippage) / BigInt(100);
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

      let calldata: `0x${string}`;
      let value: bigint = BigInt(0);

      if (isBuyMode) {
        // ETH -> Token
        const swapData = encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [{
            tokenIn: WETH_ADDRESS,
            tokenOut: TOKEN_ADDRESS,
            fee: bestFee,
            recipient: activeAddress,
            amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: BigInt(0),
          }],
        });

        calldata = encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: 'multicall',
          args: [deadline, [swapData]],
        });
        value = amountIn;
      } else {
        // Token -> ETH
        const swapData = encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [{
            tokenIn: TOKEN_ADDRESS,
            tokenOut: WETH_ADDRESS,
            fee: bestFee,
            recipient: UNISWAP_V3_ROUTER,
            amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: BigInt(0),
          }],
        });

        const unwrapData = encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: 'unwrapWETH9',
          args: [minOut, activeAddress],
        });

        calldata = encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: 'multicall',
          args: [deadline, [swapData, unwrapData]],
        });
      }

      const result = await sendTransaction(
        { to: UNISWAP_V3_ROUTER, data: calldata, value, chainId: 8453 },
        { address: embeddedWalletAddress || activeAddress, sponsor: false, uiOptions: { showWalletUIs: false } }
      );

      const hash = extractTxHash(result);
      if (hash) {
        setLastTxHash(hash);
        toast.success('Swap sent! Waiting for confirmation...');

        const { createPublicClient, http } = await import('viem');
        const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
        await client.waitForTransactionReceipt({ hash: hash as `0x${string}` });

        toast.success('Swap completed!');
        setInputAmount('');
        setOutputAmount('');
        await fetchBalances();
        onSwapSuccess?.();
      }
    } catch (error) {
      console.error('Swap error:', error);
      toast.error('Swap failed');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDirection = () => {
    setIsBuyMode(!isBuyMode);
    setInputAmount('');
    setOutputAmount('');
  };

  const setMaxAmount = () => {
    if (isBuyMode) {
      const maxEth = Math.max(0, parseFloat(ethBalance) * 0.9);
      setInputAmount(maxEth > 0 ? maxEth.toFixed(6) : '0');
    } else {
      const maxTokens = (tokenBalance * BigInt(90)) / BigInt(100);
      setInputAmount(formatUnits(maxTokens, 18));
    }
  };

  const inputToken = isBuyMode ? 'ETH' : '2048';
  const outputToken = isBuyMode ? '2048' : 'ETH';
  const inputBalanceDisplay = isBuyMode ? ethBalance : formatUnits(tokenBalance, 18);

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
          {!activeAddress ? (
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
                    Balance: {parseFloat(inputBalanceDisplay).toFixed(4)} {inputToken}
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


              {/* Action Buttons */}
              {needsApproval ? (
                <Button
                  onClick={handleApprove}
                  disabled={isLoading || !inputAmount}
                  className="w-full h-12 text-base font-semibold"
                >
                  {isLoading ? (
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
                  {isLoading ? (
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
              {lastTxHash && (
                <a
                  href={`https://basescan.org/tx/${lastTxHash}`}
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
