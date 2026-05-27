import { t } from "../i18n/index.js";
import { waitForBootJoinReady } from "./boot-join.js";

var REVEAL_MS = 280;

/** @type {number} */
var loadingDepth = document.documentElement.dataset.appLoading ? 1 : 0;

function syncGateLabel() {
  var gate = document.getElementById("bootGate");
  if (!gate) return;
  var text = gate.querySelector(".boot-gate__text");
  if (text) {
    var key = text.getAttribute("data-i18n") || "loading";
    text.textContent = t(key);
  }
}

export function showAppLoading(mode) {
  var root = document.documentElement;
  if (!root.dataset.appLoading) {
    root.dataset.appLoading = mode || "1";
    syncGateLabel();
    var gate = document.getElementById("bootGate");
    if (gate) gate.setAttribute("aria-busy", "true");
  } else if (mode === "join") {
    root.dataset.appLoading = "join";
  }
  loadingDepth++;
}

export function hideAppLoading() {
  loadingDepth = Math.max(0, loadingDepth - 1);
  if (loadingDepth > 0) return;
  finishAppLoading();
}

/** @deprecated alias */
export var finishBootGate = finishAppLoading;

export function finishAppLoading() {
  loadingDepth = 0;
  var root = document.documentElement;
  var hadGate = !!root.dataset.appLoading;
  if (root.dataset.appLoading) delete root.dataset.appLoading;
  if (root.dataset.bootResume) delete root.dataset.bootResume;
  if (root.dataset.bootJoin) delete root.dataset.bootJoin;
  if (!hadGate) return;

  var gate = document.getElementById("bootGate");
  if (gate) gate.setAttribute("aria-busy", "false");

  var app = document.getElementById("app");
  if (!app) return;
  app.classList.add("app--boot-reveal");
  window.setTimeout(function () {
    app.classList.remove("app--boot-reveal");
  }, REVEAL_MS);
}

/**
 * Повноекранний Loading під час async-переходів (вхід у гру, створення лобі тощо).
 * @param {() => Promise<object|null|undefined>} task
 * @param {{ waitForReady?: boolean }} [options]
 */
export async function runWithAppLoading(task, options) {
  options = options || {};
  showAppLoading();
  try {
    var result = await task();
    if (options.waitForReady && result) {
      await waitForBootJoinReady(result);
    }
    return result;
  } finally {
    hideAppLoading();
  }
}
