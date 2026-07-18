import { useState } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExportWalletButton } from '@/components/ExportWalletButton';
import { cn } from '@/lib/utils';

interface WalletPanelProps {
  walletAddress: string;
  balance: string;
  ethPrice: number;
  remainingMoves: number;
  optimisticMovesUsed: number;
  pendingTransactions: string[];
  isRefreshing: boolean;
  onRefresh: () => void;
  showExport?: boolean;
  b20Balance?: string;
  paymentToken?: 'ETH' | 'B20';
  onchainScore?: number | null;
}

function shortAddr(a: string) {
  if (!a) return '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function WalletPanel({
  walletAddress,
  balance,
  ethPrice,
  remainingMoves,
  optimisticMovesUsed,
  pendingTransactions,
  isRefreshing,
  onRefresh,
  showExport = false,
  b20Balance = '0',
  paymentToken = 'ETH',
}: WalletPanelProps) {
  const actualMoves = remainingMoves - optimisticMovesUsed;
  const balanceUsd = (parseFloat(balance) * ethPrice).toFixed(2);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  return (
    <div className="glass-card rounded-xl px-3 py-2.5 flex items-center gap-3">
      {/* Address + copy */}
      <button
        onClick={copy}
        className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Copy wallet address"
      >
        {shortAddr(walletAddress)}
        {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
      </button>

      <div className="h-6 w-px bg-border" />

      {/* Balances */}
      <div className="flex-1 min-w-0 flex items-baseline gap-2 truncate">
        <span className="text-sm font-display font-semibold text-foreground">
          {parseFloat(balance).toFixed(4)}
        </span>
        <span className="text-[10px] text-muted-foreground">ETH</span>
        <span className="text-sm font-display font-semibold text-foreground">{b20Balance}</span>
        <span className="text-[10px] text-muted-foreground">B20</span>
      </div>

      {/* Moves left */}
      <div className="text-right shrink-0">
        <div className={cn(
          'text-sm font-display font-bold',
          actualMoves <= 3 ? 'text-destructive' : 'text-foreground'
        )}>
          {actualMoves}
          <span className="text-[10px] text-muted-foreground font-body ml-1">
            {paymentToken === 'B20' ? 'B20' : 'ETH'}
          </span>
        </div>
        {pendingTransactions.length > 0 && (
          <div className="text-[9px] text-muted-foreground">{pendingTransactions.length} pending</div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {showExport && <ExportWalletButton />}
        <Button
          onClick={onRefresh}
          variant="ghost"
          size="icon"
          disabled={isRefreshing}
          className="h-7 w-7"
          aria-label="Refresh balance"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
        </Button>
      </div>
    </div>
  );
}
