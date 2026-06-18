import type {
  DashboardHistory,
  DashboardTop,
  FoodLookupResponse,
  FoodPreset,
  FoodPresetCreate,
  HistoryMetric,
  HistoryPeriod,
  MealCreate,
  MealLog,
  MealSlot,
  Profile,
  ProfileUpdate,
  StrengthLog,
  TreadmillLog,
} from "../types";

const BASE = "/api/v1";
const REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: controller.signal,
      ...init,
    });
    if (res.status === 204 || res.status === 205) return undefined as T;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error(
        `API が JSON 以外を返しました（${res.status}）。ページを再読み込みするか、サービスを再起動してください。`
      );
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const errObj = body?.error ?? body?.detail?.error;
      const message = errObj?.message;
      if (typeof message === "string" && message.length > 0) {
        throw new Error(message);
      }
      if (Array.isArray(body?.detail)) {
        const fields = body.detail
          .map((item: { loc?: unknown[]; msg?: string }) => {
            const field = item.loc?.slice(-1)[0];
            return field ? `${field}: ${item.msg ?? "invalid"}` : item.msg;
          })
          .filter(Boolean)
          .join("; ");
        if (fields) throw new Error(fields);
      }
      throw new Error(res.statusText);
    }
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("リクエストがタイムアウトしました。ネットワークを確認してください。");
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const api = {
  getProfile: () => request<Profile>("/profile"),
  putProfile: (body: ProfileUpdate) =>
    request<Profile>("/profile", { method: "PUT", body: JSON.stringify(body) }),
  getDashboardTop: (date?: string) =>
    request<DashboardTop>(`/dashboard/top${date ? `?date=${date}` : ""}`),
  getDashboardHistory: (metric: HistoryMetric, period: HistoryPeriod, anchorDate?: string) => {
    const params = new URLSearchParams({ period });
    if (anchorDate) params.set("anchor_date", anchorDate);
    return request<DashboardHistory>(`/dashboard/history/${metric}?${params}`);
  },
  getPresets: () => request<FoodPreset[]>("/food-presets"),
  createPreset: (body: FoodPresetCreate) =>
    request<FoodPreset>("/food-presets", { method: "POST", body: JSON.stringify(body) }),
  deletePreset: (presetId: number) =>
    request<void>(`/food-presets/${presetId}`, { method: "DELETE" }),
  lookupBarcode: (barcode: string) =>
    request<FoodLookupResponse>(`/foods/barcode/${encodeURIComponent(barcode)}`),
  getMeals: (date: string) => request<MealLog[]>(`/meals?date=${date}`),
  deleteMeal: (mealId: number) => request<void>(`/meals/${mealId}`, { method: "DELETE" }),
  addMeal: (body: MealCreate) =>
    request<MealLog>("/meals", { method: "POST", body: JSON.stringify(body) }),
  addMealFromPreset: (preset: FoodPreset, logDate: string, mealSlot: MealSlot) =>
    request("/meals", {
      method: "POST",
      body: JSON.stringify({
        log_date: logDate,
        meal_slot: mealSlot,
        name: preset.name,
        kcal: preset.kcal,
        protein_g: preset.protein_g,
        fat_g: preset.fat_g,
        carbs_g: preset.carbs_g,
        food_preset_id: preset.id,
      }),
    }),
  getTreadmillLogs: (date?: string) =>
    request<TreadmillLog[]>(`/exercises/treadmill${date ? `?date=${date}` : ""}`),
  deleteTreadmill: (logId: number) =>
    request<void>(`/exercises/treadmill/${logId}`, { method: "DELETE" }),
  addTreadmill: (minutes: number, logDate: string, machine_kcal?: number) =>
    request("/exercises/treadmill", {
      method: "POST",
      body: JSON.stringify({ log_date: logDate, minutes, machine_kcal: machine_kcal ?? null }),
    }),
  getStrengthLogs: (date?: string) =>
    request<StrengthLog[]>(`/exercises/strength${date ? `?date=${date}` : ""}`),
  deleteStrength: (logId: number) =>
    request<void>(`/exercises/strength/${logId}`, { method: "DELETE" }),
  addStrength: (exercise_code: string, minutes: number, logDate: string) =>
    request("/exercises/strength", {
      method: "POST",
      body: JSON.stringify({ log_date: logDate, exercise_code, minutes }),
    }),
  getStrengthTemplates: () =>
    request<Array<{ code: string; name: string; met: number }>>(
      "/exercises/strength/templates"
    ),
};
