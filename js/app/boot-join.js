/** Blank loading gate for invite deep links (cold start). */

export var BOOT_JOIN_MAX_MS = 3000;

function delay(ms) {
  return new Promise(function (resolve) {
    window.setTimeout(resolve, ms);
  });
}

function waitForNextPaint() {
  return new Promise(function (resolve) {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(resolve);
    });
  });
}

function isWaitingLobbyReady() {
  var overlay = document.getElementById("gamePregame");
  if (!overlay || overlay.hasAttribute("hidden")) return false;

  var meta = document.getElementById("pregameMatchMeta");
  if (!meta || !meta.textContent || meta.textContent === "—") return false;

  var screen = document.querySelector(".game-screen");
  return !!(screen && screen.classList.contains("game-screen--pregame"));
}

function isPlayingLobbyReady() {
  var board = document.getElementById("gameBoard");
  return !!(board && board.childElementCount > 0);
}

export function waitForBootJoinReady(lobby) {
  if (!lobby) return Promise.resolve();

  return new Promise(function (resolve) {
    function isReady() {
      if (lobby.status === "waiting") return isWaitingLobbyReady();
      if (lobby.status === "playing") return isPlayingLobbyReady();
      return true;
    }

    function poll() {
      if (isReady()) {
        waitForNextPaint().then(resolve);
        return;
      }
      window.requestAnimationFrame(poll);
    }

    var fontsReady =
      document.fonts && document.fonts.ready
        ? document.fonts.ready.catch(function () {})
        : Promise.resolve();

    fontsReady.then(function () {
      poll();
    });
  });
}

/**
 * Join via invite while the UI stays hidden, then reveal when ready (max ~3s).
 * @param {() => Promise<object|null>} joinFn
 */
export async function runBootJoinGate(joinFn) {
  var startedAt = Date.now();
  var lobby = null;
  var error = null;

  var joinPromise = joinFn()
    .then(function (result) {
      lobby = result;
      return result;
    })
    .catch(function (err) {
      error = err;
      throw err;
    });

  await Promise.race([joinPromise.catch(function () {}), delay(BOOT_JOIN_MAX_MS)]);

  if (!lobby) {
    try {
      lobby = await joinPromise;
    } catch (err) {
      error = err;
    }
  }

  if (lobby) {
    var remaining = BOOT_JOIN_MAX_MS - (Date.now() - startedAt);
    if (remaining > 0) {
      await Promise.race([waitForBootJoinReady(lobby), delay(remaining)]);
    }
  } else {
    var waitLeft = BOOT_JOIN_MAX_MS - (Date.now() - startedAt);
    if (waitLeft > 0) await delay(waitLeft);
  }

  return { lobby: lobby, error: error };
}
