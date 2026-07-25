import { useState, useEffect, useCallback } from 'react';
import { ArrowLeftRight, ArrowDownUp, Loader2, ExternalLink, ChevronDown } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

// ─── Token registry ───────────────────────────────────────────────────────────
const WETH_ADDRESS  = '0x4200000000000000000000000000000000000006' as const;

const TOKENS = {
  '2048': {
    symbol: '2048',
    address: '0xa27567af20caff5747869a493c8a6a7444b20f9c' as `0x${string}`,
    decimals: 18,
  },
  B20: {
    symbol: 'B20',
    address: '0xb200000000000000000000ae0575aaf8de90b28d' as `0x${string}`,
    decimals: 18,
  },
  USDC: {
    symbol: 'USDC',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
    decimals: 6,
  },
} as const;

type TokenKey = keyof typeof TOKENS;
const TOKEN_KEYS = Object.keys(TOKENS) as TokenKey[];

// ─── Infrastructure ───────────────────────────────────────────────────────────
const UNISWAP_V3_QUOTER = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as const;
const UNISWAP_V3_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481' as const;

const BASE_RPC_URLS = [
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
  'https://1rpc.io/base',
  'https://base.drpc.org',
] as const;

const POOL_FEES = [10000, 3000, 500, 100] as const;

// ─── ABIs ─────────────────────────────────────────────────────────────────────
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

// ─── Props ────────────────────────────────────────────────────────────────────
interface SwapModalProps {
  walletAddress?: string;
  onSwapSuccess?: () => void;
  sendTransaction: (params: { to: string; value?: bigint; data?: string; chainId?: number }, options?: any) => Promise<any>;
  embeddedWalletAddress?: string;
}

// ─── Token picker component ───────────────────────────────────────────────────
function TokenPicker({
  value,
  onChange,
  disabled,
  exclude,
}: {
  value: TokenKey;
  onChange: (t: TokenKey) => void;
  disabled?: boolean;
  exclude?: TokenKey;
}) {
  const options = TOKEN_KEYS.filter((k) => k !== exclude);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="flex items-center gap-1 h-8 px-3 font-semibold text-foreground border-border/60 hover:border-primary/60 min-w-[72px]"
        >
          {value}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[120px]">
        {options.map((key) => (
          <DropdownMenuItem
            key={key}
            onSelect={() => onChange(key)}
            className="flex items-center justify-between gap-4 cursor-pointer"
          >
            <span className="font-semibold">{TOKENS[key].symbol}</span>
            <span className="text-xs text-muted-foreground truncate max-w-[80px]">
              {TOKENS[key].address.slice(0, 6)}…
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function SwapModal({ walletAddress, onSwapSuccess, sendTransaction, embeddedWalletAddress }: SwapModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  // "from" is always ETH; "to" is the selected token (or vice-versa when flipped)
  const [selectedToken, setSelectedToken] = useState<TokenKey>('2048');
  const [isBuyMode, setIsBuyMode] = useState(true); // true = ETH -> token, false = token -> ETH

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
  const token = TOKENS[selectedToken];

  const createClientWithFallback = useCallback(async (): Promise<any> => {
    const { createPublicClient, http, fallback } = await import('viem');
    const transports = BASE_RPC_URLS.map(url => http(url, { timeout: 10000, retryCount: 1 }));
    return createPublicClient({ chain: base, transport: fallback(transports) });
  }, []);

  // ── Balances ────────────────────────────────────────────────────────────────
  const fetchBalances = useCallback(async () => {
    if (!activeAddress) return;
    try {
      const client = await createClientWithFallback();

      const [ethBal, tokenBal, allowance] = await Promise.all([
        client.getBalance({ address: activeAddress }),
        client.readContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [activeAddress],
        } as any),
        client.readContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [activeAddress, UNISWAP_V3_ROUTER],
        } as any),
      ]);

      setEthBalance(formatEther(ethBal));
      setTokenBalance(tokenBal as bigint);

      if (!isBuyMode && inputAmount) {
        try {
          const amountIn = parseUnits(inputAmount, token.decimals);
          setNeedsApproval((allowance as bigint) < amountIn);
        } catch {
          setNeedsApproval(false);
        }
      } else {
        setNeedsApproval(false);
      }
    } catch (error) {
      console.error('[SwapModal] Balance fetch error:', error);
    }
  }, [activeAddress, isBuyMode, inputAmount, token, createClientWithFallback]);

  useEffect(() => {
    if (isOpen) {
      fetchBalances();
      const interval = setInterval(fetchBalances, 10000);
      return () => clearInterval(interval);
    }
  }, [isOpen, fetchBalances]);

  useEffect(() => {
    if (!isBuyMode && inputAmount && isOpen) {
      fetchBalances();
    }
  }, [inputAmount, isBuyMode, isOpen]);

  // Reset amounts when token or direction changes
  useEffect(() => {
    setInputAmount('');
    setOutputAmount('');
  }, [selectedToken, isBuyMode]);

  // ── Quoting ─────────────────────────────────────────────────────────────────
  const getQuote = useCallback(async (amount: string) => {
    if (!amount || parseFloat(amount) === 0) {
      setOutputAmount('');
      return;
    }
    setIsQuoting(true);
    try {
      const tokenIn  = isBuyMode ? WETH_ADDRESS : token.address;
      const tokenOut = isBuyMode ? token.address : WETH_ADDRESS;
      const decimalsIn  = isBuyMode ? 18 : token.decimals;
      const decimalsOut = isBuyMode ? token.decimals : 18;
      const amountIn = parseUnits(amount, decimalsIn);

      const { createPublicClient, http, encodeFunctionData: encodeData, decodeFunctionResult } = await import('viem');

      const tryQuoteWithRpc = async (rpcUrl: string): Promise<{ output: bigint; fee: number } | null> => {
        const client = createPublicClient({ chain: base, transport: http(rpcUrl, { timeout: 10000, retryCount: 1 }) });

        let bestOutput = BigInt(0);
        let foundFee: number = POOL_FEES[0];

        const quotePromises = POOL_FEES.map(async (fee) => {
          try {
            const callData = encodeData({
              abi: QUOTER_ABI,
              functionName: 'quoteExactInputSingle',
              args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: BigInt(0) }],
            });
            const result = await client.call({ to: UNISWAP_V3_QUOTER, data: callData });
            if (result.data && result.data !== '0x') {
              const decoded = decodeFunctionResult({ abi: QUOTER_ABI, functionName: 'quoteExactInputSingle', data: result.data });
              return { fee, output: decoded[0] as bigint };
            }
            return null;
          } catch { return null; }
        });

        const results = await Promise.all(quotePromises);
        for (const r of results) {
          if (r && r.output > bestOutput) { bestOutput = r.output; foundFee = r.fee; }
        }
        return bestOutput > BigInt(0) ? { output: bestOutput, fee: foundFee } : null;
      };

      let quoteResult: { output: bigint; fee: number } | null = null;
      for (const rpcUrl of BASE_RPC_URLS) {
        try {
          quoteResult = await tryQuoteWithRpc(rpcUrl);
          if (quoteResult) break;
        } catch { continue; }
      }

      if (quoteResult && quoteResult.output > BigInt(0)) {
        setOutputAmount(formatUnits(quoteResult.output, decimalsOut));
        setBestFee(quoteResult.fee);
      } else {
        setOutputAmount('');
      }
    } catch (error) {
      console.error('[SwapModal] Quote error:', error);
      setOutputAmount('');
    } finally {
      setIsQuoting(false);
    }
  }, [isBuyMode, token]);

  useEffect(() => {
    const timer = setTimeout(() => { getQuote(inputAmount); }, 500);
    return () => clearTimeout(timer);
  }, [inputAmount, getQuote]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const extractTxHash = (result: any): string => {
    if (typeof result === 'string') return result;
    return result?.hash || result?.transactionHash || '';
  };

  // ── Approve ─────────────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!activeAddress) return;
    setIsLoading(true);
    try {
      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP_V3_ROUTER, parseUnits('1000000000', token.decimals)],
      });

      const result = await sendTransaction(
        { to: token.address, data, chainId: 8453 },
        { address: embeddedWalletAddress || activeAddress, sponsor: false, uiOptions: { showWalletUIs: false } }
      );

      const hash = extractTxHash(result);
      if (hash) {
        toast.success('Approval sent! Waiting for confirmation...');
        const client = await createClientWithFallback();
        await client.waitForTransactionReceipt({ hash: hash as `0x${string}` });
        toast.success('Approval confirmed!');
        await fetchBalances();
      }
    } catch (error: any) {
      const reason = error?.shortMessage || error?.details || error?.message || 'Unknown error';
      toast.error(`Approval failed: ${reason}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Swap ────────────────────────────────────────────────────────────────────
  const handleSwap = async () => {
    if (!activeAddress || !inputAmount) return;
    setIsLoading(true);

    try {
      const decimalsIn  = isBuyMode ? 18 : token.decimals;
      const decimalsOut = isBuyMode ? token.decimals : 18;
      const amountIn = parseUnits(inputAmount, decimalsIn);

      let minOut = BigInt(0);
      if (outputAmount) {
        const quotedOut = parseUnits(outputAmount, decimalsOut);
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
            tokenOut: token.address,
            fee: bestFee,
            recipient: activeAddress,
            amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: BigInt(0),
          }],
        });
        calldata = encodeFunctionData({ abi: SWAP_ROUTER_ABI, functionName: 'multicall', args: [deadline, [swapData]] });
        value = amountIn;
      } else {
        // Token -> ETH
        const swapData = encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [{
            tokenIn: token.address,
            tokenOut: WETH_ADDRESS,
            fee: bestFee,
            recipient: UNISWAP_V3_ROUTER,
            amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: BigInt(0),
          }],
        });
        const unwrapData = encodeFunctionData({ abi: SWAP_ROUTER_ABI, functionName: 'unwrapWETH9', args: [minOut, activeAddress] });
        calldata = encodeFunctionData({ abi: SWAP_ROUTER_ABI, functionName: 'multicall', args: [deadline, [swapData, unwrapData]] });
      }

      const result = await sendTransaction(
        { to: UNISWAP_V3_ROUTER, data: calldata, value, chainId: 8453 },
        { address: embeddedWalletAddress || activeAddress, sponsor: false, uiOptions: { showWalletUIs: false } }
      );

      const hash = extractTxHash(result);
      if (hash) {
        setLastTxHash(hash);
        toast.success('Swap sent! Waiting for confirmation...');
        const client = await createClientWithFallback();
        await client.waitForTransactionReceipt({ hash: hash as `0x${string}` });
        toast.success('Swap completed!');
        setInputAmount('');
        setOutputAmount('');
        await fetchBalances();
        onSwapSuccess?.();
      }
    } catch (error: any) {
      const reason = error?.shortMessage || error?.details || error?.message || 'Unknown error';
      toast.error(`Swap failed: ${reason}`);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDirection = () => {
    setIsBuyMode(!isBuyMode);
  };

  const setMaxAmount = () => {
    if (isBuyMode) {
      const maxEth = Math.max(0, parseFloat(ethBalance) * 0.9);
      setInputAmount(maxEth > 0 ? maxEth.toFixed(6) : '0');
    } else {
      const maxTokens = (tokenBalance * BigInt(90)) / BigInt(100);
      setInputAmount(formatUnits(maxTokens, token.decimals));
    }
  };

  const inputTokenLabel  = isBuyMode ? 'ETH' : token.symbol;
  const outputTokenLabel = isBuyMode ? token.symbol : 'ETH';
  const inputBalanceDisplay = isBuyMode ? ethBalance : formatUnits(tokenBalance, token.decimals);

  const hasInsufficientBalance = (() => {
    if (!inputAmount || parseFloat(inputAmount) === 0) return false;
    try {
      return parseFloat(inputAmount) > parseFloat(inputBalanceDisplay);
    } catch { return false; }
  })();

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed right-2 top-1/2 -translate-y-1/2 z-50 h-10 w-10 rounded-full border-2 border-primary/50 bg-background/95 backdrop-blur-sm shadow-lg hover:bg-primary/10 hover:border-primary transition-all duration-300 hover:scale-110"
          title="Trade Tokens"
        >
          <ArrowLeftRight className="h-4 w-4 text-primary" />
          <span className="sr-only">Trade Token</span>
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:max-w-md bg-background/95 backdrop-blur-md border-l border-border/50 overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border/50">
          <SheetTitle className="flex items-center gap-2 text-xl font-display gradient-text">
            <ArrowLeftRight className="h-5 w-5" />
            Swap Tokens
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6">
          {!activeAddress ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground font-body">Please connect your wallet to trade</p>
            </div>
          ) : (
            <div className="space-y-4">

              {/* Token selector */}
              <div className="flex items-center justify-between bg-card/40 rounded-xl px-4 py-3 border border-border/50">
                <span className="text-sm text-muted-foreground">Select token</span>
                <div className="flex gap-2">
                  {TOKEN_KEYS.map((key) => (
                    <button
                      key={key}
                      onClick={() => setSelectedToken(key)}
                      disabled={isLoading}
                      className={`px-3 py-1 rounded-lg text-sm font-semibold transition-all border ${
                        selectedToken === key
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-transparent text-muted-foreground border-border/50 hover:border-primary/50 hover:text-foreground'
                      }`}
                    >
                      {TOKENS[key].symbol}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Section */}
              <div className="bg-card/50 rounded-xl p-4 border border-border/50 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">You pay</span>
                  <span className="text-xs text-muted-foreground">
                    Balance: {parseFloat(inputBalanceDisplay).toFixed(4)} {inputTokenLabel}
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
                    <span className="font-semibold text-foreground">{inputTokenLabel}</span>
                  </div>
                </div>
              </div>

              {/* Toggle Direction */}
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
                      <span className={outputAmount ? 'text-foreground' : 'text-muted-foreground'}>
                        {outputAmount || '0.0'}
                      </span>
                    )}
                  </div>
                  <span className="font-semibold text-foreground">{outputTokenLabel}</span>
                </div>
              </div>

              {/* Slippage */}
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

              {/* Insufficient Balance Warning */}
              {hasInsufficientBalance && (
                <div className="text-sm text-destructive text-center font-medium">
                  Insufficient {inputTokenLabel} balance
                </div>
              )}

              {/* Action Button */}
              {needsApproval ? (
                <Button
                  onClick={handleApprove}
                  disabled={isLoading || !inputAmount || hasInsufficientBalance}
                  className="w-full h-12 text-base font-semibold"
                >
                  {isLoading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Approving...</>
                  ) : (
                    `Approve ${token.symbol}`
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleSwap}
                  disabled={isLoading || !inputAmount || !outputAmount || hasInsufficientBalance}
                  className="w-full h-12 text-base font-semibold"
                >
                  {isLoading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Swapping...</>
                  ) : hasInsufficientBalance ? (
                    `Insufficient ${inputTokenLabel} balance`
                  ) : (
                    `Swap ${inputTokenLabel} → ${outputTokenLabel}`
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

            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
