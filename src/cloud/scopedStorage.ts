// A Storage-shaped view of one account's data: every key is prefixed with `u.<uid>.`,
// so two accounts on the same device never see each other's workouts. The storage
// functions in src/workout take a storage argument, so they work on this unchanged.
export type ScopedStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const prefix = (uid: string) => `u.${uid}.`;

export function scopedStorage(uid: string, base: Pick<Storage, "getItem" | "setItem" | "removeItem"> = localStorage): ScopedStorage {
  const p = prefix(uid);
  return {
    getItem: key => base.getItem(p + key),
    setItem: (key, value) => base.setItem(p + key, value),
    removeItem: key => base.removeItem(p + key),
  };
}

// Removes only this account's keys. Unscoped keys (the original on-device data) are never touched.
export function clearScoped(uid: string, base: Pick<Storage, "length" | "key" | "removeItem"> = localStorage): void {
  const p = prefix(uid);
  const doomed: string[] = [];
  for (let i = 0; i < base.length; i++) {
    const key = base.key(i);
    if (key?.startsWith(p)) doomed.push(key);
  }
  for (const key of doomed) base.removeItem(key);
}
