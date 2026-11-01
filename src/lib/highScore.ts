// High scores are scoped per wallet address. The old single shared localStorage
// key ("highScore2048") made every wallet on the same device publish the same
// best score, mixing players together on the leaderboard.
export function highScoreKey(address: string): string {
  return `highScore2048:${address.toLowerCase()}`;
}

export function loadHighScore(address?: string | null): number {
  if (!address) return 0;
  const raw = localStorage.getItem(highScoreKey(address));
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function saveHighScore(address: string | null | undefined, score: number): void {
  if (!address || score <= 0) return;
  localStorage.setItem(highScoreKey(address), String(score));
}
