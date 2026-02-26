import { useEffect, useState, useCallback, useRef } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';
import { useAccount, useDisconnect } from 'wagmi';
import { ethers } from 'ethers';
import { base } from 'viem/chains';
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
const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'; // ERC-7528
const BUILDER_CODE = 'bc_dh0rqw67';

export default function Game2048Page() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { client, getClientForChain } = useSmartWallets();
  const { address: wagmiAddress, isConnected: isWagmiConnected } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();

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
  const [spendPermission, setSpendPermission] = useState<any>(null);

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

  // Request spend permission for Base Wallet users
  const requestSpendPermission = async () => {
    if (!isWagmiConnected || !wagmiAddress) return;

    try {
      const { requestSpendPermission: reqPerm } = await import('@base-org/account/spend-permission');
      const { createBaseAccountSDK } = await import('@base-org/account');

      const sdk = createBaseAccountSDK({
        appName: 'Crypto2048',
        appLogoUrl: 'https://onchain2048.lovable.app/favicon.ico',
        appChainIds: [8453],
      });

      const moveCostEth = (MOVE_COST_USD / ethPrice).toFixed(18);
      const allowanceWei = ethers.parseEther(moveCostEth) * 10000n; // Allow 10k moves per period

      const permission = await reqPerm({
        account: wagmiAddress,
        spender: CREATOR_ADDRESS,
        token: NATIVE_TOKEN,
        chainId: 8453,
        allowance: allowanceWei,
        periodInDays: 30,
        provider: sdk.getProvider(),
      });

      setSpendPermission(permission);
      console.log('✅ Spend permission granted:', permission);
    } catch (error) {
      console.error('Failed to request spend permission:', error);
    }
  };

  const getPrivyBaseClient = useCallback(async () => {
    if (getClientForChain) {
      try {
        return await getClientForChain({ id: base.id });
      } catch (error) {
        console.error('Failed to initialize Base smart wallet client:', error);
      }
    }

    return client ?? null;
  }, [getClientForChain, client]);

  const sendPrivyMoveTransaction = useCallback(
    async (embeddedWallet: (typeof wallets)[number], moveCostWei: bigint) => {
      const smartWalletClient = await getPrivyBaseClient();

      if (smartWalletClient?.sendTransaction) {
        return await smartWalletClient.sendTransaction({
          chain: base,
          to: CREATOR_ADDRESS as `0x${string}`,
          value: moveCostWei,
          data: '0x',
          gas: 100000n,
        });
      }

      const provider = await embeddedWallet.getEthereumProvider();
      const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
      const from = accounts[0] || embeddedWallet.address;

      return await provider.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from,
            to: CREATOR_ADDRESS,
            value: `0x${moveCostWei.toString(16)}`,
            data: '0x',
            gas: '0x186A0',
            chainId: '0x2105',
          },
        ],
      });
    },
    [getPrivyBaseClient, wallets]
  );

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

      // 🚀 OPTIMISTIC UI: Handle Privy wallet (fire-and-forget, instant board update)
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

        void (async () => {
          try {
            const txHash = await sendPrivyMoveTransaction(embeddedWallet, moveCostWei);

            if (!txHash || typeof txHash !== 'string') {
              throw new Error('Privy transaction did not return a transaction hash');
            }

            console.log('✅ Privy move transaction sent on Base:');
            console.log('   TX Hash:', txHash);
            console.log('   Builder Code:', BUILDER_CODE);
            console.log('   View on Basescan:', `https://basescan.org/tx/${txHash}`);

            setPendingTransactions(prev => [...prev, txHash]);
          } catch (error) {
            console.error('❌ Background transaction failed:', error);
            setOptimisticMovesUsed(prev => Math.max(0, prev - 1));
          }
        })();

        setIsProcessing(false);
        return;
      }

      // Wagmi/Base Wallet: with spend permission
      if (isUsingWagmi) {
        // If no spend permission yet, request one (one-time popup)
        if (!spendPermission) {
          await requestSpendPermission();
        }

        // If we have a spend permission, use it silently
        if (spendPermission) {
          try {
            const { prepareSpendCallData } = await import('@base-org/account/spend-permission');
            const spendCalls = await prepareSpendCallData(
              spendPermission,
              moveCostWei,
              CREATOR_ADDRESS as `0x${string}`,
            );

            const { createBaseAccountSDK } = await import('@base-org/account');
            const sdk = createBaseAccountSDK({
              appName: 'Crypto2048',
              appLogoUrl: 'https://onchain2048.lovable.app/favicon.ico',
              appChainIds: [8453],
            });
            const provider = sdk.getProvider();

            // Execute spend calls
            await Promise.all(
              spendCalls.map((call: any) =>
                provider.request({
                  method: 'eth_sendTransaction',
                  params: [{ ...call, from: CREATOR_ADDRESS }],
                })
              )
            );

            console.log('✅ Spend permission transaction sent');
          } catch (error) {
            console.error('Spend permission transaction failed, falling back:', error);
            // Fallback: direct transaction via wagmi connector
            const connector = wallets.length > 0 ? null : null;
            // Use window.ethereum as fallback
            if (window.ethereum) {
              await window.ethereum.request({
                method: 'eth_sendTransaction',
                params: [{
                  from: wagmiAddress,
                  to: CREATOR_ADDRESS,
                  value: '0x' + moveCostWei.toString(16),
                }],
              });
            }
          }
        } else {
          // No spend permission available, use direct transaction
          if (window.ethereum) {
            await window.ethereum.request({
              method: 'eth_sendTransaction',
              params: [{
                from: wagmiAddress,
                to: CREATOR_ADDRESS,
                value: '0x' + moveCostWei.toString(16),
              }],
            });
          }
        }

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
