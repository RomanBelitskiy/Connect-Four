/** Інкремент скасовує застарілі відповіді /sync (countdown, pregame). */
var syncEpoch = 0;

export function bumpSyncEpoch() {
  syncEpoch += 1;
}

export function nextSyncEpoch() {
  syncEpoch += 1;
  return syncEpoch;
}

export function isSyncEpochCurrent(epoch) {
  return epoch === syncEpoch;
}
