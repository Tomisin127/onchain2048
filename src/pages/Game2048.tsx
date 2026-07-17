import { useEffect, useState, useCallback, useRef } from 'react';
import { usePrivy, useWallets, useSendTransaction } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { useBaseSubAccount } from '@/hooks/useBaseSubAccount';
import { useSelfPayWallet } from '@/hooks/useSelfPayWallet';
import type { SpendPermissionValues } from '@/components/SpendPermissionConfig';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { GameBoard } from '@/components/GameBoard';
import { ScorePanel } from '@/components/ScorePanel';
import { WalletPanel } from '@/components/WalletPanel';
import { LoginScreen } from '@/components/LoginScreen';
import { SwapModal } from '@/components/SwapModal';
import { useGameSounds } from '@/hooks/useGameSounds';
import { use2048Game } from '@/hooks/use2048Game';
import { Direction } from '@/types/game';
import { useBaseName } from '@/hooks/useBaseName';
import {
  B20_TOKEN_ADDRESS,
  B20_MOVE_COST_WEI,
  B20_RECIPIENT,
  encodeB20MoveTransfer,
  formatB20,
} from '@/lib/b20';
import {
  ONCHAIN_2048_ADDRESS,
  ONCHAIN_2048_ABI,
  MOVE_MADE_EVENT,
  encodeMakeMove,
  encodeStartNewGame,
  encodeB20Approve,
} from '@/lib/contract';

// Contract charges a fixed 0.0001 ETH per move (moveCostETH on-chain).
const MOVE_COST_ETH = 0.0001;
const CREATOR_ADDRESS = '0xEA549e458e77Fd93bf330e5EAEf730c50d8F5249' as const;
const ERC20_BALANCE_OF_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

export default function Game2048Page() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();

  const {
    connected: isBaseConnected,
    activeAddress: baseAddress,
    disconnect: baseDisconnect,
    connect: baseConnect,
    isConnecting: isBaseConnecting,
    error: baseWalletError,
    sendTransaction: baseSendTx,
  } = useBaseSubAccount();

  const {
    activeAddress: selfPayAddress,
    connected: isSelfPayConnected,
    isConnecting: isSelfPayConnecting,
    error: selfPayError,
    connect: selfPayConnect,
    disconnect: selfPayDisconnect,
    sendTransaction: selfPaySendTx,
    sendArbitraryTransaction: selfPaySendArbitraryTx,
    mode: selfPayMode,
  } = useSelfPayWallet();

  const {
    tiles,
    score,
    highScore,
    gameOver,
    makeMove: gameMakeMove,
    initGame,
  } = use2048Game();

  const [balance, setBalance] = useState('0');
  const [b20BalanceWei, setB20BalanceWei] = useState<bigint>(BigInt(0));
  const [ethPrice, setEthPrice] = useState(3000);
  const [remainingMoves, setRemainingMoves] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [embeddedWalletAddress, setEmbeddedWalletAddress] = useState('');
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<string[]>([]);
  const [optimisticMovesUsed, setOptimisticMovesUsed] = useState(0);
  const [b20Allowance, setB20Allowance] = useState<bigint>(BigInt(0));
  const [onchainScore, setOnchainScore] = useState<number | null>(null);

  const { playMoveSound, playMilestoneSound } = useGameSounds();
  const milestoneTilesRef = useRef<Set<string>>(new Set());

  // Get embedded wallet address
  useEffect(() => {
    if (wallets && wallets.length > 0) {
      const embedded = wallets.find(w => w.walletClientType === 'privy');
      if (embedded) setEmbeddedWalletAddress(embedded.address);
    }
  }, [wallets]);

  // Spend permissions are now handled during connect in useBaseSubAccount

  // Fetch ETH price
  useEffect(() => {
    const fetchEthPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const data = await response.json();
        if (data.ethereum?.usd) setEthPrice(data.ethereum.usd);
      } catch {
        setEthPrice(3000);
      }
    };
    fetchEthPrice();
    const interval = setInterval(fetchEthPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch wallet balances (native ETH + B20 token)
  const fetchBalance = useCallback(async () => {
    // Match the walletAddr priority so the displayed balance always matches the
    // wallet shown on screen (especially the self-pay relayer in advanced mode).
    const addr = isSelfPayConnected
      ? selfPayAddress
      : embeddedWalletAddress || baseAddress || selfPayAddress;
    if (!addr) return;
    try {
      const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
      const token = new ethers.Contract(B20_TOKEN_ADDRESS, ERC20_BALANCE_OF_ABI, provider);
      const [balanceWei, b20Wei, allowanceWei] = await Promise.all([
        provider.getBalance(addr),
        (async () => {
          try {
            const b = await token.balanceOf(addr);
            return BigInt(b.toString());
          } catch {
            return BigInt(0);
          }
        })(),
        (async () => {
          try {
            const a = await token.allowance(addr, ONCHAIN_2048_ADDRESS);
            return BigInt(a.toString());
          } catch {
            return BigInt(0);
          }
        })(),
      ]);
      const balanceEth = ethers.formatEther(balanceWei);
      setBalance(balanceEth);
      setB20BalanceWei(b20Wei);
      setB20Allowance(allowanceWei);
      const ethMoves = ethPrice > 0
        ? Math.floor((parseFloat(balanceEth) * ethPrice) / MOVE_COST_USD)
        : 0;
      const b20Moves = Number(b20Wei / B20_MOVE_COST_WEI);
      // Prefer B20 when available (auto), otherwise ETH
      setRemainingMoves(b20Moves >= 1 ? b20Moves : ethMoves);
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  }, [embeddedWalletAddress, baseAddress, selfPayAddress, isSelfPayConnected, ethPrice]);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 5000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  useEffect(() => {
    setOptimisticMovesUsed(0);
    setPendingTransactions([]);
  }, [balance]);

  // Subscribe to on-chain MoveMade events for the active wallet address.
  // The contract score is displayed alongside the local score for reconciliation.
  useEffect(() => {
    const addr = isSelfPayConnected
      ? selfPayAddress
      : embeddedWalletAddress || baseAddress || selfPayAddress;
    if (!addr) {
      setOnchainScore(null);
      return;
    }
    let cancelled = false;
    const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
    const contract = new ethers.Contract(
      ONCHAIN_2048_ADDRESS,
      ['event MoveMade(address indexed player, uint8 direction, uint128 newBoard, uint256 newScore, bool gameOver, string moveData)',
       'function getGameState(address) view returns (uint128, uint256, bool)'],
      provider
    );

    // Initial fetch of on-chain score
    (async () => {
      try {
        const [, score] = await contract.getGameState(addr);
        if (!cancelled) setOnchainScore(Number(score));
      } catch {
        /* no active game yet */
      }
    })();

    const handler = (_player: string, _dir: number, _board: bigint, newScore: bigint) => {
      if (!cancelled) setOnchainScore(Number(newScore));
    };
    const filter = contract.filters.MoveMade(addr);
    contract.on(filter, handler);
    return () => {
      cancelled = true;
      contract.off(filter, handler);
    };
  }, [embeddedWalletAddress, baseAddress, selfPayAddress, isSelfPayConnected]);

  const handleRefreshBalance = async () => {
    setIsRefreshingBalance(true);
    await fetchBalance();
    setTimeout(() => setIsRefreshingBalance(false), 500);
  };

  // Fire-and-forget: start a fresh on-chain game. Reverts silently if the
  // player already has an active game — that's fine because it means the
  // player can just keep playing.
  const startOnchainGame = useCallback(async () => {
    const isUsingPrivy = authenticated && wallets.length > 0;
    const isUsingSelfPay = isSelfPayConnected && selfPayAddress;
    try {
      const data = encodeStartNewGame();
      if (isUsingPrivy) {
        const embedded = wallets.find(w => w.walletClientType === 'privy');
        if (!embedded) return;
        await sendTransaction(
          { to: ONCHAIN_2048_ADDRESS, value: BigInt(0), data, chainId: 8453 },
          { address: embedded.address, sponsor: false, uiOptions: { showWalletUIs: false } }
        );
      } else if (isUsingSelfPay) {
        await selfPaySendArbitraryTx({ to: ONCHAIN_2048_ADDRESS, value: BigInt(0), data });
      }
    } catch (err) {
      // Contract reverts "Active game exists" when a game is already ongoing.
      console.log('startNewGame skipped:', err instanceof Error ? err.message : err);
    }
  }, [authenticated, wallets, isSelfPayConnected, selfPayAddress, sendTransaction, selfPaySendArbitraryTx]);

  const handleNewGame = useCallback(() => {
    initGame();
    void startOnchainGame();
  }, [initGame, startOnchainGame]);

  // Check milestones
  const checkMilestones = useCallback(() => {
    const milestones = [128, 256, 512, 1024, 2048];
    tiles.forEach(tile => {
      if (milestones.includes(tile.value)) {
        const key = `${tile.row}-${tile.col}-${tile.value}`;
        if (!milestoneTilesRef.current.has(key)) {
          milestoneTilesRef.current.add(key);
          playMilestoneSound(tile.value);
        }
      }
    });
  }, [tiles, playMilestoneSound]);

  const makeMove = async (direction: Direction) => {
    if (gameOver || isProcessing) return;

    const isUsingPrivy = authenticated && wallets.length > 0;
    const isUsingBase = isBaseConnected && baseAddress;
    const isUsingSelfPay = isSelfPayConnected && selfPayAddress;
    const actualMoves = remainingMoves - optimisticMovesUsed;

    if (actualMoves <= 3) {
      alert(`Only ${actualMoves} move${actualMoves === 1 ? '' : 's'} remaining! Please fund your wallet to continue playing.`);
      return;
    }

    setIsProcessing(true);

    try {
      const moveCostEth = (MOVE_COST_USD / ethPrice).toFixed(18);
      const moveCostWei = ethers.parseEther(moveCostEth); // used by Base sub-account (legacy path)
      // Auto-select payment token: use B20 when the active wallet holds >= 10 B20
      const useB20 = b20BalanceWei >= B20_MOVE_COST_WEI;

      // Contract-routed move (Privy + Self-Pay). Value is the contract's fixed
      // moveCostETH (0.0001 ETH). B20 moves send value=0 but require allowance.
      const CONTRACT_ETH_COST = BigInt('100000000000000'); // 0.0001 ETH
      const moveCallData = encodeMakeMove(direction, useB20);
      const moveCallValue = useB20 ? BigInt(0) : CONTRACT_ETH_COST;
      const needsB20Approval = useB20 && b20Allowance < B20_MOVE_COST_WEI;
      const approveData = encodeB20Approve();

      // Privy embedded smart wallet: optimistic move + background tx on Base
      if (isUsingPrivy) {
        const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
        if (!embeddedWallet) {
          alert('Embedded wallet not found!');
          setIsProcessing(false);
          return;
        }

        const result = gameMakeMove(direction);
        if (!result.moved) {
          setIsProcessing(false);
          return;
        }

        playMoveSound();
        checkMilestones();
        setOptimisticMovesUsed(prev => prev + 1);

        // Fire-and-forget: (1) approve B20 if needed, (2) call makeMove on contract
        void (async () => {
          try {
            if (needsB20Approval) {
              await sendTransaction(
                { to: B20_TOKEN_ADDRESS, value: BigInt(0), data: approveData, chainId: 8453 },
                { address: embeddedWallet.address, sponsor: false, uiOptions: { showWalletUIs: false } }
              );
              setB20Allowance(BigInt(2) ** BigInt(255));
            }

            const txResult = await sendTransaction(
              { to: ONCHAIN_2048_ADDRESS, value: moveCallValue, data: moveCallData, chainId: 8453 },
              { address: embeddedWallet.address, sponsor: false, uiOptions: { showWalletUIs: false } }
            );

            const txHash =
              typeof txResult === 'string'
                ? txResult
                : (txResult as { hash?: string; transactionHash?: string }).hash ||
                  (txResult as { hash?: string; transactionHash?: string }).transactionHash ||
                  '';

            if (txHash) {
              setPendingTransactions(prev => [...prev, txHash]);
              console.log('✅ Contract makeMove sent on Base:', txHash);
            } else {
              console.warn('Move tx sent but hash missing:', txResult);
            }
          } catch (error) {
            console.error('❌ Background transaction failed:', error);
            setOptimisticMovesUsed(prev => Math.max(0, prev - 1));
          }
        })();

        setIsProcessing(false);
        return;
      }

      // Base Wallet with Sub Account: keeps existing silent relayer path (direct
      // ETH transfer to fee receiver). The relayer executes spend() and does not
      // route through the OnChain2048 contract, so on-chain score won't update
      // for this mode — score is tracked locally.
      if (isUsingBase) {
        const result = gameMakeMove(direction);
        if (!result.moved) {
          setIsProcessing(false);
          return;
        }

        playMoveSound();
        checkMilestones();
        setOptimisticMovesUsed(prev => prev + 1);

        void (async () => {
          try {
            const callsId = await baseSendTx(moveCostWei);
            if (callsId) {
              setPendingTransactions(prev => [...prev, callsId]);
              console.log('✅ Sub Account tx sent:', callsId);
            }
          } catch (error) {
            console.error('[v0] ❌ Sub Account transaction failed:', error);
            setOptimisticMovesUsed(prev => Math.max(0, prev - 1));
          }
        })();

        setIsProcessing(false);
        return;
      }

      // Self-Pay Wallet: routes through the OnChain2048 contract
      if (isUsingSelfPay) {
        const isAdvancedMode = selfPayMode === 'advanced-relay';

        const sendContractCall = async () => {
          if (needsB20Approval) {
            await selfPaySendArbitraryTx({ to: B20_TOKEN_ADDRESS, value: BigInt(0), data: approveData });
            setB20Allowance(BigInt(2) ** BigInt(255));
          }
          return selfPaySendArbitraryTx({
            to: ONCHAIN_2048_ADDRESS,
            value: moveCallValue,
            data: moveCallData,
          });
        };

        if (isAdvancedMode) {
          const result = gameMakeMove(direction);
          if (!result.moved) {
            setIsProcessing(false);
            return;
          }

          playMoveSound();
          checkMilestones();
          setOptimisticMovesUsed(prev => prev + 1);

          void (async () => {
            try {
              const txHash = await sendContractCall();
              if (txHash) {
                setPendingTransactions(prev => [...prev, txHash]);
                console.log('Advanced relay contract tx sent:', txHash);
              }
            } catch (error) {
              console.error('Advanced relay transaction failed:', error);
              const errorMsg = error instanceof Error ? error.message : String(error);
              if (errorMsg.includes('Insufficient') || errorMsg.includes('insufficient')) {
                alert('Relayer wallet has insufficient balance. Please add funds to your relayer wallet.');
              }
              setOptimisticMovesUsed(prev => Math.max(0, prev - 1));
            }
          })();

          setIsProcessing(false);
          return;
        } else {
          // Pay-per-move: contract call FIRST, then move
          try {
            const txHash = await sendContractCall();
            if (txHash) {
              setPendingTransactions(prev => [...prev, txHash]);
              console.log('Pay-per-move contract tx sent:', txHash);
              const result = gameMakeMove(direction);
              if (result.moved) {
                playMoveSound();
                checkMilestones();
              }
            }
          } catch (error) {
            console.error('Pay-per-move transaction failed:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('Insufficient') || errorMsg.includes('insufficient')) {
              alert('Insufficient balance to make a move. Please add funds to your wallet.');
            }
          }

          setIsProcessing(false);
          return;
        }
      }

      alert('Please connect a wallet first!');
    } catch (error) {
      console.error('Transaction failed:', error);
      alert('Transaction failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameOver || isProcessing) return;
      const dirMap: Record<string, Direction> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
      };
      const dir = dirMap[e.key];
      if (dir) {
        e.preventDefault();
        makeMove(dir);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Touch controls
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    const minSwipe = 50;

    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > minSwipe) makeMove(dx > 0 ? 'right' : 'left');
    } else {
      if (Math.abs(dy) > minSwipe) makeMove(dy > 0 ? 'down' : 'up');
    }
    setTouchStart(null);
  };

  const isConnected = authenticated || isBaseConnected || isSelfPayConnected;
  // Prioritize the self-pay wallet when active, since that's the wallet the user
  // explicitly logged in with (and in advanced mode it's the relayer that holds funds).
  const walletAddr = isSelfPayConnected
    ? selfPayAddress
    : embeddedWalletAddress || baseAddress || selfPayAddress || '';

  // Unified sendTransaction for the SwapModal so swaps use whichever wallet is active.
  // - Self-pay (advanced or pay-per-move): route through the self-pay wallet
  // - Privy embedded: use Privy's sendTransaction (default)
  // - Base wallet: fall back to Privy's sendTransaction signature (existing behavior)
  const swapSendTransaction = useCallback(
    async (
      params: { to: string; value?: bigint; data?: string; chainId?: number },
      options?: any
    ) => {
      if (isSelfPayConnected) {
        const txHash = await selfPaySendArbitraryTx({
          to: params.to,
          value: params.value,
          data: params.data,
        });
        return txHash;
      }
      return sendTransaction(params as any, options);
    },
    [isSelfPayConnected, selfPaySendArbitraryTx, sendTransaction]
  );
  const { displayName: baseDisplayName } = useBaseName(walletAddr);
  const connectionType = authenticated 
    ? 'Privy Email' 
    : isSelfPayConnected 
      ? (selfPayMode === 'advanced-relay' ? 'Self-Pay (Advanced)' : 'Self-Pay (Per Move)')
      : 'Base Wallet';
  const userDisplay = user?.email?.address || baseDisplayName || 'Connected';

  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-xl font-display font-bold text-foreground animate-pulse-glow">Loading...</div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <LoginScreen
        onEmailLogin={login}
        onBaseWalletConnect={async (params?: SpendPermissionValues) => {
          await baseConnect(params ? { allowanceEth: params.allowanceEth, durationDays: params.durationDays } : undefined);
        }}
        onSelfPayConnect={async (params?: SpendPermissionValues) => {
          await selfPayConnect(params ? { 
            allowanceEth: params.allowanceEth, 
            durationDays: params.durationDays, 
            relayerAddress: params.relayerAddress,
            relayerPrivateKey: params.relayerPrivateKey,
            useAdvancedMode: params.useAdvancedMode,
          } : undefined);
        }}
        isBaseConnecting={isBaseConnecting}
        isSelfPayConnecting={isSelfPayConnecting}
        baseWalletError={baseWalletError}
        selfPayError={selfPayError}
      />
    );
  }

  const handleDisconnect = () => {
    if (authenticated) logout();
    else if (isSelfPayConnected) selfPayDisconnect();
    else if (isBaseConnected) baseDisconnect();
  };

  return (
    <div className="min-h-screen bg-background p-4 pt-8">
      <SwapModal 
        walletAddress={walletAddr} 
        onSwapSuccess={handleRefreshBalance}
        sendTransaction={swapSendTransaction}
        // Only pass the Privy embedded wallet when Privy is the active connection.
        // For self-pay we leave this empty so the swap signs from the self-pay wallet.
        embeddedWalletAddress={isSelfPayConnected ? '' : embeddedWalletAddress}
      />
      
      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-display font-bold gradient-text">2048</h1>
            <p className="text-sm text-muted-foreground mt-1 font-body">{userDisplay}</p>
            <p className="text-xs text-muted-foreground font-mono">{connectionType}</p>
          </div>
          <Button
            onClick={handleDisconnect}
            variant="outline"
            className="border-border bg-secondary text-secondary-foreground hover:bg-muted font-body"
          >
            Disconnect
          </Button>
        </div>

        <ScorePanel score={score} highScore={highScore} />

        <WalletPanel
          walletAddress={walletAddr}
          balance={balance}
          ethPrice={ethPrice}
          remainingMoves={remainingMoves}
          optimisticMovesUsed={optimisticMovesUsed}
          pendingTransactions={pendingTransactions}
          isRefreshing={isRefreshingBalance}
          onRefresh={handleRefreshBalance}
          showExport={authenticated}
          b20Balance={formatB20(b20BalanceWei)}
          paymentToken={b20BalanceWei >= B20_MOVE_COST_WEI ? 'B20' : 'ETH'}
          onchainScore={onchainScore}
        />

        <p className="text-xs text-center text-muted-foreground -mt-2 font-body">
          Move cost: 1 $B20 (when available) or ${MOVE_COST_USD} in ETH
        </p>

        <Card className="p-4 glass-card flex flex-col items-center">
          <GameBoard
            tiles={tiles}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          />

          {gameOver && (
            <div className="text-center mt-4">
              <div className="text-xl font-display font-bold text-destructive">Game Over</div>
            </div>
          )}

          <Button
            onClick={handleNewGame}
            className="w-full mt-4 gradient-btn text-foreground font-display font-semibold"
            disabled={isProcessing}
          >
            New Game
          </Button>

          <p className="text-xs text-center text-muted-foreground mt-3 font-body">
            Swipe or use arrow keys • On-chain via 2048 contract
          </p>
        </Card>
      </div>
    </div>
  );
}
