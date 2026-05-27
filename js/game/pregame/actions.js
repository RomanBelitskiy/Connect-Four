import { game } from "../state.js";
import {
  setLobbyReady,
  kickLobbyGuest,
  syncLobby,
  forfeitLobby,
  spectateLobby,
} from "../../api/client.js";
import { sendReady, isLobbySocketOpen, notifyLobbyState } from "../../api/ws.js";
import { joinLobbyById, setSeatExitInFlight } from "../lobby-session.js";
import { getLastLobbySnapshot, setLastLobbySnapshot } from "../pregame-snapshot.js";
import {
  hasLobbyGuest,
  getPregameReadyState,
  isPregameSpectator,
  lobbyPlayersUnchanged,
} from "./roles.js";
import {
  applyPendingReadyToLobby,
  clearPendingMyReady,
  isReadyToggleCoolingDown,
  setPendingMyReady,
  startReadyToggleCooldown,
} from "./ready-pending.js";
import { patchPregameFromLobby } from "./render.js";

var leaveSeatInFlight = false;

function applyOptimisticReady(nextReady) {
  var lobby = getLastLobbySnapshot();
  if (!lobby || !hasLobbyGuest(lobby)) return;
  var patched = Object.assign({}, lobby, {
    hostReady: lobby.myRole === "host" ? nextReady : lobby.hostReady,
    guestReady: lobby.myRole === "guest" ? nextReady : lobby.guestReady,
  });
  setLastLobbySnapshot(patched);
  patchPregameFromLobby(patched, {});
}

export async function toggleMyReady() {
  if (isReadyToggleCoolingDown()) return;

  var lobby = getLastLobbySnapshot();
  if (!lobby || !lobby.id || lobby.countdownAt || !hasLobbyGuest(lobby)) return;
  var ready = getPregameReadyState(lobby);
  var next = !ready.myReady;
  var prevReady = ready.myReady;

  setPendingMyReady(next);
  startReadyToggleCooldown();
  applyOptimisticReady(next);

  if (isLobbySocketOpen() && sendReady(next)) return;

  try {
    var updated = await setLobbyReady(lobby.id, next);
    if (updated) {
      updated = applyPendingReadyToLobby(updated);
      setLastLobbySnapshot(updated);
      if (lobbyPlayersUnchanged(lobby, updated)) {
        patchPregameFromLobby(updated, {});
      } else {
        notifyLobbyState(updated);
      }
    }
  } catch (err) {
    console.warn("[ready]", err.message || err);
    clearPendingMyReady();
    applyOptimisticReady(prevReady);
  }
}

export async function joinAsGuestFromPregame() {
  var lobby = getLastLobbySnapshot();
  if (!lobby || !lobby.id || lobby.countdownAt) return;
  if (!isPregameSpectator(lobby)) return;
  if (hasLobbyGuest(lobby)) return;
  var lobbyId = lobby.id;
  try {
    await joinLobbyById(lobbyId, { skipActiveCheck: true });
    setLastLobbySnapshot(null);
  } catch (err) {
    console.warn("[join]", err.message || err);
    try {
      var synced = await syncLobby(lobbyId);
      if (synced) notifyLobbyState(synced);
    } catch (syncErr) {
      console.warn("[join recover]", syncErr.message || syncErr);
    }
  }
}

export async function kickOpponent() {
  var lobby = getLastLobbySnapshot();
  if (!lobby || !lobby.id || lobby.myRole !== "host") return;
  try {
    var updated = await kickLobbyGuest(lobby.id);
    if (updated) notifyLobbyState(updated);
  } catch (err) {
    console.warn("[kick]", err.message || err);
  }
}

async function recoverAfterGuestLeave(lobbyId) {
  if (!lobbyId) return;
  try {
    var synced = await syncLobby(lobbyId);
    if (synced) {
      setLastLobbySnapshot(null);
      notifyLobbyState(synced);
    }
  } catch (err) {
    console.warn("[leave-seat recover]", err.message || err);
  }
}

export async function leaveGuestSeat() {
  if (leaveSeatInFlight) return;
  var snap = getLastLobbySnapshot();
  var lobbyId = (snap && snap.id) || game.lobbyId;
  if (!lobbyId || game.myRole !== "guest") return;
  if (snap && snap.countdownAt) return;
  if (snap && !hasLobbyGuest(snap)) return;

  leaveSeatInFlight = true;
  setSeatExitInFlight(true);
  try {
    var updated = await forfeitLobby(lobbyId);
    if (updated && updated.status === "finished") {
      setLastLobbySnapshot(null);
      notifyLobbyState(updated);
      return;
    }
    if (updated && updated.myRole !== "spectator") {
      try {
        updated = await spectateLobby(lobbyId);
      } catch (spectateErr) {
        console.warn("[leave-seat spectate]", spectateErr.message || spectateErr);
        await recoverAfterGuestLeave(lobbyId);
        return;
      }
    }
    if (updated) {
      setLastLobbySnapshot(null);
      notifyLobbyState(updated);
      return;
    }
    await recoverAfterGuestLeave(lobbyId);
  } catch (err) {
    console.warn("[leave-seat]", err.message || err);
    await recoverAfterGuestLeave(lobbyId);
  } finally {
    leaveSeatInFlight = false;
    setSeatExitInFlight(false);
  }
}
