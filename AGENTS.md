# Project Notes

- High scores are stored per wallet address (localStorage key `highScore2048:<address>`). Never reintroduce a single shared key — it published one player's best score under every wallet on the device and mixed the leaderboard.
- Balance reads (ETH, B20, allowance) go through the shared provider in `src/lib/baseProvider.ts`; do not create a new `JsonRpcProvider` per poll.
- Radix `TabsList` must be rendered inside its `Tabs` component or the leaderboard crashes.
