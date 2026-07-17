import { useState } from 'react';
import { Sparkles, Bot, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

interface AIModePanelProps {
  moveCount: number;
  unlockAt: number;
  isUnlocked: boolean;
  isAutoPlaying: boolean;
  onToggleAutoPlay: () => void;
  boardTiles: { row: number; col: number; value: number }[];
  score: number;
}

export function AIModePanel({
  moveCount,
  unlockAt,
  isUnlocked,
  isAutoPlaying,
  onToggleAutoPlay,
  boardTiles,
  score,
}: AIModePanelProps) {
  const progress = Math.min(100, (moveCount / unlockAt) * 100);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advice, setAdvice] = useState<string>('');
  const [advisorError, setAdvisorError] = useState<string>('');

  const askAdvisor = async () => {
    setAdvisorOpen(true);
    setAdvice('');
    setAdvisorError('');
    setAdvisorLoading(true);
    try {
      const grid: number[][] = Array.from({ length: 4 }, () => Array(4).fill(0));
      boardTiles.forEach((t) => (grid[t.row][t.col] = t.value));

      const { data, error } = await supabase.functions.invoke('ai-2048-advisor', {
        body: { grid, score },
      });
      if (error) throw error;
      setAdvice(data?.advice ?? 'No advice available.');
    } catch (err) {
      setAdvisorError(err instanceof Error ? err.message : 'Failed to reach the AI advisor.');
    } finally {
      setAdvisorLoading(false);
    }
  };

  return (
    <>
      <Card className="p-4 glass-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-display font-semibold text-sm">AI Mode</span>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {isUnlocked ? 'Unlocked' : `${moveCount}/${unlockAt} moves`}
          </span>
        </div>

        <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {!isUnlocked ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-body">
            <Lock className="h-3 w-3" />
            Play {unlockAt - moveCount} more moves to unlock the Claude assistant.
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              onClick={onToggleAutoPlay}
              size="sm"
              variant={isAutoPlaying ? 'destructive' : 'default'}
              className="flex-1 font-body"
            >
              <Bot className="h-4 w-4 mr-1" />
              {isAutoPlaying ? 'Stop Auto-Play' : 'AI Auto-Play'}
            </Button>
            <Button onClick={askAdvisor} size="sm" variant="outline" className="flex-1 font-body">
              <Sparkles className="h-4 w-4 mr-1" />
              Ask Advisor
            </Button>
          </div>
        )}
      </Card>

      <Dialog open={advisorOpen} onOpenChange={setAdvisorOpen}>
        <DialogContent className="glass-card">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> AI Advisor
            </DialogTitle>
            <DialogDescription className="font-body">
              A Claude-style AI reviews your current board and suggests your next best move.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-[100px] text-sm font-body whitespace-pre-wrap">
            {advisorLoading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
              </div>
            )}
            {advisorError && <div className="text-destructive">{advisorError}</div>}
            {!advisorLoading && !advisorError && advice}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
