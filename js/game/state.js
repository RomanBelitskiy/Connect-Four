export const GAME_COLS = 7;
export const GAME_ROWS = 6;

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
};

export const leaveGate = {
  /** @type {null | (() => void)} */
  confirmCallback: null,
  /** @type {HTMLElement | null} */
  focusReturnEl: null,
};
