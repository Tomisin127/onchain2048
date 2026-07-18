import { useEffect, useState, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { AIModePanel } from '@/components/AIModePanel';
import { bestMove, tilesToGrid } from '@/lib/ai2048';
import { usePrivy, useWallets, useSendTransaction } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { useBaseSubAccount } from '@/hooks/useBaseSubAccount';
import { useSelfPayWallet } from '@/hooks/useSelfPayWallet';
import type { SpendPermissionValues } from '@/components/SpendPermissionConfig';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { GameBoard } from '@/components/GameBoard';

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
  const [lowBalanceError, setLowBalanceError] = useState<string | null>(null);

  // Dynamic cell size — computed from actual available viewport height so the
  // board + all panels fill the screen without a scroll or empty gap below.
  const [cellSize, setCellSize] = useState(68);
  const containerRef = useRef<HTMLDivElement>(null);

  const { playMoveSound, playMergeNote, playMilestoneSound, resetMelody } = useGameSounds();
  const milestoneTilesRef = useRef<Set<string>>(new Set());
  const prevTileValuesRef = useRef<number[]>([]);
  // AI tier system: manual moves fill the ring; every 100 manual moves unlock
  // a batch of AI auto-moves (10 → 15 → 20 → …, +5 per tier).
  const AI_UNLOCK_MOVES = 100;
  const [aiTier, setAiTier] = useState<number>(() => {
    if (typeof window === 'undefined') return 1;
    return Math.max(1, parseInt(localStorage.getItem('ai2048_tier') || '1', 10));
  });
  const [cycleProgress, setCycleProgress] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return parseInt(localStorage.getItem('ai2048_cycle') || '0', 10);
  });
  // Auto-play is TIME-based: a charged "battery" lets the AI play for a fixed
  // number of seconds. Finishing a session drains the battery and bumps the
  // tier (+5s next time). The player recharges by playing manual moves until
  // the cycle refills, at which point the button unlocks again with more time.
  const AUTOPLAY_BASE_SECONDS = 10;
  const autoPlaySeconds = AUTOPLAY_BASE_SECONDS + (aiTier - 1) * 5;
  const isCharged = cycleProgress >= AI_UNLOCK_MOVES;
  const isAIUnlocked = isCharged;
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlaySecondsLeft, setAutoPlaySecondsLeft] = useState(0);
  const autoPlayRef = useRef(false);
  const isAutoMoveRef = useRef(false);

  // End an auto-play session: stop the loop, drain the battery (reset the
  // recharge cycle), and advance the tier so the next unlock grants +5s.
  const endAutoPlaySession = useCallback(() => {
    autoPlayRef.current = false;
    setIsAutoPlaying(false);
    setAutoPlaySecondsLeft(0);
    setAiTier((t) => t + 1);
    setCycleProgress(0);
  }, []);

  // Start (only when charged) or stop the timed auto-play session.
  const toggleAutoPlay = useCallback(() => {
    if (autoPlayRef.current) {
      endAutoPlaySession();
      return;
    }
    if (!isCharged) return;
    setAutoPlaySecondsLeft(autoPlaySeconds);
    autoPlayRef.current = true;
    setIsAutoPlaying(true);
  }, [endAutoPlaySession, isCharged, autoPlaySeconds]);


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
      const ethMoves = Math.floor(parseFloat(balanceEth) / MOVE_COST_ETH);
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

  // Compute the largest cell size that lets the 4×4 board + all surrounding
  // panels fit exactly within the viewport height, with no scroll or gap.
  // Heights of non-board elements (measured from the rendered layout):
  //   outer py-3 (top+bottom): 24px
  //   header row:              ~48px  + gap 8px
  //   AI panel card:           ~60px  + gap 8px
  //   wallet panel:            ~44px  + gap 8px
  //   game Card padding top/bot (p-2.5): 20px  + gap 8px
  //   footer text inside Card: ~28px
  // Total non-board height ≈ 256px.  Board = cellSize*4 + GAP*5 (GAP=10).
  const CHROME_HEIGHT = 256;
  const BOARD_GAP = 10;
  useLayoutEffect(() => {
    const compute = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Height budget: fit the board + all panels within the viewport height.
      const availableH = vh - CHROME_HEIGHT;
      const cellFromHeight = Math.floor((availableH - BOARD_GAP * 5) / 4);

      // Width budget: the board lives inside a centered column capped at 512px
      // (max-w-lg) with horizontal page padding + the game Card's own padding.
      // Never let the board exceed the usable width on narrow phones.
      const columnWidth = Math.min(vw, 512);
      const horizontalChrome = 32 /* page px-4 */ + 20 /* card p-2.5 */;
      const availableW = columnWidth - horizontalChrome;
      const cellFromWidth = Math.floor((availableW - BOARD_GAP * 5) / 4);

      // Use the smaller of the two so the board fits both dimensions, then clamp.
      const raw = Math.min(cellFromHeight, cellFromWidth);
      setCellSize(Math.min(Math.max(raw, 46), 92)); // clamp 46–92 px
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

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
          { address: embedded.address, uiOptions: { showWalletUIs: false } }
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
    resetMelody();
    milestoneTilesRef.current.clear();
    void startOnchainGame();
  }, [initGame, resetMelody, startOnchainGame]);

  // Detect merges (any tile flagged isMerged) and advance the piano melody.
  useEffect(() => {
    if (tiles.some((t) => t.isMerged)) playMergeNote();
  }, [tiles, playMergeNote]);

  // Track completed moves. Only MANUAL moves recharge the battery
  // (cycleProgress → AI_UNLOCK_MOVES); AI auto-moves don't count toward it.
  const lastMaxTileIdRef = useRef(0);
  useEffect(() => {
    if (tiles.length === 0) return;
    const maxId = tiles.reduce((m, t) => (t.id > m ? t.id : m), 0);
    if (lastMaxTileIdRef.current === 0) {
      lastMaxTileIdRef.current = maxId;
      return;
    }
    if (maxId > lastMaxTileIdRef.current) {
      const delta = maxId - lastMaxTileIdRef.current;
      lastMaxTileIdRef.current = maxId;
      if (!isAutoMoveRef.current) {
        setCycleProgress((c) => Math.min(AI_UNLOCK_MOVES, c + delta));
      }
    }
  }, [tiles]);

  // Persist tier progress
  useEffect(() => {
    localStorage.setItem('ai2048_tier', String(aiTier));
    localStorage.setItem('ai2048_cycle', String(cycleProgress));
  }, [aiTier, cycleProgress]);


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

  // Gas on Base is ALWAYS paid in native ETH — even for B20-funded moves, which
  // send value=0 but still cost gas to execute the contract call. So the wallet
  // must ALWAYS hold at least a small ETH gas reserve, or the transaction can't
  // be completed. If it can't be completed, no move may happen on the board.
  const GAS_RESERVE_ETH = 0.000003; // ~enough for one Base contract call
  const ethBalanceNum = parseFloat(balance);
  const hasGasForMove = ethBalanceNum >= GAS_RESERVE_ETH;
  const hasEnoughB20 = b20BalanceWei >= B20_MOVE_COST_WEI;
  // Payment token is auto-selected: B20 is used when the wallet holds >= 10 B20.
  const willUseB20 = hasEnoughB20;
  // When paying with ETH, the wallet needs the fixed move cost PLUS gas.
  const canPayWithEth = ethBalanceNum >= MOVE_COST_ETH + GAS_RESERVE_ETH;
  // A move is allowed only if the resulting transaction can actually settle:
  //  - B20 move  → needs gas (ETH) only; B20 alone is NOT enough.
  //  - ETH move  → needs move cost + gas.
  const canMove = willUseB20 ? hasGasForMove : canPayWithEth;

  // Stop auto-play immediately whenever the balance is too low to continue.
  useEffect(() => {
    if (!canMove && isAutoPlaying) {
      endAutoPlaySession();
      setLowBalanceError(
        'Auto-play stopped: insufficient balance. Add ETH or B20 to continue.'
      );
    }
  }, [canMove, isAutoPlaying, endAutoPlaySession]);

  const makeMove = async (direction: Direction) => {
    if (gameOver || isProcessing) return;

    // Hard block: the transaction cannot be settled, so NOTHING moves on the
    // board (this holds for silent/Privy modes and B20-funded moves too, since
    // gas is always paid in ETH). This also prevents the AI auto-play progress
    // from advancing when no real on-chain move can happen.
    if (!canMove) {
      if (willUseB20 && !hasGasForMove) {
        setLowBalanceError(
          'Insufficient ETH for gas. B20 covers the move fee, but you still need a small amount of Base ETH to pay gas. No moves can be made until you add ETH.'
        );
      } else {
        setLowBalanceError(
          `Insufficient balance. You need at least ${MOVE_COST_ETH} ETH (plus gas) or 10 B20 with a little ETH for gas on Base. No moves can be made until you add funds.`
        );
      }
      return;
    }
    setLowBalanceError(null);

    const isUsingPrivy = authenticated && wallets.length > 0;
    const isUsingBase = isBaseConnected && baseAddress;
    const isUsingSelfPay = isSelfPayConnected && selfPayAddress;
    const actualMoves = remainingMoves - optimisticMovesUsed;

    if (actualMoves <= 3) {
      setLowBalanceError(
        `Only ${actualMoves} move${actualMoves === 1 ? '' : 's'} remaining. Please fund your wallet to continue.`
      );
    }

    setIsProcessing(true);

    try {
      const moveCostWei = ethers.parseEther(MOVE_COST_ETH.toString()); // legacy Base sub-account path

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
          setLowBalanceError('Embedded wallet not found. Please reconnect.');
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
                { address: embeddedWallet.address, uiOptions: { showWalletUIs: false } }
              );
              setB20Allowance(BigInt(2) ** BigInt(255));
            }

            const txResult = await sendTransaction(
              { to: ONCHAIN_2048_ADDRESS, value: moveCallValue, data: moveCallData, chainId: 8453 },
              { address: embeddedWallet.address, uiOptions: { showWalletUIs: false } }
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
            const msg = error instanceof Error ? error.message : String(error);
            console.error('❌ Background transaction failed:', msg);
            setOptimisticMovesUsed(prev => Math.max(0, prev - 1));
            if (/insufficient|balance|funds/i.test(msg)) {
              setLowBalanceError('Move failed: insufficient balance. Fund your wallet with Base ETH for gas, or top up B20.');
            }
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
                setLowBalanceError('Relayer wallet has insufficient balance. Please add funds to your relayer wallet.');
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
              setLowBalanceError('Insufficient balance to make a move. Please add funds to your wallet.');
            }
          }

          setIsProcessing(false);
          return;
        }
      }

      setLowBalanceError('Please connect a wallet first.');
    } catch (error) {
      console.error('Transaction failed:', error);
      setLowBalanceError('Transaction failed. Please try again.');
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

  // Keep a ref to makeMove so the auto-play interval always sees the latest closure.
  const makeMoveRef = useRef(makeMove);
  makeMoveRef.current = makeMove;

  // AI auto-play move-maker: while a session is active, the AI plays a move
  // roughly every 700ms until the game is over.
  useEffect(() => {
    autoPlayRef.current = isAutoPlaying;
    if (!isAutoPlaying) return;
    const id = setInterval(async () => {
      if (!autoPlayRef.current) return;
      if (gameOver) { endAutoPlaySession(); return; }
      const grid = tilesToGrid(tiles);
      const dir = bestMove(grid);
      if (dir) {
        isAutoMoveRef.current = true;
        try { await makeMoveRef.current(dir); }
        finally { isAutoMoveRef.current = false; }
      }
    }, 700);
    return () => clearInterval(id);
  }, [isAutoPlaying, tiles, gameOver, endAutoPlaySession]);

  // Countdown that drains the battery one second at a time during a session.
  useEffect(() => {
    if (!isAutoPlaying) return;
    const id = setInterval(() => {
      setAutoPlaySecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [isAutoPlaying]);

  // When the countdown hits zero, end the session (drain + tier up).
  useEffect(() => {
    if (isAutoPlaying && autoPlaySecondsLeft === 0) {
      endAutoPlaySession();
    }
  }, [isAutoPlaying, autoPlaySecondsLeft, endAutoPlaySession]);

      // Advisor: sends the current board to an x402-gated AI, paid per request with USDC
  // from the connected wallet's EIP-1193 provider.
  const askAdvisor = useCallback(async () => {
    try {
      const grid = tilesToGrid(tiles);
      let provider: any = null;
      let address: `0x${string}` | null = null;
      if (authenticated) {
        const embedded = wallets.find(w => w.walletClientType === 'privy');
        if (embedded) {
          provider = await embedded.getEthereumProvider();
          address = embedded.address as `0x${string}`;
        }
      } else if (typeof window !== 'undefined' && (window as any).ethereum) {
        provider = (window as any).ethereum;
        address = (baseAddress || selfPayAddress || '') as `0x${string}`;
      }
      if (!provider || !address) {
        throw new Error('Connect a wallet with an EIP-1193 provider to pay via x402.');
      }

      // Pre-flight balance check: the advisor is paid in USDC on Base via x402.
      // If the paying wallet holds less than the minimum, bail out with a clear
      // error instead of letting the x402 payment fail silently (blank result).
      const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      const MIN_USDC = 0.003;
      try {
        const usdcProvider = new ethers.JsonRpcProvider('https://mainnet.base.org');
        const usdc = new ethers.Contract(
          USDC_BASE_ADDRESS,
          ['function balanceOf(address) view returns (uint256)'],
          usdcProvider
        );
        const usdcRaw = await usdc.balanceOf(address);
        const usdcBalance = Number(ethers.formatUnits(usdcRaw, 6)); // USDC has 6 decimals
        if (usdcBalance < MIN_USDC) {
          throw new Error(
            `Insufficient USDC balance to run AI inference. You have ${usdcBalance.toFixed(4)} USDC ` +
            `but need at least ${MIN_USDC} USDC on Base. Please top up USDC in this wallet and try again.`
          );
        }
      } catch (balErr) {
        // Re-throw our own insufficient-balance error; swallow only RPC read failures.
        if (balErr instanceof Error && balErr.message.includes('Insufficient USDC')) {
          throw balErr;
        }
        console.warn('[v0] USDC balance pre-check failed (continuing):', balErr);
      }

      const { askX402Advisor } = await import('@/lib/x402Advisor');
      const result = await askX402Advisor({ provider, address, grid, score });
      return { direction: result.direction, reason: result.reason };
    } catch (err) {
      throw err;
    }
  }, [tiles, score, authenticated, wallets, baseAddress, selfPayAddress]);


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
    <div className="h-[100dvh] overflow-hidden bg-background px-4 py-3 flex flex-col">
      <SwapModal 
        walletAddress={walletAddr} 
        onSwapSuccess={handleRefreshBalance}
        sendTransaction={swapSendTransaction}
        // Only pass the Privy embedded wallet when Privy is the active connection.
        // For self-pay we leave this empty so the swap signs from the self-pay wallet.
        embeddedWalletAddress={isSelfPayConnected ? '' : embeddedWalletAddress}
      />
      
      <div ref={containerRef} className="max-w-lg w-full mx-auto flex flex-col gap-2 animate-fade-in min-h-0 flex-1">
        {/* Compact header: title + user, inline scores, disconnect */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-4xl font-display font-bold gradient-text leading-none">2048</h1>
            <p className="text-[11px] text-muted-foreground font-mono truncate">
              {userDisplay} · {connectionType}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="glass-card rounded-lg px-2.5 py-1 text-center">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground leading-none">Score</div>
              <div className="text-sm font-display font-bold text-foreground leading-tight">{score}</div>
            </div>
            <div className="glass-card rounded-lg px-2.5 py-1 text-center">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground leading-none">Best</div>
              <div className="text-sm font-display font-bold text-foreground leading-tight">{highScore}</div>
            </div>
            <Button
              onClick={handleDisconnect}
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Exit
            </Button>
          </div>
        </div>

        {/* AI ring + advisor */}
        <div className="glass-card rounded-xl px-3 py-2.5">
          <AIModePanel
            cycleProgress={cycleProgress}
            unlockAt={AI_UNLOCK_MOVES}
            isUnlocked={isAIUnlocked}
            isAutoPlaying={isAutoPlaying}
            tier={aiTier}
            autoPlaySeconds={autoPlaySeconds}
            secondsLeft={autoPlaySecondsLeft}
            onToggleAutoPlay={toggleAutoPlay}
            onAskAdvisor={askAdvisor}
          />
        </div>

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

        {/* Low-balance error banner */}
        {lowBalanceError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{lowBalanceError}</span>
          </div>
        )}

        <Card className="p-2.5 glass-card flex flex-col items-center">
          <GameBoard
            tiles={tiles}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            cellSize={cellSize}
          />

          {gameOver && (
            <div className="text-center mt-2">
              <div className="text-base font-display font-bold text-destructive">Game Over</div>
            </div>
          )}

          <Button
            onClick={handleNewGame}
            className="w-full mt-2 gradient-btn text-foreground font-display font-semibold h-8"
            disabled={isProcessing}
          >
            New Game
          </Button>

          <p className="text-[10px] text-center text-muted-foreground mt-1.5 font-body">
            Swipe or arrows · 10 $B20 or {MOVE_COST_ETH} ETH per move
          </p>
        </Card>
      </div>
    </div>
  );
}

