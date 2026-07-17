import { Direction } from '@/types/game';

// Lightweight 2048 AI using 1-ply move eval + expectimax lookahead.
// Fast enough to pick a move within a few ms so auto-play stays smooth.

type Grid = number[][];

function cloneGrid(g: Grid): Grid {
  return g.map((r) => r.slice());
}

function slideRowLeft(row: number[]): { row: number[]; moved: boolean; points: number } {
  const nz = row.filter((v) => v !== 0);
  const out: number[] = [];
  let points = 0;
  let i = 0;
  while (i < nz.length) {
    if (i + 1 < nz.length && nz[i] === nz[i + 1]) {
      const m = nz[i] * 2;
      out.push(m);
      points += m;
      i += 2;
    } else {
      out.push(nz[i]);
      i++;
    }
  }
  while (out.length < 4) out.push(0);
  const moved = JSON.stringify(out) !== JSON.stringify(row);
  return { row: out, moved, points };
}

function rotate(g: Grid): Grid {
  const n = Array.from({ length: 4 }, () => Array(4).fill(0));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) n[j][3 - i] = g[i][j];
  return n;
}

export function simulateMove(grid: Grid, dir: Direction): { grid: Grid; moved: boolean; points: number } {
  let rot = 0;
  if (dir === 'left') rot = 0;
  else if (dir === 'down') rot = 1;
  else if (dir === 'right') rot = 2;
  else if (dir === 'up') rot = 3;

  let g = cloneGrid(grid);
  for (let i = 0; i < rot; i++) g = rotate(g);
  let anyMoved = false;
  let totalPts = 0;
  for (let i = 0; i < 4; i++) {
    const { row, moved, points } = slideRowLeft(g[i]);
    g[i] = row;
    if (moved) anyMoved = true;
    totalPts += points;
  }
  const back = (4 - rot) % 4;
  for (let i = 0; i < back; i++) g = rotate(g);
  return { grid: g, moved: anyMoved, points: totalPts };
}

function emptyCells(g: Grid): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (g[r][c] === 0) out.push([r, c]);
  return out;
}

// Heuristic favoring: empties, monotonic rows/cols, max in corner, low smoothness cost.
function evalGrid(g: Grid): number {
  let empty = 0;
  let max = 0;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      if (g[r][c] === 0) empty++;
      if (g[r][c] > max) max = g[r][c];
    }

  // Monotonicity (prefer values decreasing toward a corner)
  let mono = 0;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const a = g[r][c] ? Math.log2(g[r][c]) : 0;
      const b = g[r][c + 1] ? Math.log2(g[r][c + 1]) : 0;
      mono += a >= b ? a - b : -(b - a) * 1.2;
    }
  }
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 3; r++) {
      const a = g[r][c] ? Math.log2(g[r][c]) : 0;
      const b = g[r + 1][c] ? Math.log2(g[r + 1][c]) : 0;
      mono += a >= b ? a - b : -(b - a) * 1.2;
    }
  }

  // Max in a corner is a bonus
  const cornerBonus = [g[0][0], g[0][3], g[3][0], g[3][3]].includes(max) ? Math.log2(max || 2) * 2 : 0;

  return empty * 2.7 + mono * 1.0 + cornerBonus + Math.log2(max || 2) * 0.5;
}

function expectimax(g: Grid, depth: number, isPlayer: boolean): number {
  if (depth === 0) return evalGrid(g);
  if (isPlayer) {
    let best = -Infinity;
    let any = false;
    for (const d of ['up', 'down', 'left', 'right'] as Direction[]) {
      const { grid, moved } = simulateMove(g, d);
      if (!moved) continue;
      any = true;
      const s = expectimax(grid, depth - 1, false);
      if (s > best) best = s;
    }
    return any ? best : evalGrid(g) - 100;
  } else {
    const empties = emptyCells(g);
    if (empties.length === 0) return evalGrid(g);
    // Sample: consider up to 6 empties to keep it fast
    const sample = empties.length > 6 ? empties.slice(0, 6) : empties;
    let sum = 0;
    for (const [r, c] of sample) {
      for (const [v, p] of [
        [2, 0.9],
        [4, 0.1],
      ] as [number, number][]) {
        g[r][c] = v;
        sum += p * expectimax(g, depth - 1, true);
        g[r][c] = 0;
      }
    }
    return sum / sample.length;
  }
}

export function bestMove(grid: Grid): Direction | null {
  let best: Direction | null = null;
  let bestScore = -Infinity;
  // Adapt depth to board fullness
  const emp = emptyCells(grid).length;
  const depth = emp > 8 ? 2 : emp > 4 ? 3 : 4;
  for (const d of ['up', 'left', 'right', 'down'] as Direction[]) {
    const { grid: g, moved, points } = simulateMove(grid, d);
    if (!moved) continue;
    const s = points * 0.1 + expectimax(g, depth - 1, false);
    if (s > bestScore) {
      bestScore = s;
      best = d;
    }
  }
  return best;
}

export function tilesToGrid(tiles: { row: number; col: number; value: number }[]): Grid {
  const g: Grid = Array.from({ length: 4 }, () => Array(4).fill(0));
  for (const t of tiles) g[t.row][t.col] = t.value;
  return g;
}
