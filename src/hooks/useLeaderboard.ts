import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ScoreEntry {
  address: string;
  score: number;
}

export interface HolderEntry {
  address: string;
  balance: number;
}

const B20_DECIMALS = 18;

function toTokens(balanceWei: string | number): number {
  const raw = String(balanceWei ?? '0');
  // Postgres numerics can arrive as plain digits or in exponential notation.
  if (/^\d+$/.test(raw)) {
    try {
      const wei = BigInt(raw);
      const base = BigInt(10) ** BigInt(B20_DECIMALS);
      return Number(wei / base) + Number(wei % base) / 1e18;
    } catch {
      /* fall through */
    }
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n / 1e18 : 0;
}


/** Live top-scores leaderboard, kept in sync through realtime updates. */
export function useHighScoreLeaderboard(limit = 10) {
  const [entries, setEntries] = useState<ScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('high_scores')
      .select('address,score')
      .order('score', { ascending: false })
      .limit(limit);
    setEntries((data ?? []).map((r) => ({ address: r.address, score: r.score })));
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel('high_scores_leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'high_scores' }, () => {
        void load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { entries, loading, refresh: load };
}

/** Live $B20 holder leaderboard, sourced from on-chain balances via the indexer. */
export function useB20Leaderboard(limit = 10) {
  const [entries, setEntries] = useState<HolderEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('b20_holders')
      .select('address,balance_wei')
      .order('balance_wei', { ascending: false })
      .limit(limit);
    setEntries((data ?? []).map((r) => ({ address: r.address, balance: toTokens(r.balance_wei as never) })));
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    void load();
    // Ask the indexer for a fresh on-chain snapshot (throttled server-side).
    void supabase.functions.invoke('index-b20-holders').catch(() => undefined);

    const channel = supabase
      .channel('b20_holders_leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'b20_holders' }, () => {
        void load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { entries, loading, refresh: load };
}

/** Publish a player's best score so it appears on the live leaderboard. */
export async function submitHighScore(address: string, score: number) {
  if (!address || score <= 0) return;
  const addr = address.toLowerCase();
  const { data: existing } = await supabase
    .from('high_scores')
    .select('id,score')
    .eq('address', addr)
    .maybeSingle();

  if (!existing) {
    await supabase.from('high_scores').insert({ address: addr, score });
    return;
  }
  if (score > existing.score) {
    await supabase.from('high_scores').update({ score }).eq('id', existing.id);
  }
}
