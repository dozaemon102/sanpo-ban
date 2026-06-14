import type {
  DashboardToday,
  FoodLookupResponse,
  FoodPreset,
  MealCreate,
  MealLog,
  Profile,
  ProfileUpdate,
  StrengthLog,
  TreadmillLog,
  WalkSession,
  WeekSummary,
  WeightLog,
} from "../types";

const BASE = "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getProfile: () => request<Profile>("/profile"),
  putProfile: (body: ProfileUpdate) =>
    request<Profile>("/profile", { method: "PUT", body: JSON.stringify(body) }),
  getDashboard: (date?: string) =>
    request<DashboardToday>(`/dashboard/today${date ? `?date=${date}` : ""}`),
  getPresets: () => request<FoodPreset[]>("/food-presets"),
  lookupBarcode: (barcode: string) => request<FoodLookupResponse>(`/foods/barcode/${barcode}`),
  getMeals: (date: string) => request<MealLog[]>(`/meals?date=${date}`),
  deleteMeal: (mealId: number) => request<void>(`/meals/${mealId}`, { method: "DELETE" }),
  addMeal: (body: MealCreate) =>
    request<MealLog>("/meals", { method: "POST", body: JSON.stringify(body) }),
  addMealFromPreset: (preset: FoodPreset, logDate: string) =>
    request("/meals", {
      method: "POST",
      body: JSON.stringify({
        log_date: logDate,
        name: preset.name,
        kcal: preset.kcal,
        protein_g: preset.protein_g,
        fat_g: preset.fat_g,
        carbs_g: preset.carbs_g,
        food_preset_id: preset.id,
      }),
    }),
  recordWalk: (note?: string) =>
    request("/walks", {
      method: "POST",
      body: JSON.stringify({ discovery_note: note || null }),
    }),
  getWalks: (limit = 30) => request<WalkSession[]>(`/walks?limit=${limit}`),
  deleteWalk: (walkId: number) => request<void>(`/walks/${walkId}`, { method: "DELETE" }),
  syncHealth: (date: string, steps: number, weight_kg?: number) =>
    request("/sync/health", {
      method: "POST",
      body: JSON.stringify({ date, steps, weight_kg }),
    }),
  getWeekSummary: () => request<WeekSummary>("/summary/week"),
  getWeights: (limit = 30) => request<WeightLog[]>(`/weights?limit=${limit}`),
  deleteWeight: (weightId: number) => request<void>(`/weights/${weightId}`, { method: "DELETE" }),
  getTreadmillLogs: (date?: string) =>
    request<TreadmillLog[]>(`/exercises/treadmill${date ? `?date=${date}` : ""}`),
  deleteTreadmill: (logId: number) =>
    request<void>(`/exercises/treadmill/${logId}`, { method: "DELETE" }),
  addTreadmill: (minutes: number, machine_kcal?: number) =>
    request("/exercises/treadmill", {
      method: "POST",
      body: JSON.stringify({ minutes, machine_kcal: machine_kcal ?? null }),
    }),
  getStrengthLogs: (date?: string) =>
    request<StrengthLog[]>(`/exercises/strength${date ? `?date=${date}` : ""}`),
  deleteStrength: (logId: number) =>
    request<void>(`/exercises/strength/${logId}`, { method: "DELETE" }),
  addStrength: (exercise_code: string, minutes: number) =>
    request("/exercises/strength", {
      method: "POST",
      body: JSON.stringify({ exercise_code, minutes }),
    }),
  getStrengthTemplates: () =>
    request<Array<{ code: string; name: string; met: number }>>(
      "/exercises/strength/templates"
    ),
};

export type { DashboardToday, Profile, WeekSummary };
