import { useState } from 'react';
import { Sparkles, Bot, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Direction } from '@/types/game';

interface AIModePanelProps {
  /** Manual moves completed in the current recharge cycle (0..unlockAt) */
  cycleProgress: number;
  unlockAt: number;
  isUnlocked: boolean;
  isAutoPlaying: boolean;
  tier: number;
  /** Total seconds granted per auto-play session at the current tier */
  autoPlaySeconds: number;
  /** Seconds remaining in the active auto-play session */
  secondsLeft: number;
  onToggleAutoPlay: () => void;
  onAskAdvisor: () => Promise<{ direction: Direction | null; reason: string } | null>;
}

export function AIModePanel({
  cycleProgress,
  unlockAt,
  isUnlocked,
  isAutoPlaying,
  tier,
  autoPlaySeconds,
  secondsLeft,
  onToggleAutoPlay,
  onAskAdvisor,
}: AIModePanelProps) {
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advice, setAdvice] = useState<{ direction: Direction | null; reason: string } | null>(null);
  const [advisorError, setAdvisorError] = useState<string>('');

  // The ring shows the session timer while auto-playing, otherwise the
  // recharge progress toward the next unlock.
  const pct = isAutoPlaying
    ? (autoPlaySeconds > 0 ? Math.min(100, (secondsLeft / autoPlaySeconds) * 100) : 0)
    : Math.min(100, (cycleProgress / unlockAt) * 100);

  // Boxed (robot-head) progress math. We normalize the rounded-rectangle
  // outline to a pathLength of 100 so the stroke offset maps directly to the
  // percentage, no perimeter arithmetic required.
  const size = 56;
  const stroke = 4;
  const inset = stroke / 2;
  const boxSide = size - stroke;
  const boxRadius = 14;

  const handleClickRing = () => {
    if (!isUnlocked) return;
    onToggleAutoPlay();
  };

  const askAdvisor = async () => {
    setAdvisorOpen(true);
    setAdvice(null);
    setAdvisorError('');
    setAdvisorLoading(true);
    try {
      const result = await onAskAdvisor();
      if (!result) throw new Error('Advisor unavailable for this wallet type.');
      setAdvice(result);
    } catch (err) {
      setAdvisorError(err instanceof Error ? err.message : 'Failed to reach the AI advisor.');
    } finally {
      setAdvisorLoading(false);
    }
  };

  const ringColor = isUnlocked
    ? 'url(#aiGradient)'
    : 'hsl(var(--muted-foreground) / 0.4)';
  const iconColor = isUnlocked ? 'text-primary' : 'text-muted-foreground/60';

  return (
    <>
      <div className="flex items-center gap-3">
        {/* Circular progress + icon (tap to toggle auto-play when unlocked) */}
        <button
          onClick={handleClickRing}
          disabled={!isUnlocked}
          aria-label={
            !isUnlocked
              ? `AI locked — ${unlockAt - cycleProgress} moves to go`
              : isAutoPlaying
                ? 'Stop AI auto-play'
                : 'Start AI auto-play'
          }
          className={cn(
            'relative shrink-0 rounded-xl transition-transform',
            isUnlocked && 'hover:scale-105 active:scale-95 cursor-pointer',
            !isUnlocked && 'cursor-not-allowed',
            isAutoPlaying && 'animate-pulse-glow',
          )}
          style={{ width: size, height: size }}
        >
          <svg width={size} height={size}>
            <defs>
              <linearGradient id="aiGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(var(--game-gradient-start))" />
                <stop offset="100%" stopColor="hsl(var(--game-gradient-end))" />
              </linearGradient>
            </defs>
            {/* Boxed robot-head track */}
            <rect
              x={inset}
              y={inset}
              width={boxSide}
              height={boxSide}
              rx={boxRadius}
              ry={boxRadius}
              fill="none"
              stroke="hsl(var(--secondary))"
              strokeWidth={stroke}
            />
            {/* Progress outline (pathLength normalized to 100) */}
            <rect
              x={inset}
              y={inset}
              width={boxSide}
              height={boxSide}
              rx={boxRadius}
              ry={boxRadius}
              fill="none"
              stroke={ringColor}
              strokeWidth={stroke}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={100}
              strokeDashoffset={100 - pct}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {isAutoPlaying ? (
              <Zap className={cn('h-5 w-5', iconColor)} />
            ) : (
              <Bot className={cn('h-5 w-5', iconColor)} />
            )}
          </div>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary" />
            <span className="text-xs font-display font-semibold">AI Mode · T{tier}</span>
          </div>
          <div className="text-[11px] text-muted-foreground font-mono truncate">
            {isAutoPlaying
              ? `Playing… ${secondsLeft}s left`
              : isUnlocked
                ? `Tap to auto-play ${autoPlaySeconds}s`
                : `${cycleProgress}/${unlockAt} · unlocks ${autoPlaySeconds}s`}
          </div>
        </div>

        <Button
          onClick={askAdvisor}
          size="sm"
          variant="outline"
          className="font-body h-8 px-2.5 text-xs"
        >
          <Sparkles className="h-3.5 w-3.5 mr-1" />
          Ask
        </Button>
      </div>

      <Dialog open={advisorOpen} onOpenChange={setAdvisorOpen}>
        <DialogContent className="glass-card">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> AI Advisor
            </DialogTitle>
            <DialogDescription className="font-body text-xs">
              Powered by BlockRun · paid via x402 (USDC on Base) from your connected wallet.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-[100px] text-sm font-body">
            {advisorLoading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Signing x402 payment & thinking…
              </div>
            )}
            {advisorError && <div className="text-destructive whitespace-pre-wrap">{advisorError}</div>}
            {!advisorLoading && !advisorError && advice && (
              <div className="space-y-3">
                {advice.direction && (
                  <div className="text-2xl font-display font-bold gradient-text uppercase">
                    → {advice.direction}
                  </div>
                )}
                <div className="text-muted-foreground whitespace-pre-wrap">{advice.reason}</div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
