/** Мутабельний клієнтський стан поточної партії. */
export const game = {
  grid: /** @type {string[][]} */ ([]),
  currentPlayer: "y",
  matchActive: false,
  matchFinished: false,
  clockYellowSec: 60,
  clockRedSec: 60,
  incSec: 0,
  clockTimerId: /** @type {ReturnType<typeof setInterval> | null} */ (null),
  humanChipColor: "yellow",
  lobbyId: /** @type {string|null} */ (null),
  myRole: /** @type {"host"|"guest"|null} */ (null),
  myTelegramId: /** @type {string|null} */ (null),
  shareUrl: /** @type {string|null} */ (null),
  status: /** @type {string|null} */ (null),
  opponent: /** @type {object|null} */ (null),
  waiting: false,
};

export const leaveGate = {
  confirmCallback: /** @type {null | (() => void)} */ (null),
  focusReturnEl: /** @type {HTMLElement | null} */ (null),
};

export const GAME_COLS = 7;
export const GAME_ROWS = 6;
