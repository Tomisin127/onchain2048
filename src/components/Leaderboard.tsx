import { useState } from 'react';
import { Trophy, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useB20Leaderboard, useHighScoreLeaderboard } from '@/hooks/useLeaderboard';

function shortAddr(a: string) {
  if (!a) return '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

const MEDAL = [
  'text-[hsl(45_93%_58%)]', // gold
  'text-[hsl(220_9%_72%)]', // silver
  'text-[hsl(28_65%_48%)]', // bronze
];

function Rank({ index }: { index: number }) {
  if (index < 3) {
    return <Trophy className={cn('h-4 w-4 shrink-0', MEDAL[index])} aria-hidden />;
  }
  return (
    <span className="w-4 shrink-0 text-center text-[11px] font-mono text-muted-foreground">
      {index + 1}
    </span>
  );
}

function Row({
  index,
  address,
  value,
  highlight,
}: {
  index: number;
  address: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-lg px-2 py-1.5',
        index < 3 && 'bg-secondary/40',
        highlight && 'ring-1 ring-primary/60',
      )}
    >
      <Rank index={index} />
      <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
        {shortAddr(address)}
      </span>
      <span className="font-display text-sm font-semibold text-foreground">{value}</span>
    </li>
  );
}

/** Keep huge holder balances readable inside the compact row. */
function formatAmount(n: number) {
  if (n >= 1_000_000) {
    return n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 2 });
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function Empty({ label }: { label: string }) {
  return <p className="py-4 text-center text-xs text-muted-foreground font-body">{label}</p>;
}

interface LeaderboardProps {
  currentAddress?: string;
  className?: string;
  limit?: number;
  /** Render as an expandable section that collapses to just the header. */
  collapsible?: boolean;
  /** Whether a collapsible leaderboard starts expanded. */
  defaultOpen?: boolean;
}

export function Leaderboard({
  currentAddress = '',
  className,
  limit = 10,
  collapsible = false,
  defaultOpen = true,
}: LeaderboardProps) {
  const [open, setOpen] = useState(!collapsible || defaultOpen);
  const { entries: scores, loading: loadingScores } = useHighScoreLeaderboard(limit);
  const { entries: holders, loading: loadingHolders } = useB20Leaderboard(limit);
  const me = currentAddress.toLowerCase();

  const header = (
    <span className="flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
      <Trophy className="h-4 w-4 text-primary" aria-hidden />
      Leaderboard
    </span>
  );

  return (
    <section className={cn('glass-card rounded-xl p-3', className)} aria-label="Leaderboard">
      {/* TabsList must live inside <Tabs>, so the whole header row sits within it */}
      <Tabs defaultValue="scores">
        <div className="flex items-center justify-between gap-2">
          {collapsible ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="flex items-center gap-1.5 font-display text-sm font-bold text-foreground transition-colors hover:text-primary"
            >
              {header}
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  open && 'rotate-180',
                )}
                aria-hidden
              />
            </button>
          ) : (
            header
          )}

          {open && (
            <TabsList className="h-7">
              <TabsTrigger value="scores" className="h-6 px-2 text-[11px]">
                High Scores
              </TabsTrigger>
              <TabsTrigger value="holders" className="h-6 px-2 text-[11px]">
                $B20 Holders
              </TabsTrigger>
            </TabsList>
          )}
        </div>

        {open && (
          <>
            <TabsContent value="scores" className="mt-2">
              {loadingScores ? (
                <Empty label="Loading scores…" />
              ) : scores.length === 0 ? (
                <Empty label="No scores yet — be the first!" />
              ) : (
                <ol className="space-y-1">
                  {scores.map((s, i) => (
                    <Row
                      key={s.address}
                      index={i}
                      address={s.address}
                      value={s.score.toLocaleString()}
                      highlight={!!me && s.address.toLowerCase() === me}
                    />
                  ))}
                </ol>
              )}
            </TabsContent>

            <TabsContent value="holders" className="mt-2">
              {loadingHolders ? (
                <Empty label="Reading balances from Base…" />
              ) : holders.length === 0 ? (
                <Empty label="Holder data syncing from the chain…" />
              ) : (
                <ol className="space-y-1">
                  {holders.map((h, i) => (
                    <Row
                      key={h.address}
                      index={i}
                      address={h.address}
                      value={`${formatAmount(h.balance)} B20`}
                      highlight={!!me && h.address.toLowerCase() === me}
                    />
                  ))}
                </ol>
              )}
            </TabsContent>
          </>
        )}
      </Tabs>
    </section>
  );
}
