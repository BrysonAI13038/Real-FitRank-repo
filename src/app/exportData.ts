import type { SavedData } from "../workout/storage";

// The file a user downloads from Settings: exactly what is saved for their account.
export const exportJson = (data: SavedData) => JSON.stringify(data, null, 2);

export function downloadExport(data: SavedData) {
  const url = URL.createObjectURL(new Blob([exportJson(data)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = "fitrank-workouts.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
