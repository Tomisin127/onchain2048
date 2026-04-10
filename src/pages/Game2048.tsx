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

const MOVE_COST_USD = 0.0001;
const CREATOR_ADDRESS = '0xEA549e458e77Fd93bf330e5EAEf730c50d8F5249' as const;

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
    address: selfPayAddress,
    connected: isSelfPayConnected,
    isConnecting: isSelfPayConnecting,
    error: selfPayError,
    connect: selfPayConnect,
    disconnect: selfPayDisconnect,
    sendTransaction: selfPaySendTx,
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
  const [ethPrice, setEthPrice] = useState(3000);
  const [remainingMoves, setRemainingMoves] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [embeddedWalletAddress, setEmbeddedWalletAddress] = useState('');
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<string[]>([]);
  const [optimisticMovesUsed, setOptimisticMovesUsed] = useState(0);

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

  // Fetch wallet balance
  const fetchBalance = useCallback(async () => {
    const addr = embeddedWalletAddress || baseAddress || selfPayAddress;
    if (!addr) return;
    try {
      const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
      const balanceWei = await provider.getBalance(addr);
      const balanceEth = ethers.formatEther(balanceWei);
      setBalance(balanceEth);
      if (ethPrice > 0) {
        setRemainingMoves(Math.floor((parseFloat(balanceEth) * ethPrice) / MOVE_COST_USD));
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  }, [embeddedWalletAddress, baseAddress, selfPayAddress, ethPrice]);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 5000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  useEffect(() => {
    setOptimisticMovesUsed(0);
    setPendingTransactions([]);
  }, [balance]);

  const handleRefreshBalance = async () => {
    setIsRefreshingBalance(true);
    await fetchBalance();
    setTimeout(() => setIsRefreshingBalance(false), 500);
  };

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
      const moveCostWei = ethers.parseEther(moveCostEth);

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

        // Fire-and-forget onchain transfer on Base
        void (async () => {
          try {
            const txResult = await sendTransaction(
              {
                to: CREATOR_ADDRESS,
                value: moveCostWei,
                chainId: 8453,
              },
              {
                address: embeddedWallet.address,
                sponsor: false,
                uiOptions: { showWalletUIs: false },
              }
            );

            const txHash =
              typeof txResult === 'string'
                ? txResult
                : (txResult as { hash?: string; transactionHash?: string }).hash ||
                  (txResult as { hash?: string; transactionHash?: string }).transactionHash ||
                  '';

            if (txHash) {
              setPendingTransactions(prev => [...prev, txHash]);
              console.log('✅ Move tx sent on Base:', txHash);
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

      // Base Wallet with Sub Account: optimistic move + silent background tx
      // First tx may show approval popup (Auto Spend Permissions), subsequent ones are silent
      if (isUsingBase) {
        const result = gameMakeMove(direction);
        if (!result.moved) {
          setIsProcessing(false);
          return;
        }

        playMoveSound();
        checkMilestones();
        setOptimisticMovesUsed(prev => prev + 1);

        // Fire-and-forget silent transaction via relayer or direct
        void (async () => {
          try {
            console.log('[v0] Attempting transaction...', {
              from: baseAddress,
              to: CREATOR_ADDRESS,
              value: moveCostWei.toString(),
            });
            const callsId = await baseSendTx(moveCostWei);
            if (callsId) {
              setPendingTransactions(prev => [...prev, callsId]);
              console.log('✅ Sub Account tx sent:', callsId);
            } else {
              console.warn('[v0] Sub Account tx sent but no ID returned');
            }
          } catch (error) {
            console.error('[v0] ❌ Sub Account transaction failed:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('[v0] Error details:', errorMsg);
            setOptimisticMovesUsed(prev => Math.max(0, prev - 1));
          }
        })();

        setIsProcessing(false);
        return;
      }

      // Self-Pay Wallet: user pays gas, builder code in data
      if (isUsingSelfPay) {
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
            const txHash = await selfPaySendTx(moveCostWei);
            if (txHash) {
              setPendingTransactions(prev => [...prev, txHash]);
              console.log('✅ Self-pay tx sent:', txHash);
            }
          } catch (error) {
            console.error('❌ Self-pay transaction failed:', error);
            setOptimisticMovesUsed(prev => Math.max(0, prev - 1));
          }
        })();

        setIsProcessing(false);
        return;
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
  const walletAddr = embeddedWalletAddress || baseAddress || selfPayAddress || '';
  const { displayName: baseDisplayName } = useBaseName(walletAddr);
  const connectionType = authenticated ? 'Privy Email' : isSelfPayConnected ? 'Self-Pay Wallet' : 'Base Wallet';
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
          await selfPayConnect(params ? { allowanceEth: params.allowanceEth, durationDays: params.durationDays } : undefined);
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
        sendTransaction={sendTransaction}
        embeddedWalletAddress={embeddedWalletAddress}
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
        />

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
            onClick={initGame}
            className="w-full mt-4 gradient-btn text-foreground font-display font-semibold"
            disabled={isProcessing}
          >
            New Game
          </Button>

          <p className="text-xs text-center text-muted-foreground mt-3 font-body">
            Swipe or use arrow keys • ${MOVE_COST_USD} per move
          </p>
        </Card>
      </div>
    </div>
  );
}
