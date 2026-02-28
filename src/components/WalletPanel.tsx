import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExportWalletButton } from '@/components/ExportWalletButton';

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
}: WalletPanelProps) {
  const actualMoves = remainingMoves - optimisticMovesUsed;
  const balanceUsd = (parseFloat(balance) * ethPrice).toFixed(2);

  return (
    <Card className="p-4 space-y-3 glass-card">
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted-foreground font-body">Wallet Balance</span>
        <div className="flex gap-2">
          {showExport && <ExportWalletButton />}
          <Button
            onClick={onRefresh}
            variant="outline"
            size="sm"
            disabled={isRefreshing}
            className="border-border bg-secondary text-secondary-foreground hover:bg-muted"
          >
            {isRefreshing ? '⟳' : '↻'}
          </Button>
        </div>
      </div>

      <div className="text-xs font-mono text-muted-foreground break-all">
        {walletAddress}
      </div>

      <div className="flex justify-between items-center">
        <div>
          <div className="text-xl font-display font-bold text-foreground">
            {parseFloat(balance).toFixed(6)} ETH
          </div>
          <div className="text-sm text-muted-foreground">≈ ${balanceUsd}</div>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Moves Left</div>
          <div className="text-2xl font-display font-bold text-foreground">
            {actualMoves}
            {pendingTransactions.length > 0 && (
              <span className="text-xs text-muted-foreground ml-2 block">
                ({pendingTransactions.length} pending)
              </span>
            )}
          </div>
        </div>
      </div>

      {actualMoves <= 3 && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-lg">
          {actualMoves <= 0 
            ? 'Fund your wallet to continue playing'
            : `Low balance! Only ${actualMoves} move${actualMoves === 1 ? '' : 's'} remaining. Fund your wallet to continue.`
          }
        </div>
      )}
    </Card>
  );
}
