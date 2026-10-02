const MISSING = Symbol("missing");

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function sameValue(left, right) {
  if (left === MISSING || right === MISSING) return left === right;
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length)
      return false;
    return left.every((value, index) => sameValue(value, right[index]));
  }

  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every(
      (key) => own(right, key) && sameValue(left[key], right[key]),
    );
  }

  return false;
}

function cloneValue(value) {
  if (value === MISSING) return MISSING;
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isPlainObject(value)) {
    const copy = {};
    for (const [key, child] of Object.entries(value)) copy[key] = cloneValue(child);
    return copy;
  }
  return value;
}

function displayPath(path) {
  if (!path.length) return "workbook";

  const cellIndex = path.indexOf("cellData");
  if (cellIndex >= 0 && path.length >= cellIndex + 3) {
    const row = Number(path[cellIndex + 1]);
    const column = Number(path[cellIndex + 2]);
    if (Number.isInteger(row) && Number.isInteger(column)) {
      let letters = "";
      let value = column + 1;
      while (value > 0) {
        const remainder = (value - 1) % 26;
        letters = String.fromCharCode(65 + remainder) + letters;
        value = Math.floor((value - 1) / 26);
      }
      return `${letters}${row + 1}`;
    }
  }

  return path.join(" › ");
}

function mergeValue(base, remote, local, path, conflicts) {
  if (sameValue(local, base)) return cloneValue(remote);
  if (sameValue(remote, base)) return cloneValue(local);
  if (sameValue(local, remote)) return cloneValue(local);

  const baseObject = isPlainObject(base);
  const remoteObject = isPlainObject(remote);
  const localObject = isPlainObject(local);

  // Both clients created the same object container independently. Descend so
  // sibling keys (for example two different cells in a previously empty row)
  // can still merge cleanly.
  if (base === MISSING && remoteObject && localObject) {
    return mergeObject({}, remote, local, path, conflicts);
  }

  if (baseObject && remoteObject && localObject) {
    return mergeObject(base, remote, local, path, conflicts);
  }

  conflicts.push({
    path: [...path],
    label: displayPath(path),
    base: base === MISSING ? undefined : cloneValue(base),
    remote: remote === MISSING ? undefined : cloneValue(remote),
    local: local === MISSING ? undefined : cloneValue(local),
  });

  // Keep the local value in the candidate snapshot. The caller does not save
  // it automatically while conflicts exist; it is used if the user explicitly
  // chooses "Keep my changes".
  return cloneValue(local);
}

function mergeObject(base, remote, local, path, conflicts) {
  const result = {};
  const keys = new Set([
    ...Object.keys(base || {}),
    ...Object.keys(remote || {}),
    ...Object.keys(local || {}),
  ]);

  for (const key of keys) {
    const baseValue = own(base, key) ? base[key] : MISSING;
    const remoteValue = own(remote, key) ? remote[key] : MISSING;
    const localValue = own(local, key) ? local[key] : MISSING;
    const merged = mergeValue(
      baseValue,
      remoteValue,
      localValue,
      [...path, key],
      conflicts,
    );
    if (merged !== MISSING) result[key] = merged;
  }

  return result;
}

export function cloneSpreadsheetSnapshot(snapshot) {
  return cloneValue(snapshot);
}

export function mergeSpreadsheetSnapshots(base, remote, local) {
  const conflicts = [];
  const snapshot = mergeValue(base, remote, local, [], conflicts);
  return { snapshot, conflicts };
}
