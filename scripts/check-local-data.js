// Read-only. Paste into the browser console on the live FitRank site (the browser you
// have been logging workouts in). It changes nothing. It reports whether your saved data
// fits the cloud schema's limits (supabase/schema.sql) so the import can't be rejected.
(() => {
  const LIMITS = { earned: 635, bytes: 20000 };
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
  const report = { keys: {}, workouts: 0, maxEarned: 0, maxWorkoutBytes: 0, goals: 0, maxGoalBytes: 0, overLimit: [] };
  // The app reads the newest key present, so counts and maximums come from that one;
  // the limit checks still cover every key.
  const counted = ["fitrank.data.v3", "fitrank.data.v2", "fitrank.workouts.v1"].find(key => localStorage.getItem(key) !== null);
  for (const key of ["fitrank.data.v3", "fitrank.data.v2", "fitrank.workouts.v1"]) {
    const raw = localStorage.getItem(key);
    report.keys[key] = raw === null ? "absent" : `${raw.length} chars`;
    if (raw === null) continue;
    let data;
    try { data = JSON.parse(raw); } catch { report.overLimit.push(`${key}: not valid JSON`); continue; }
    for (const workout of Array.isArray(data?.workouts) ? data.workouts : []) {
      const earned = Number(workout?.earned);
      const size = bytes(workout);
      if (key === counted) {
        report.workouts++;
        report.maxEarned = Math.max(report.maxEarned, earned || 0);
        report.maxWorkoutBytes = Math.max(report.maxWorkoutBytes, size);
      }
      if (!(earned >= 0 && earned <= LIMITS.earned)) report.overLimit.push(`${key} workout ${workout?.id}: earned ${workout?.earned}`);
      if (size >= LIMITS.bytes) report.overLimit.push(`${key} workout ${workout?.id}: ${size} bytes`);
    }
    for (const goal of Array.isArray(data?.goals) ? data.goals : []) {
      const size = bytes(goal);
      if (key === counted) { report.goals++; report.maxGoalBytes = Math.max(report.maxGoalBytes, size); }
      if (size >= LIMITS.bytes) report.overLimit.push(`${key} goal ${goal?.id}: ${size} bytes`);
    }
  }
  console.log(JSON.stringify(report, null, 2));
  console.log(report.overLimit.length ? "OVER LIMIT: send me this output before applying the schema." : `OK: everything is under the limits (earned <= ${LIMITS.earned}, rows < ${LIMITS.bytes} bytes).`);
  return report;
})();
