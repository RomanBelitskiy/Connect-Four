import { waitForBootJoinReady } from "./boot-join.js";

export var BOOT_RESUME_MAX_MS = 3000;

function delay(ms) {
  return new Promise(function (resolve) {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Відновлює активне лобі, чекаючи готовий pregame/дошку (макс ~3 с).
 * @param {() => Promise<object|null>} resumeFn
 */
export async function runBootResumeGate(resumeFn) {
  var startedAt = Date.now();
  var lobby = null;
  var error = null;

  var resumePromise = resumeFn()
    .then(function (result) {
      lobby = result;
      return result;
    })
    .catch(function (err) {
      error = err;
      throw err;
    });

  await Promise.race([resumePromise.catch(function () {}), delay(BOOT_RESUME_MAX_MS)]);

  if (!lobby) {
    try {
      lobby = await resumePromise;
    } catch (err) {
      error = err;
    }
  }

  if (lobby) {
    var remaining = BOOT_RESUME_MAX_MS - (Date.now() - startedAt);
    if (remaining > 0) {
      await Promise.race([waitForBootJoinReady(lobby), delay(remaining)]);
    }
  } else {
    var waitLeft = BOOT_RESUME_MAX_MS - (Date.now() - startedAt);
    if (waitLeft > 0) await delay(waitLeft);
  }

  return { lobby: lobby, error: error };
}
