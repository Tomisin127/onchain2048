import { motion } from 'framer-motion';
import { TileData } from '@/types/game';

const CELL_SIZE = 76; // px per cell
const GAP = 12; // px gap

function getTilePosition(index: number): number {
  return index * (CELL_SIZE + GAP);
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
}

export function GameBoard({ tiles, onTouchStart, onTouchEnd }: GameBoardProps) {
  return (
    <div
      className="relative bg-game-board rounded-2xl p-3 touch-none select-none"
      style={{ width: CELL_SIZE * 4 + GAP * 5, height: CELL_SIZE * 4 + GAP * 5, padding: GAP }}
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
              width: CELL_SIZE,
              height: CELL_SIZE,
              left: GAP + getTilePosition(col),
              top: GAP + getTilePosition(row),
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
            width: CELL_SIZE,
            height: CELL_SIZE,
          }}
          initial={
            tile.isNew
              ? {
                  left: GAP + getTilePosition(tile.col),
                  top: GAP + getTilePosition(tile.row),
                  scale: 0,
                  opacity: 0,
                }
              : {
                  left: GAP + getTilePosition(tile.previousCol),
                  top: GAP + getTilePosition(tile.previousRow),
                  scale: 1,
                  opacity: 1,
                }
          }
          animate={{
            left: GAP + getTilePosition(tile.col),
            top: GAP + getTilePosition(tile.row),
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
