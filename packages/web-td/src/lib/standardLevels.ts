import type { BlindLevel } from "./types.js";

export const STANDARD_LEVELS: BlindLevel[] = [
  { levelNumber: 1, smallBlind: 25, bigBlind: 50, ante: 0, durationMinutes: 15, isBreak: false },
  { levelNumber: 2, smallBlind: 50, bigBlind: 100, ante: 0, durationMinutes: 15, isBreak: false },
  { levelNumber: 3, smallBlind: 75, bigBlind: 150, ante: 0, durationMinutes: 15, isBreak: false },
  { levelNumber: 4, smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 15, isBreak: false },
  { levelNumber: 5, smallBlind: 150, bigBlind: 300, ante: 25, durationMinutes: 15, isBreak: false },
  { levelNumber: 6, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 15, isBreak: false },
  { levelNumber: 7, smallBlind: 0, bigBlind: 0, ante: 0, durationMinutes: 10, isBreak: true },
  { levelNumber: 8, smallBlind: 300, bigBlind: 600, ante: 75, durationMinutes: 15, isBreak: false },
  { levelNumber: 9, smallBlind: 400, bigBlind: 800, ante: 100, durationMinutes: 15, isBreak: false },
  { levelNumber: 10, smallBlind: 500, bigBlind: 1000, ante: 100, durationMinutes: 15, isBreak: false },
  { levelNumber: 11, smallBlind: 600, bigBlind: 1200, ante: 200, durationMinutes: 15, isBreak: false },
  { levelNumber: 12, smallBlind: 800, bigBlind: 1600, ante: 200, durationMinutes: 15, isBreak: false },
];
