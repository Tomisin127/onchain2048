// Types for 2048 game with animation tracking

export type Direction = 'left' | 'right' | 'up' | 'down';

export interface TileData {
  id: number;
  value: number;
  row: number;
  col: number;
  previousRow: number;
  previousCol: number;
  isNew: boolean;
  isMerged: boolean;
}

export type Board = TileData[][];

export interface GameState {
  tiles: TileData[];
  score: number;
  highScore: number;
  gameOver: boolean;
  lastDirection: Direction | null;
}

export interface MoveResult {
  moved: boolean;
  points: number;
  tiles: TileData[];
  gameOver: boolean;
}
