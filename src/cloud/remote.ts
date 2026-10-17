import type { SupabaseClient } from "@supabase/supabase-js";
import type { GoalRow, Remote, WorkoutRow } from "./sync";

const PAGE = 500;
const BATCH = 100;

async function pullAll<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return rows;
  }
}

// Talks to the tables in supabase/schema.sql as the signed-in user. Row-level security
// does the access control; user_id is filled in by the server.
export function createRemote(client: SupabaseClient): Remote {
  const insertWorkouts = (rows: WorkoutRow[]) =>
    client.from("workouts").upsert(rows, { onConflict: "user_id,id", ignoreDuplicates: true });
  return {
    pullWorkouts: () => pullAll<WorkoutRow>((from, to) =>
      client.from("workouts").select("id, completed_at, earned, data").order("completed_at").order("id").range(from, to)),
    pullGoals: () => pullAll<GoalRow>((from, to) =>
      client.from("goals").select("id, data, deleted_at, updated_at").order("id").range(from, to)),
    async pushWorkouts(rows) {
      const rejected: string[] = [];
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        if (!(await insertWorkouts(batch)).error) continue;
        // One bad row fails the whole batch, so retry singly to find which ones the server refuses.
        for (const row of batch) if ((await insertWorkouts([row])).error) rejected.push(row.id);
      }
      return rejected;
    },
    async pushGoals(rows) {
      const { error } = await client.from("goals").upsert(rows, { onConflict: "user_id,id" });
      if (error) throw new Error(error.message);
    },
  };
}
