import { motion } from 'framer-motion';
import { TileData } from '@/types/game';
import { cn } from '@/lib/utils';

const DEFAULT_CELL_SIZE = 68; // px per cell
const GAP = 10; // px gap

function getTilePosition(index: number, cellSize: number): number {
  return index * (cellSize + GAP);
}

// Gradient fills + colored glow live in index.css (.tile-2 … .tile-2048).
// Unknown values (4096+) share the .tile-super style.
function getTileClass(value: number): string {
  const known = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
  return known.includes(value) ? `tile-${value}` : 'tile-super';
}

// Tile label scales with the actual cell size instead of fixed text classes.
function getFontSize(value: number, cellSize: number): number {
  if (value >= 1024) return Math.round(cellSize * 0.28);
  if (value >= 128) return Math.round(cellSize * 0.32);
  return Math.round(cellSize * 0.4);
}

interface GameBoardProps {
  tiles: TileData[];
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  cellSize?: number;
  gameOver?: boolean;
}

export function GameBoard({ tiles, onTouchStart, onTouchEnd, cellSize = DEFAULT_CELL_SIZE, gameOver = false }: GameBoardProps) {
  const boardSize = cellSize * 4 + GAP * 5;

  return (
    <div
      className="relative game-board-shell rounded-2xl touch-none select-none"
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
            className="absolute rounded-xl board-cell"
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
          className={cn(
            'absolute rounded-xl flex items-center justify-center font-display font-bold text-foreground tile-text',
            getTileClass(tile.value),
            tile.value === 2048 && 'ring-2 ring-tile-2048',
          )}
          style={{
            width: cellSize,
            height: cellSize,
            fontSize: getFontSize(tile.value, cellSize),
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

      {/* Game over: soften the board instead of dumping text below it */}
      {gameOver && (
        <motion.div
          className="absolute inset-0 rounded-2xl bg-background/70 backdrop-blur-[2px] flex flex-col items-center justify-center gap-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-xl font-display font-bold gradient-text">Game Over</span>
          <span className="text-[11px] text-muted-foreground font-body">Tap New Game to try again</span>
        </motion.div>
      )}
    </div>
  );
}
