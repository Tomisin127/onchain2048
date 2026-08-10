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
  try {
    const wei = BigInt(String(balanceWei).split('.')[0]);
    const whole = wei / BigInt(10) ** BigInt(B20_DECIMALS);
    const frac = wei % BigInt(10) ** BigInt(B20_DECIMALS);
    return Number(whole) + Number(frac) / 1e18;
  } catch {
    return 0;
  }
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
