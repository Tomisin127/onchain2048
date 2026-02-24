import { useState, useCallback, useEffect, useRef } from 'react';
import { TileData, Direction } from '@/types/game';

let tileIdCounter = 0;
const nextId = () => ++tileIdCounter;

function createEmptyGrid(): number[][] {
  return Array(4).fill(null).map(() => Array(4).fill(0));
}

function addRandomTile(grid: number[][]): [number, number] | null {
  const empty: [number, number][] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid[r][c] === 0) empty.push([r, c]);
    }
  }
  if (empty.length === 0) return null;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  grid[r][c] = Math.random() < 0.9 ? 2 : 4;
  return [r, c];
}

function hasValidMoves(grid: number[][]): boolean {
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid[r][c] === 0) return true;
      if (c < 3 && grid[r][c] === grid[r][c + 1]) return true;
      if (r < 3 && grid[r][c] === grid[r + 1][c]) return true;
    }
  }
  return false;
}

// Slide a single row to the left, tracking where each tile moved from
function slideRowLeft(row: number[]): { result: number[]; points: number; moved: boolean; mergedIndices: Set<number> } {
  const nonZero = row.filter(v => v !== 0);
  const result: number[] = [];
  const mergedIndices = new Set<number>();
  let points = 0;
  let i = 0;

  while (i < nonZero.length) {
    if (i + 1 < nonZero.length && nonZero[i] === nonZero[i + 1]) {
      const merged = nonZero[i] * 2;
      result.push(merged);
      mergedIndices.add(result.length - 1);
      points += merged;
      i += 2;
    } else {
      result.push(nonZero[i]);
      i++;
    }
  }

  while (result.length < 4) result.push(0);

  const moved = JSON.stringify(result) !== JSON.stringify(row);
  return { result, points, moved, mergedIndices };
}

export function use2048Game() {
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [lastDirection, setLastDirection] = useState<Direction | null>(null);
  const gridRef = useRef<number[][]>(createEmptyGrid());

  // Convert grid to tile data array
  const gridToTiles = useCallback((grid: number[][], prevTiles: TileData[], direction: Direction | null, newTilePos: [number, number] | null, mergedPositions: Set<string>): TileData[] => {
    const result: TileData[] = [];
    
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (grid[r][c] === 0) continue;
        
        const isNew = newTilePos !== null && newTilePos[0] === r && newTilePos[1] === c;
        const isMerged = mergedPositions.has(`${r}-${c}`);
        
        // Find where this tile came from
        let prevRow = r;
        let prevCol = c;
        
        if (!isNew && direction) {
          // Find the closest previous tile with same value in the opposite direction
          const existingPrev = prevTiles.find(t => t.row === r && t.col === c && t.value === grid[r][c]);
          if (existingPrev) {
            prevRow = r;
            prevCol = c;
          } else {
            // Tile moved here from somewhere else - calculate from direction
            switch (direction) {
              case 'left':
                // Tiles came from the right
                for (let pc = c + 1; pc < 4; pc++) {
                  const prev = prevTiles.find(t => t.row === r && t.col === pc);
                  if (prev) { prevCol = pc; break; }
                }
                break;
              case 'right':
                for (let pc = c - 1; pc >= 0; pc--) {
                  const prev = prevTiles.find(t => t.row === r && t.col === pc);
                  if (prev) { prevCol = pc; break; }
                }
                break;
              case 'up':
                for (let pr = r + 1; pr < 4; pr++) {
                  const prev = prevTiles.find(t => t.row === pr && t.col === c);
                  if (prev) { prevRow = pr; break; }
                }
                break;
              case 'down':
                for (let pr = r - 1; pr >= 0; pr--) {
                  const prev = prevTiles.find(t => t.row === pr && t.col === c);
                  if (prev) { prevRow = pr; break; }
                }
                break;
            }
          }
        }
        
        result.push({
          id: nextId(),
          value: grid[r][c],
          row: r,
          col: c,
          previousRow: isNew ? r : prevRow,
          previousCol: isNew ? c : prevCol,
          isNew,
          isMerged,
        });
      }
    }
    
    return result;
  }, []);

  const initGame = useCallback(() => {
    tileIdCounter = 0;
    const grid = createEmptyGrid();
    addRandomTile(grid);
    addRandomTile(grid);
    gridRef.current = grid;
    
    const initialTiles: TileData[] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (grid[r][c] !== 0) {
          initialTiles.push({
            id: nextId(),
            value: grid[r][c],
            row: r,
            col: c,
            previousRow: r,
            previousCol: c,
            isNew: true,
            isMerged: false,
          });
        }
      }
    }
    
    setTiles(initialTiles);
    setScore(0);
    setGameOver(false);
    setLastDirection(null);
  }, []);

  // Load high score
  useEffect(() => {
    const saved = localStorage.getItem('highScore2048');
    if (saved) setHighScore(parseInt(saved));
    initGame();
  }, [initGame]);

  // Update high score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('highScore2048', score.toString());
    }
  }, [score, highScore]);

  const makeMove = useCallback((direction: Direction): { moved: boolean; points: number } => {
    if (gameOver) return { moved: false, points: 0 };

    const grid = gridRef.current.map(row => [...row]);
    let totalPoints = 0;
    let anyMoved = false;
    const mergedPositions = new Set<string>();

    // Transform grid based on direction, always process as left slide
    const processGrid = (g: number[][]): number[][] => {
      switch (direction) {
        case 'left': return g;
        case 'right': return g.map(row => [...row].reverse());
        case 'up': {
          const transposed = createEmptyGrid();
          for (let r = 0; r < 4; r++)
            for (let c = 0; c < 4; c++)
              transposed[c][r] = g[r][c];
          return transposed;
        }
        case 'down': {
          const transposed = createEmptyGrid();
          for (let r = 0; r < 4; r++)
            for (let c = 0; c < 4; c++)
              transposed[3 - c][r] = g[r][c];
          return transposed;
        }
      }
    };

    const unprocessGrid = (g: number[][], mergedSet: Set<string>): { grid: number[][]; mergedPositions: Set<string> } => {
      const result = createEmptyGrid();
      const newMerged = new Set<string>();
      
      switch (direction) {
        case 'left':
          for (let r = 0; r < 4; r++)
            for (let c = 0; c < 4; c++) {
              result[r][c] = g[r][c];
              if (mergedSet.has(`${r}-${c}`)) newMerged.add(`${r}-${c}`);
            }
          break;
        case 'right':
          for (let r = 0; r < 4; r++)
            for (let c = 0; c < 4; c++) {
              result[r][3 - c] = g[r][c];
              if (mergedSet.has(`${r}-${c}`)) newMerged.add(`${r}-${3 - c}`);
            }
          break;
        case 'up':
          for (let r = 0; r < 4; r++)
            for (let c = 0; c < 4; c++) {
              result[c][r] = g[r][c];
              if (mergedSet.has(`${r}-${c}`)) newMerged.add(`${c}-${r}`);
            }
          break;
        case 'down':
          for (let r = 0; r < 4; r++)
            for (let c = 0; c < 4; c++) {
              result[c][3 - r] = g[r][c];
              if (mergedSet.has(`${r}-${c}`)) newMerged.add(`${c}-${3 - r}`);
            }
          break;
      }
      return { grid: result, mergedPositions: newMerged };
    };

    const processed = processGrid(grid);
    const rawMergedPositions = new Set<string>();
    
    for (let r = 0; r < 4; r++) {
      const { result, points, moved, mergedIndices } = slideRowLeft(processed[r]);
      processed[r] = result;
      totalPoints += points;
      if (moved) anyMoved = true;
      mergedIndices.forEach(idx => rawMergedPositions.add(`${r}-${idx}`));
    }

    if (!anyMoved) return { moved: false, points: 0 };

    const { grid: finalGrid, mergedPositions: finalMerged } = unprocessGrid(processed, rawMergedPositions);
    
    const newTilePos = addRandomTile(finalGrid);
    gridRef.current = finalGrid;

    const prevTiles = tiles;
    const newTiles = gridToTiles(finalGrid, prevTiles, direction, newTilePos, finalMerged);
    
    setTiles(newTiles);
    setScore(prev => prev + totalPoints);
    setLastDirection(direction);

    if (!hasValidMoves(finalGrid)) {
      setGameOver(true);
    }

    return { moved: true, points: totalPoints };
  }, [gameOver, tiles, gridToTiles]);

  return {
    tiles,
    score,
    highScore,
    gameOver,
    lastDirection,
    makeMove,
    initGame,
  };
}
