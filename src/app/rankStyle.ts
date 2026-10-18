// Look of each rank: a metal color, how many chevrons the badge shows, and how many gems sit
// above them. Keyed by the names in RANKS (tests fail if a rank is added without a style).
export type RankStyle = { color: string; light: string; chevrons: number; gems: number };

export const RANK_STYLES: Record<string, RankStyle> = {
  Bronze: { color: "#cd7f32", light: "#f3b97c", chevrons: 1, gems: 0 },
  Silver: { color: "#b3bec9", light: "#eef3f8", chevrons: 2, gems: 0 },
  Gold: { color: "#f2b82e", light: "#ffe28f", chevrons: 3, gems: 0 },
  Platinum: { color: "#4fd6c9", light: "#c4fff8", chevrons: 3, gems: 1 },
  Diamond: { color: "#62b4ff", light: "#d3eaff", chevrons: 3, gems: 2 },
  Elite: { color: "#e879f9", light: "#fbd8ff", chevrons: 3, gems: 3 },
};
export const rankStyle = (rank: string): RankStyle => RANK_STYLES[rank] ?? RANK_STYLES.Bronze;
