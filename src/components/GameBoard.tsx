import { motion } from 'framer-motion';
import { TileData } from '@/types/game';

const DEFAULT_CELL_SIZE = 68; // px per cell
const GAP = 10; // px gap

function getTilePosition(index: number, cellSize: number): number {
  return index * (cellSize + GAP);
}

function getTileColorClass(value: number): string {
  const map: Record<number, string> = {
    2: 'bg-tile-2',
    4: 'bg-tile-4',
    8: 'bg-tile-8',
    16: 'bg-tile-16',
    32: 'bg-tile-32',
    64: 'bg-tile-64',
    128: 'bg-tile-128 animate-sparkle',
    256: 'bg-tile-256 animate-sparkle',
    512: 'bg-tile-512 animate-sparkle',
    1024: 'bg-tile-1024 animate-sparkle',
    2048: 'bg-tile-2048 animate-sparkle',
  };
  return map[value] || 'bg-accent animate-sparkle';
}

function getFontSize(value: number): string {
  if (value >= 1024) return 'text-lg';
  if (value >= 128) return 'text-xl';
  return 'text-2xl';
}

interface GameBoardProps {
  tiles: TileData[];
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  cellSize?: number;
}

export function GameBoard({ tiles, onTouchStart, onTouchEnd, cellSize = DEFAULT_CELL_SIZE }: GameBoardProps) {
  const boardSize = cellSize * 4 + GAP * 5;

  return (
    <div
      className="relative bg-game-board rounded-2xl touch-none select-none"
      style={{ width: boardSize, height: boardSize, padding: GAP }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Background grid cells */}
      {Array(16).fill(0).map((_, i) => {
        const row = Math.floor(i / 4);
        const col = i % 4;
        return (
          <div
            key={`cell-${i}`}
            className="absolute rounded-xl bg-game-cell"
            style={{
              width: cellSize,
              height: cellSize,
              left: GAP + getTilePosition(col, cellSize),
              top: GAP + getTilePosition(row, cellSize),
            }}
          />
        );
      })}

      {/* Animated tiles */}
      {tiles.map((tile) => (
        <motion.div
          key={tile.id}
          className={`absolute rounded-xl flex items-center justify-center font-display font-bold text-foreground shadow-lg ${getTileColorClass(tile.value)} ${getFontSize(tile.value)} ${tile.value === 2048 ? 'ring-2 ring-tile-2048' : ''}`}
          style={{
            width: cellSize,
            height: cellSize,
          }}
          initial={
            tile.isNew
              ? {
                  left: GAP + getTilePosition(tile.col, cellSize),
                  top: GAP + getTilePosition(tile.row, cellSize),
                  scale: 0,
                  opacity: 0,
                }
              : {
                  left: GAP + getTilePosition(tile.previousCol, cellSize),
                  top: GAP + getTilePosition(tile.previousRow, cellSize),
                  scale: 1,
                  opacity: 1,
                }
          }
          animate={{
            left: GAP + getTilePosition(tile.col, cellSize),
            top: GAP + getTilePosition(tile.row, cellSize),
            scale: tile.isMerged ? [1, 1.15, 1] : tile.isNew ? [0, 1.05, 1] : 1,
            opacity: 1,
          }}
          transition={{
            left: { type: 'tween', duration: 0.15, ease: 'easeInOut' },
            top: { type: 'tween', duration: 0.15, ease: 'easeInOut' },
            scale: { duration: tile.isMerged ? 0.25 : 0.2, delay: tile.isNew ? 0.1 : 0 },
            opacity: { duration: 0.1 },
          }}
        >
          {tile.value}
        </motion.div>
      ))}
    </div>
  );
}
