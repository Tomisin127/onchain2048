import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { use2048Game } from '@/hooks/use2048Game';
import { highScoreKey, loadHighScore, saveHighScore } from '@/lib/highScore';

const WALLET_A = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const WALLET_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('per-wallet high scores', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads a high score under the wallet address', () => {
    saveHighScore(WALLET_A, 1234);
    expect(localStorage.getItem(highScoreKey(WALLET_A))).toBe('1234');
    expect(loadHighScore(WALLET_A)).toBe(1234);
  });

  it('does not leak scores between wallets (regression: shared leaderboard scores)', () => {
    saveHighScore(WALLET_A, 5555);
    expect(loadHighScore(WALLET_B)).toBe(0);
  });

  it('ignores the legacy shared high score key', () => {
    localStorage.setItem('highScore2048', '9999');
    const { result } = renderHook(() => use2048Game(WALLET_A));
    expect(result.current.highScore).toBe(0);
  });

  it('loads the stored high score for the active wallet', () => {
    saveHighScore(WALLET_A, 777);
    const { result } = renderHook(() => use2048Game(WALLET_A.toLowerCase()));
    expect(result.current.highScore).toBe(777);
  });

  it('loads 0 when no wallet is connected', () => {
    const { result } = renderHook(() => use2048Game(undefined));
    expect(result.current.highScore).toBe(0);
  });
});
