import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ScorePanelProps {
  score: number;
  highScore: number;
}

export function ScorePanel({ score, highScore }: ScorePanelProps) {
  return (
    <Card className="p-4 glass-card">
      <div className="flex justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-body">Score</div>
          <div className="text-3xl font-display font-bold text-foreground">{score}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-body">Best</div>
          <div className="text-3xl font-display font-bold text-foreground">{highScore}</div>
        </div>
      </div>
    </Card>
  );
}
