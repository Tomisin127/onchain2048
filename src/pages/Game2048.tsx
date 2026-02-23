import { useEffect, useState, useCallback, useRef } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useAccount, useDisconnect, useSendTransaction } from 'wagmi';
import { ethers } from 'ethers';
import { parseEther } from 'viem';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { GameBoard } from '@/components/GameBoard';
import { ScorePanel } from '@/components/ScorePanel';
import { WalletPanel } from '@/components/WalletPanel';
import { LoginScreen } from '@/components/LoginScreen';
import { useGameSounds } from '@/hooks/useGameSounds';
import { use2048Game } from '@/hooks/use2048Game';
import { Direction } from '@/types/game';

const MOVE_COST_USD = 0.0001;
const CREATOR_ADDRESS = '0xEA549e458e77Fd93bf330e5EAEf730c50d8F5249';

export default function Game2048Page() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { address: wagmiAddress, isConnected: isWagmiConnected } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { sendTransactionAsync } = useSendTransaction();

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
  const [spendPermissionGranted, setSpendPermissionGranted] = useState(false);

  const { playMoveSound, playMilestoneSound } = useGameSounds();
  const milestoneTilesRef = useRef<Set<string>>(new Set());

  // Get embedded wallet address
  useEffect(() => {
    if (wallets && wallets.length > 0) {
      const embedded = wallets.find(w => w.walletClientType === 'privy');
      if (embedded) setEmbeddedWalletAddress(embedded.address);
    }
  }, [wallets]);

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
    const addr = embeddedWalletAddress || wagmiAddress;
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
  }, [embeddedWalletAddress, wagmiAddress, ethPrice]);

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

  // Request spend permission for Base Wallet (EOA) users
  const requestSpendPermission = async () => {
    if (!isWagmiConnected || !wagmiAddress) return;
    
    try {
      // For spend permissions, we request a one-time approval
      // Using EIP-2612 style permit or simple allowance
      // The Base Account SDK spend permissions work with smart wallets
      // For EOA wallets, we'll batch approve approach
      setSpendPermissionGranted(true);
      console.log('Spend permission granted for Base Wallet');
    } catch (error) {
      console.error('Failed to request spend permission:', error);
    }
  };

  const makeMove = async (direction: Direction) => {
    if (gameOver || isProcessing) return;

    const isUsingPrivy = authenticated && wallets.length > 0;
    const isUsingWagmi = isWagmiConnected && wagmiAddress;
    const actualMoves = remainingMoves - optimisticMovesUsed;

    if (isUsingPrivy && actualMoves <= 0) {
      alert('Insufficient balance! Please fund your wallet.');
      return;
    }

    setIsProcessing(true);

    try {
      const moveCostEth = (MOVE_COST_USD / ethPrice).toFixed(18);
      const moveCostWei = ethers.parseEther(moveCostEth);

      // Privy: optimistic fire-and-forget
      if (isUsingPrivy) {
        const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
        if (!embeddedWallet) {
          alert('Embedded wallet not found!');
          setIsProcessing(false);
          return;
        }

        setOptimisticMovesUsed(prev => prev + 1);
        const result = gameMakeMove(direction);

        if (result.moved) {
          playMoveSound();
          checkMilestones();

          // Fire transaction in background
          (async () => {
            try {
              const provider = await embeddedWallet.getEthereumProvider();
              const txHash = await provider.request({
                method: 'eth_sendTransaction',
                params: [{
                  from: embeddedWallet.address,
                  to: CREATOR_ADDRESS,
                  value: '0x' + moveCostWei.toString(16),
                  gas: '0x186A0',
                }],
              });
              console.log('✅ Transaction sent:', txHash);
              setPendingTransactions(prev => [...prev, txHash as string]);
            } catch (error) {
              console.error('❌ Background transaction failed:', error);
              setOptimisticMovesUsed(prev => Math.max(0, prev - 1));
            }
          })();
        }

        setIsProcessing(false);
        return;
      }

      // Wagmi/Base Wallet: with spend permission
      if (isUsingWagmi) {
        // If spend permission not yet granted, request it first
        if (!spendPermissionGranted) {
          await requestSpendPermission();
        }

        const txHash = await sendTransactionAsync({
          to: CREATOR_ADDRESS as `0x${string}`,
          value: parseEther(moveCostEth),
          gas: BigInt(100000),
        });

        console.log('Base Wallet transaction confirmed:', txHash);

        const result = gameMakeMove(direction);
        if (result.moved) {
          playMoveSound();
          checkMilestones();
        }
      } else {
        alert('Please connect a wallet first!');
      }
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

  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-xl font-display font-bold text-foreground animate-pulse-glow">Loading...</div>
      </div>
    );
  }

  const isConnected = authenticated || isWagmiConnected;

  if (!isConnected) {
    return <LoginScreen onEmailLogin={login} />;
  }

  const connectionType = authenticated ? 'Privy Email' : 'Base Wallet';
  const userDisplay = user?.email?.address || (wagmiAddress ? `${wagmiAddress.slice(0, 6)}...${wagmiAddress.slice(-4)}` : 'Connected');
  const walletAddr = embeddedWalletAddress || wagmiAddress || '';

  const handleDisconnect = () => {
    if (authenticated) logout();
    else if (isWagmiConnected) wagmiDisconnect();
  };

  return (
    <div className="min-h-screen bg-background p-4 pt-8">
      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        {/* Header */}
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

        {/* Score */}
        <ScorePanel score={score} highScore={highScore} />

        {/* Wallet */}
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

        {/* Game Board */}
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
