export const MOCK_LOBBIES = [
  {
    id: "1",
    title: "Кімната @neo",
    hostName: "Neo",
    timeLabel: "5m + 1s",
    viewers: 3,
  },
  {
    id: "2",
    title: "Кімната @mira",
    hostName: "Mira",
    timeLabel: "3m + 1s",
    viewers: 2,
  },
  {
    id: "3",
    title: "Кімната @k17",
    hostName: "K_17",
    timeLabel: "10m + 1s",
    viewers: 1,
  },
];

export const MOCK_HISTORY = [
  { result: "win", opponent: "Проти @pixel", meta: "Вчора · 5m + 1s", delta: "+18" },
  { result: "loss", opponent: "Проти @luna", meta: "2 дні тому · 3m + 1s", delta: "−12" },
  { result: "win", opponent: "Проти @ark", meta: "3 дні тому · 5m + 1s", delta: "+24" },
];

export const MOCK_LEADERBOARD = [
  { rank: 1, name: "ark", score: 1842, delta: "+32" },
  { rank: 2, name: "luna", score: 1798, delta: "+12" },
  { rank: 3, name: "pixel", score: 1761, delta: "−4" },
  { rank: 4, name: "mira", score: 1688, delta: "+8" },
  { rank: 5, name: "Ти", score: 1650, delta: "+0", isMe: true },
  { rank: 6, name: "k17", score: 1602, delta: "−18" },
];
