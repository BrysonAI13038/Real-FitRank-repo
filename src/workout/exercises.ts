export const MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Forearms", "Core", "Quads", "Hamstrings", "Glutes", "Calves"] as const;
export type MuscleGroup = typeof MUSCLE_GROUPS[number];
export type Exercise = { id: string; name: string; primary: MuscleGroup; secondary: MuscleGroup[]; maxWeightLbs: number; aliases?: string[] };

// Weight limits are prototype input bounds, not training recommendations.
// Existing ids (the first seven) are referenced by saved history: never rename or remove them.
const ex = (id: string, name: string, primary: MuscleGroup, secondary: MuscleGroup[], maxWeightLbs: number, aliases?: string[]): Exercise =>
  ({ id, name, primary, secondary, maxWeightLbs, aliases });

export const exercises: Exercise[] = [
  ex("bench-press", "Bench Press", "Chest", ["Triceps", "Shoulders"], 500, ["barbell bench"]),
  ex("squat", "Squat", "Quads", ["Glutes", "Hamstrings"], 700, ["back squat", "barbell squat"]),
  ex("deadlift", "Deadlift", "Glutes", ["Hamstrings", "Back"], 800, ["conventional deadlift"]),
  ex("row", "Dumbbell Row", "Back", ["Biceps"], 200, ["one-arm row", "db row"]),
  ex("overhead-press", "Overhead Press", "Shoulders", ["Triceps"], 300, ["ohp", "military press", "shoulder press"]),
  ex("biceps-curl", "Biceps Curl", "Biceps", ["Forearms"], 150, ["bicep curl", "dumbbell curl"]),
  ex("crunch", "Crunch", "Core", [], 100, ["ab crunch"]),

  // Chest
  ex("incline-bench-press", "Incline Bench Press", "Chest", ["Shoulders", "Triceps"], 450),
  ex("dumbbell-bench-press", "Dumbbell Bench Press", "Chest", ["Triceps", "Shoulders"], 200, ["db bench"]),
  ex("incline-dumbbell-press", "Incline Dumbbell Press", "Chest", ["Shoulders", "Triceps"], 180),
  ex("chest-fly", "Dumbbell Fly", "Chest", ["Shoulders"], 100, ["pec fly", "db fly"]),
  ex("cable-crossover", "Cable Crossover", "Chest", ["Shoulders"], 150),
  ex("push-up", "Push-Up", "Chest", ["Triceps", "Shoulders"], 200, ["pushup"]),
  ex("dip", "Dip", "Triceps", ["Chest", "Shoulders"], 200, ["dips", "parallel bar dip"]),
  ex("machine-chest-press", "Machine Chest Press", "Chest", ["Triceps", "Shoulders"], 400),

  // Back
  ex("pull-up", "Pull-Up", "Back", ["Biceps"], 200, ["pullup", "chin-up", "chin up"]),
  ex("lat-pulldown", "Lat Pulldown", "Back", ["Biceps"], 300, ["pulldown"]),
  ex("barbell-row", "Barbell Row", "Back", ["Biceps", "Hamstrings"], 400, ["bent over row"]),
  ex("seated-cable-row", "Seated Cable Row", "Back", ["Biceps"], 300, ["cable row"]),
  ex("t-bar-row", "T-Bar Row", "Back", ["Biceps"], 300),
  ex("face-pull", "Face Pull", "Shoulders", ["Back"], 120),
  ex("back-extension", "Back Extension", "Back", ["Glutes", "Hamstrings"], 150, ["hyperextension"]),
  ex("shrug", "Barbell Shrug", "Back", ["Forearms"], 500, ["trap shrug", "dumbbell shrug"]),

  // Shoulders
  ex("dumbbell-shoulder-press", "Dumbbell Shoulder Press", "Shoulders", ["Triceps"], 150, ["db shoulder press", "db ohp"]),
  ex("arnold-press", "Arnold Press", "Shoulders", ["Triceps"], 120),
  ex("lateral-raise", "Lateral Raise", "Shoulders", [], 60, ["side raise"]),
  ex("front-raise", "Front Raise", "Shoulders", ["Chest"], 60),
  ex("rear-delt-fly", "Rear Delt Fly", "Shoulders", ["Back"], 60, ["reverse fly"]),
  ex("upright-row", "Upright Row", "Shoulders", ["Back"], 200),

  // Biceps
  ex("barbell-curl", "Barbell Curl", "Biceps", ["Forearms"], 200, ["ez bar curl"]),
  ex("hammer-curl", "Hammer Curl", "Biceps", ["Forearms"], 100),
  ex("preacher-curl", "Preacher Curl", "Biceps", [], 120),
  ex("incline-dumbbell-curl", "Incline Dumbbell Curl", "Biceps", [], 80),
  ex("cable-curl", "Cable Curl", "Biceps", ["Forearms"], 150),

  // Triceps
  ex("tricep-pushdown", "Triceps Pushdown", "Triceps", [], 200, ["tricep pushdown", "pressdown"]),
  ex("skull-crusher", "Skull Crusher", "Triceps", [], 150, ["lying triceps extension"]),
  ex("overhead-tricep-extension", "Overhead Triceps Extension", "Triceps", [], 120, ["overhead tricep extension"]),
  ex("close-grip-bench-press", "Close-Grip Bench Press", "Triceps", ["Chest", "Shoulders"], 400, ["cgbp"]),
  ex("bench-dip", "Bench Dip", "Triceps", ["Shoulders", "Chest"], 100),

  // Forearms
  ex("wrist-curl", "Wrist Curl", "Forearms", [], 100),
  ex("reverse-wrist-curl", "Reverse Wrist Curl", "Forearms", [], 60),
  ex("farmer-carry", "Farmer's Carry", "Forearms", ["Core", "Back"], 300, ["farmers walk", "farmer carry"]),

  // Core
  ex("plank", "Plank", "Core", [], 100),
  ex("hanging-leg-raise", "Hanging Leg Raise", "Core", ["Forearms"], 50, ["leg raise"]),
  ex("cable-crunch", "Cable Crunch", "Core", [], 200),
  ex("russian-twist", "Russian Twist", "Core", [], 60),
  ex("ab-wheel-rollout", "Ab Wheel Rollout", "Core", ["Shoulders"], 50, ["rollout"]),
  ex("sit-up", "Sit-Up", "Core", [], 100, ["situp"]),

  // Quads
  ex("front-squat", "Front Squat", "Quads", ["Glutes", "Core"], 500),
  ex("leg-press", "Leg Press", "Quads", ["Glutes", "Hamstrings"], 1200),
  ex("leg-extension", "Leg Extension", "Quads", [], 300),
  ex("lunge", "Walking Lunge", "Quads", ["Glutes", "Hamstrings"], 200, ["lunges"]),
  ex("bulgarian-split-squat", "Bulgarian Split Squat", "Quads", ["Glutes"], 200, ["split squat"]),
  ex("goblet-squat", "Goblet Squat", "Quads", ["Glutes"], 150),
  ex("hack-squat", "Hack Squat", "Quads", ["Glutes"], 600),

  // Hamstrings
  ex("romanian-deadlift", "Romanian Deadlift", "Hamstrings", ["Glutes", "Back"], 600, ["rdl"]),
  ex("leg-curl", "Leg Curl", "Hamstrings", [], 250, ["hamstring curl", "lying leg curl"]),
  ex("stiff-leg-deadlift", "Stiff-Leg Deadlift", "Hamstrings", ["Glutes", "Back"], 600, ["sldl"]),
  ex("good-morning", "Good Morning", "Hamstrings", ["Glutes", "Back"], 300),

  // Glutes
  ex("hip-thrust", "Hip Thrust", "Glutes", ["Hamstrings"], 700, ["barbell hip thrust"]),
  ex("glute-bridge", "Glute Bridge", "Glutes", ["Hamstrings"], 400),
  ex("sumo-deadlift", "Sumo Deadlift", "Glutes", ["Quads", "Hamstrings", "Back"], 800),
  ex("cable-kickback", "Cable Kickback", "Glutes", ["Hamstrings"], 100, ["glute kickback"]),
  ex("step-up", "Step-Up", "Glutes", ["Quads"], 150),

  // Calves
  ex("standing-calf-raise", "Standing Calf Raise", "Calves", [], 500, ["calf raise"]),
  ex("seated-calf-raise", "Seated Calf Raise", "Calves", [], 300),
];

const matches = (exercise: Exercise, term: string) =>
  [exercise.name, exercise.primary, ...exercise.secondary, ...(exercise.aliases ?? [])].some(text => text.toLowerCase().includes(term));

// Name and alias matches come first, then muscle-group-only matches.
export function searchExercises(query: string, group?: MuscleGroup): Exercise[] {
  const term = query.trim().toLowerCase();
  const pool = group ? exercises.filter(item => item.primary === group || item.secondary.includes(group)) : exercises;
  const named = (item: Exercise) => [item.name, ...(item.aliases ?? [])].some(text => text.toLowerCase().includes(term));
  const found = term ? pool.filter(item => matches(item, term)) : pool;
  const rank = (item: Exercise) => (term ? (named(item) ? 0 : 1) : 0) + (group && item.primary !== group ? 2 : 0);
  return [...found].sort((a, b) => rank(a) - rank(b));
}
