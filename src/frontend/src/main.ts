import "./styles/notion.css";
import { api } from "./api/client";
import { openMealEntryFlow } from "./meal-entry-flow";
import { mountHistoryChart } from "./history-chart";
import type {
  DashboardTop,
  HistoryMetric,
  HistoryPeriod,
  MealSlot,
  Profile,
  ProfileUpdate,
} from "./types";

type Tab = "top" | "meals" | "exercise" | "settings";

const app = document.getElementById("app")!;
let currentTab: Tab = "top";
let historyView: { metric: HistoryMetric; label: string } | null = null;
let historyPeriod: HistoryPeriod = "day";
let selectedDate = new Date().toISOString().slice(0, 10);

const MEAL_SLOTS: { id: MealSlot; label: string; icon: string }[] = [
  {
    id: "breakfast",
    label: "朝食",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="4" fill="currentColor" opacity=".25"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" stroke-linecap="round"/></svg>`,
  },
  {
    id: "lunch",
    label: "昼食",
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5" opacity=".85"/><path d="M12 3v2M12 19v2M5 12H3M21 12h-2" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`,
  },
  {
    id: "dinner",
    label: "夕食",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 14a4 4 0 018 0" fill="currentColor" opacity=".2"/><path d="M12 3a7 7 0 00-7 7c0 3.5 2 6.5 5 7.8V20h4v-2.2c3-1.3 5-4.3 5-7.8a7 7 0 00-7-7z" stroke-linecap="round"/></svg>`,
  },
  {
    id: "snack",
    label: "間食",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 10h12v8a2 2 0 01-2 2H8a2 2 0 01-2-2v-8z" fill="currentColor" opacity=".2"/><path d="M8 10V8a4 4 0 018 0v2M10 14h4" stroke-linecap="round"/></svg>`,
  },
];

const CARD_ORDER: {
  metric: HistoryMetric;
  label: string;
  large?: boolean;
  tone: string;
  icon: string;
}[] = [
  {
    metric: "balance",
    label: "収支",
    large: true,
    tone: "violet",
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16c0-4 3-7 7-7s7 3 7 7v2H5v-2z" opacity=".25"/><path d="M7 17h10M9 14h6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M12 5v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  },
  {
    metric: "weight",
    label: "体重",
    tone: "orange",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="10" width="16" height="10" rx="3" fill="currentColor" opacity=".18"/><circle cx="12" cy="13" r="4"/><path d="M8 10V8a4 4 0 018 0v2"/></svg>`,
  },
  {
    metric: "intake",
    label: "摂取",
    tone: "green",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 4v7a6 6 0 0012 0V4" fill="currentColor" opacity=".15"/><path d="M6 4v7a6 6 0 0012 0V4M8 20h8" stroke-linecap="round"/></svg>`,
  },
  {
    metric: "bmr",
    label: "基礎代謝",
    tone: "blue",
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="8" r="2.2" opacity=".7"/><circle cx="16" cy="7" r="1.8" opacity=".55"/><circle cx="12" cy="14" r="2.4" opacity=".85"/><path d="M8 8l4 4M16 7l-2 5" stroke="currentColor" stroke-width="1.4" fill="none" opacity=".9"/></svg>`,
  },
  {
    metric: "exercise",
    label: "消費",
    tone: "coral",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="15" cy="5.5" r="2" fill="currentColor" opacity=".3"/><path d="M4 19l5-7 3 3 5-8 3 6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    metric: "steps",
    label: "歩数",
    tone: "teal",
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="8" cy="6" rx="2.2" ry="2.8" opacity=".75"/><ellipse cx="13" cy="10" rx="2.2" ry="2.8" opacity=".85"/><ellipse cx="17" cy="15" rx="2.2" ry="2.8"/><path d="M8 8.8v3.4M13 12.8v3.4" stroke="currentColor" stroke-width="1.2" fill="none" opacity=".5"/></svg>`,
  },
  {
    metric: "body_fat_pct",
    label: "体脂肪率",
    tone: "amber",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 4c3 2 5 4.5 5 8a5 5 0 01-10 0c0-3.5 2-6 5-8z" fill="currentColor" opacity=".2"/><path d="M9 12h6M12 9v6" stroke-linecap="round"/></svg>`,
  },
  {
    metric: "bmi",
    label: "BMI",
    tone: "rose",
    icon: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="14" width="3.5" height="6" rx="1" opacity=".55"/><rect x="10.25" y="10" width="3.5" height="10" rx="1" opacity=".75"/><rect x="15.5" y="6" width="3.5" height="14" rx="1"/></svg>`,
  },
  {
    metric: "lbm",
    label: "除脂肪体重",
    tone: "sky",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="5" r="2.2" fill="currentColor" opacity=".25"/><path d="M8.5 21v-4.5a3.5 3.5 0 017 0V21" fill="currentColor" opacity=".18"/><path d="M7 12c1.5-1 3-1.5 5-1.5s3.5.5 5 1.5"/></svg>`,
  },
];

const METRIC_ACCENT: Record<string, string> = {
  violet: "#7c5cff",
  orange: "#f59e0b",
  green: "#10b981",
  blue: "#3b82f6",
  coral: "#f97316",
  teal: "#14b8a6",
  amber: "#eab308",
  rose: "#f43f5e",
  sky: "#0ea5e9",
};

function metricAccent(metric: HistoryMetric): string {
  const card = CARD_ORDER.find((c) => c.metric === metric);
  return METRIC_ACCENT[card?.tone ?? "violet"] ?? METRIC_ACCENT.violet;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMonthJa(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

function formatStripDay(iso: string): { primary: string; secondary: string; isToday: boolean } {
  const d = new Date(`${iso}T12:00:00`);
  const dow = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  const isToday = iso === todayIso();
  return {
    primary: isToday ? "今日" : String(d.getDate()),
    secondary: dow,
    isToday,
  };
}

function buildDateStrip(anchor: string): string[] {
  const base = new Date(`${anchor}T12:00:00`);
  const dates: string[] = [];
  for (let offset = -3; offset <= 3; offset += 1) {
    const d = new Date(base);
    d.setDate(d.getDate() + offset);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function renderDateStrip(anchor: string, tab: "meals" | "exercise"): string {
  return `
    <div class="date-strip" role="tablist" aria-label="日付選択">
      ${buildDateStrip(anchor)
        .map((iso) => {
          const { primary, secondary, isToday } = formatStripDay(iso);
          const active = iso === anchor ? " active" : "";
          const today = isToday ? " today" : "";
          return `<button type="button" class="date-strip__item${active}${today}" data-date="${iso}" data-date-tab="${tab}">
            <span class="date-strip__primary">${primary}</span>
            <span class="date-strip__secondary">${secondary}</span>
          </button>`;
        })
        .join("")}
    </div>`;
}

function bindDateStrip(tab: "meals" | "exercise", rerender: () => Promise<void>): void {
  document.querySelectorAll(`[data-date-tab="${tab}"]`).forEach((el) => {
    el.addEventListener("click", async () => {
      selectedDate = (el as HTMLElement).dataset.date ?? todayIso();
      await rerender();
    });
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function formatValue(metric: HistoryMetric, value: number | null | undefined): string {
  const parts = formatMetricParts(metric, value);
  if (parts.unit) return `${parts.number} ${parts.unit}`;
  return parts.number;
}

function formatMetricParts(
  metric: HistoryMetric,
  value: number | null | undefined
): { number: string; unit: string } {
  if (value == null) return { number: "--", unit: "" };
  if (metric === "balance") return { number: `${Math.round(value)}`, unit: "kcal" };
  if (metric === "weight" || metric === "lbm")
    return { number: value.toFixed(1), unit: "kg" };
  if (metric === "body_fat_pct") return { number: value.toFixed(1), unit: "%" };
  if (metric === "bmi") return { number: value.toFixed(1), unit: "" };
  if (metric === "steps") return { number: Math.round(value).toLocaleString(), unit: "歩" };
  return { number: `${Math.round(value)}`, unit: "kcal" };
}

function cardValue(d: DashboardTop, metric: HistoryMetric): number | null {
  if (metric === "balance") return d.balance.computable ? d.balance.value : null;
  const c = d.cards;
  const map: Record<HistoryMetric, number | null> = {
    balance: d.balance.value,
    weight: c.weight_kg,
    intake: c.intake_kcal,
    bmr: c.bmr_kcal,
    exercise: c.exercise_kcal,
    steps: c.steps,
    body_fat_pct: c.body_fat_pct,
    bmi: c.bmi,
    lbm: c.lbm_kg,
  };
  return map[metric];
}

function bindDeleteButtons(
  selector: string,
  onDelete: (id: number) => Promise<void>,
  rerender: () => Promise<void>
): void {
  document.querySelectorAll(selector).forEach((el) => {
    el.addEventListener("click", async () => {
      const id = Number((el as HTMLElement).dataset.deleteId);
      if (!Number.isFinite(id)) return;
      if (!confirm("この記録を削除しますか？")) return;
      await onDelete(id);
      await rerender();
    });
  });
}

async function ensureProfile(): Promise<boolean> {
  try {
    const p = await api.getProfile();
    if (!p.setup_completed) {
      currentTab = "settings";
      await renderSettings(p, true);
      return false;
    }
    return true;
  } catch {
    currentTab = "settings";
    await renderSettings(null, true);
    return false;
  }
}

function renderTabs(): string {
  const tabs: { id: Tab; label: string }[] = [
    { id: "top", label: "TOP" },
    { id: "meals", label: "食事" },
    { id: "exercise", label: "運動" },
    { id: "settings", label: "設定" },
  ];
  const activeTab = historyView ? "top" : currentTab;
  return `<nav class="tab-bar">${tabs
    .map(
      (t) =>
        `<button class="tab ${activeTab === t.id ? "active" : ""}" data-tab="${t.id}">${t.label}</button>`
    )
    .join("")}</nav>`;
}

function bindTabs(): void {
  document.querySelectorAll(".tab").forEach((el) => {
    el.addEventListener("click", () => {
      historyView = null;
      currentTab = (el as HTMLElement).dataset.tab as Tab;
      render();
    });
  });
}

function renderTopCards(d: DashboardTop): string {
  const balanceHint =
    d.bmr_status === "lbm_missing"
      ? `<p class="muted card-hint">Health で LBM を同期してください</p>`
      : "";

  const cardsHtml = CARD_ORDER.map((card) => {
    const val = cardValue(d, card.metric);
    const parts = formatMetricParts(card.metric, val);
    const deficit =
      card.metric === "balance" && val != null && val < 0 ? " balance-deficit" : "";
    const hero = card.large ? " metric-card--hero" : "";
    const extra = card.metric === "bmr" ? balanceHint : "";
    return `
      <button type="button" class="metric-card metric-card--${card.tone}${hero}${deficit}" data-metric="${card.metric}" data-label="${card.label}">
        <div class="metric-card__body">
          <div class="metric-card__value">
            <span class="metric-card__number">${parts.number}</span>
            ${parts.unit ? `<span class="metric-card__unit">${parts.unit}</span>` : ""}
          </div>
          <div class="metric-card__label">${card.label}</div>
          ${extra}
        </div>
        <div class="metric-card__icon" aria-hidden="true">${card.icon}</div>
      </button>`;
  }).join("");

  return `
    <div class="page">
      <header class="page-header">
        <h1 class="page-title">健康管理</h1>
        <p class="page-subtitle">今日 · ${d.date}</p>
      </header>
      <div class="metric-grid">${cardsHtml}</div>
      <p class="muted page-footnote">タップで推移 · マイナス収支＝痩せ方向</p>
    </div>
    ${renderTabs()}`;
}

async function renderTop(): Promise<void> {
  const d = await api.getDashboardTop();
  app.innerHTML = renderTopCards(d);
  bindTabs();
  document.querySelectorAll(".metric-card").forEach((el) => {
    el.addEventListener("click", () => {
      historyView = {
        metric: (el as HTMLElement).dataset.metric as HistoryMetric,
        label: (el as HTMLElement).dataset.label ?? "",
      };
      historyPeriod = "day";
      renderHistory();
    });
  });
}

async function renderHistory(): Promise<void> {
  if (!historyView) return;
  const date = todayIso();
  const hist = await api.getDashboardHistory(historyView.metric, historyPeriod, date);
  const periods: HistoryPeriod[] = ["day", "week", "month", "year"];
  const periodLabels: Record<HistoryPeriod, string> = {
    day: "日",
    week: "週",
    month: "月",
    year: "年",
  };
  const accent = metricAccent(historyView.metric);

  app.innerHTML = `
    <div class="page">
      <header class="page-header">
        <h1 class="page-title">${historyView.label}</h1>
        <p class="page-subtitle">推移 · ${periodLabels[historyPeriod]}</p>
      </header>
      <div class="segmented">
        ${periods
          .map(
            (p) =>
              `<button type="button" class="segment ${historyPeriod === p ? "active" : ""}" data-period="${p}">${periodLabels[p]}</button>`
          )
          .join("")}
      </div>
      <div class="card history-chart-card">
        <div id="history-chart" class="history-chart"></div>
      </div>
    </div>
    ${renderTabs()}
  `;

  bindTabs();
  const chartEl = document.getElementById("history-chart");
  if (chartEl) {
    mountHistoryChart(chartEl, historyView.metric, hist.points, historyPeriod, accent);
  }

  document.querySelectorAll(".segment").forEach((el) => {
    el.addEventListener("click", () => {
      historyPeriod = (el as HTMLElement).dataset.period as HistoryPeriod;
      renderHistory();
    });
  });
}

async function renderMeals(): Promise<void> {
  const date = selectedDate;
  const meals = await api.getMeals(date);
  const totals = meals.reduce(
    (acc, m) => ({
      protein_g: acc.protein_g + m.protein_g,
      fat_g: acc.fat_g + m.fat_g,
      carbs_g: acc.carbs_g + m.carbs_g,
      kcal: acc.kcal + m.kcal,
    }),
    { protein_g: 0, fat_g: 0, carbs_g: 0, kcal: 0 }
  );
  const mealsBySlot = Object.fromEntries(MEAL_SLOTS.map((s) => [s.id, [] as typeof meals])) as Record<
    MealSlot,
    typeof meals
  >;
  meals.forEach((m) => {
    const slot = m.meal_slot ?? "snack";
    mealsBySlot[slot].push(m);
  });

  const slotSections = MEAL_SLOTS.map((slot) => {
    const slotMeals = mealsBySlot[slot.id];
    const slotKcal = slotMeals.reduce((sum, m) => sum + m.kcal, 0);
    const itemsHtml = slotMeals.length
      ? slotMeals
          .map(
            (m) => `
          <div class="record-item">
            <div class="record-item__main">
              <strong>${m.name}</strong>
              <span class="muted">${m.kcal} kcal · P${m.protein_g.toFixed(1)} F${m.fat_g.toFixed(1)} C${m.carbs_g.toFixed(1)}</span>
            </div>
            <button type="button" class="btn-delete" data-delete-id="${m.id}" data-delete-kind="meal">削除</button>
          </div>`
          )
          .join("")
      : `<p class="record-empty">まだ記録がありません</p>`;

    return `
      <section class="record-section meal-section">
        <div class="record-section__head">
          <div class="record-section__icon" aria-hidden="true">${slot.icon}</div>
          <div class="record-section__title">
            <strong>${slot.label}</strong>
            <span class="record-section__value">${slotKcal > 0 ? `${slotKcal} kcal` : "—"}</span>
          </div>
        </div>
        <div class="record-section__body">${itemsHtml}</div>
        <div class="record-section__actions">
          <button type="button" class="record-action-btn record-action-btn--primary" data-entry-btn data-meal-slot="${slot.id}">
            入力
          </button>
        </div>
      </section>`;
  }).join("");

  app.innerHTML = `
    <div class="page page--record">
      <header class="record-banner">
        <div>
          <h1 class="record-banner__title">食事</h1>
          <p class="record-banner__month">${formatMonthJa(date)}</p>
        </div>
        <div class="record-banner__total">
          <span class="record-banner__total-label">合計</span>
          <span class="record-banner__total-value">${totals.kcal} kcal</span>
        </div>
      </header>
      ${renderDateStrip(date, "meals")}
      <div class="record-summary card">
        <div class="record-summary__label">P / F / C 合計</div>
        <div class="record-summary__value">${totals.protein_g.toFixed(1)} <span class="muted">/ ${totals.fat_g.toFixed(1)} / ${totals.carbs_g.toFixed(1)} g</span></div>
      </div>
      ${slotSections}
    </div>
    ${renderTabs()}
  `;
  bindTabs();
  bindDateStrip("meals", renderMeals);
  document.querySelectorAll("[data-entry-btn]").forEach((el) => {
    el.addEventListener("click", () => {
      const slot = (el as HTMLElement).dataset.mealSlot as MealSlot;
      openMealEntryFlow(date, slot, renderMeals);
    });
  });
  bindDeleteButtons('[data-delete-kind="meal"]', api.deleteMeal, renderMeals);
}

async function renderExercise(): Promise<void> {
  const date = selectedDate;
  const [templates, treadmill, strength, dashboard] = await Promise.all([
    api.getStrengthTemplates(),
    api.getTreadmillLogs(date),
    api.getStrengthLogs(date),
    api.getDashboardTop(date),
  ]);
  const templateNames = Object.fromEntries(templates.map((t) => [t.code, t.name]));
  const cards = dashboard.cards;
  const steps = cards.steps;
  const walkKcal = cards.walk_kcal;
  const treadmillKcal = treadmill.reduce((s, t) => s + t.calculated_kcal, 0);
  const strengthKcal = strength.reduce((s, t) => s + t.calculated_kcal, 0);
  const totalExerciseKcal = walkKcal + treadmillKcal + strengthKcal;
  const walkMeta =
    cards.stride_cm != null && cards.walking_speed_kmh != null
      ? `歩幅 ${cards.stride_cm} cm · 速度 ${cards.walking_speed_kmh} km/h`
      : cards.walk_calc_method === "met"
        ? ""
        : "歩幅・速度未設定（簡易式）";

  const treadmillItems = treadmill.length
    ? treadmill
        .map(
          (t) => `
        <div class="record-item">
          <div class="record-item__main">
            <strong>トレッドミル ${t.minutes} 分</strong>
            <span class="muted">${formatTime(t.logged_at)} · ${t.calculated_kcal} kcal</span>
          </div>
          <button type="button" class="btn-delete" data-delete-id="${t.id}" data-delete-kind="treadmill">削除</button>
        </div>`
        )
        .join("")
    : `<p class="record-empty">まだ記録がありません</p>`;

  const strengthItems = strength.length
    ? strength
        .map(
          (s) => `
        <div class="record-item">
          <div class="record-item__main">
            <strong>${templateNames[s.exercise_code] ?? s.exercise_code}</strong>
            <span class="muted">${s.minutes} 分 · ${formatTime(s.logged_at)} · ${s.calculated_kcal} kcal</span>
          </div>
          <button type="button" class="btn-delete" data-delete-id="${s.id}" data-delete-kind="strength">削除</button>
        </div>`
        )
        .join("")
    : `<p class="record-empty">まだ記録がありません</p>`;

  app.innerHTML = `
    <div class="page page--record">
      <header class="record-banner">
        <div>
          <h1 class="record-banner__title">運動</h1>
          <p class="record-banner__month">${formatMonthJa(date)}</p>
        </div>
        <div class="record-banner__total">
          <span class="record-banner__total-label">消費</span>
          <span class="record-banner__total-value">${totalExerciseKcal} kcal</span>
        </div>
      </header>
      ${renderDateStrip(date, "exercise")}
      <section class="record-section exercise-section">
        <div class="record-section__head">
          <div class="record-section__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="14" cy="6" r="2.2" fill="currentColor" opacity=".25"/><path d="M4 19l5-7 3 3 5-8 3 6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div class="record-section__title">
            <strong>運動（歩数）</strong>
            <span class="record-section__value">${steps.toLocaleString()} 歩 · ${walkKcal} kcal</span>
          </div>
        </div>
        ${walkMeta ? `<p class="record-meta muted">${walkMeta}</p>` : ""}
      </section>
      <section class="record-section exercise-section">
        <div class="record-section__head">
          <div class="record-section__icon record-section__icon--blue" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 15h16M6 15l2-8h8l2 8" fill="currentColor" opacity=".15"/><path d="M8 19h8" stroke-linecap="round"/></svg>
          </div>
          <div class="record-section__title">
            <strong>トレッドミル</strong>
            <span class="record-section__value">${treadmillKcal} kcal</span>
          </div>
          <button type="button" class="record-section__edit" data-toggle-form="tm-form" aria-label="トレッドミルを記録">記録</button>
        </div>
        <div class="record-section__body">${treadmillItems}</div>
        <form id="tm-form" class="record-form is-collapsed">
          <div class="field"><label>分数</label><input id="tm-min" type="number" value="30" /></div>
          <div class="field"><label>マシン kcal（任意）</label><input id="tm-kcal" type="number" /></div>
          <button class="btn btn-primary btn-block" type="submit">追加</button>
        </form>
      </section>
      <section class="record-section exercise-section">
        <div class="record-section__head">
          <div class="record-section__icon record-section__icon--orange" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="5" r="2.2" fill="currentColor" opacity=".25"/><path d="M8 21v-5a4 4 0 018 0v5M7 12c1.5-1 3-1.5 5-1.5s3.5.5 5 1.5"/></svg>
          </div>
          <div class="record-section__title">
            <strong>筋トレ</strong>
            <span class="record-section__value">${strengthKcal} kcal</span>
          </div>
          <button type="button" class="record-section__edit" data-toggle-form="st-form" aria-label="筋トレを記録">記録</button>
        </div>
        <div class="record-section__body">${strengthItems}</div>
        <form id="st-form" class="record-form is-collapsed">
          <div class="field"><label>種目</label>
            <select id="st-code">${templates.map((t) => `<option value="${t.code}">${t.name}</option>`).join("")}</select>
          </div>
          <div class="field"><label>分数</label><input id="st-min" type="number" value="45" /></div>
          <button class="btn btn-primary btn-block" type="submit">追加</button>
        </form>
      </section>
    </div>
    ${renderTabs()}
  `;
  bindTabs();
  bindDateStrip("exercise", renderExercise);
  document.querySelectorAll("[data-toggle-form]").forEach((el) => {
    el.addEventListener("click", () => {
      const formId = (el as HTMLElement).dataset.toggleForm;
      document.getElementById(formId!)?.classList.toggle("is-collapsed");
    });
  });
  document.getElementById("tm-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const minutes = Number((document.getElementById("tm-min") as HTMLInputElement).value);
    const kcalRaw = (document.getElementById("tm-kcal") as HTMLInputElement).value;
    await api.addTreadmill(minutes, date, kcalRaw ? Number(kcalRaw) : undefined);
    await renderExercise();
  });
  document.getElementById("st-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = (document.getElementById("st-code") as HTMLSelectElement).value;
    const minutes = Number((document.getElementById("st-min") as HTMLInputElement).value);
    await api.addStrength(code, minutes, date);
    await renderExercise();
  });
  bindDeleteButtons('[data-delete-kind="treadmill"]', api.deleteTreadmill, renderExercise);
  bindDeleteButtons('[data-delete-kind="strength"]', api.deleteStrength, renderExercise);
}

async function renderSettings(existing: Profile | null, isSetup = false): Promise<void> {
  const p = existing ?? (await api.getProfile().catch(() => null));
  app.innerHTML = `
    <div class="page">
      <header class="page-header">
        <h1 class="page-title">${isSetup ? "初回設定" : "設定"}</h1>
        ${isSetup ? `<p class="page-subtitle">プロフィールを入力してください</p>` : ""}
      </header>
      <form id="settings-form" class="card">
        <div class="field"><label>身長 (cm)</label><input name="height_cm" type="number" value="${p?.height_cm ?? 175}" required /></div>
        <div class="field"><label>生年月日</label><input name="birth_date" type="date" value="${p?.birth_date ?? "1990-01-15"}" required /></div>
        <div class="field"><label>性別</label>
          <select name="sex">
            <option value="male" ${p?.sex === "female" ? "" : "selected"}>男性</option>
            <option value="female" ${p?.sex === "female" ? "selected" : ""}>女性</option>
          </select>
        </div>
        <div class="field"><label>体重 (kg)</label><input name="current_weight_kg" type="number" step="0.1" value="${p?.initial_weight_kg ?? 72}" required /></div>
        <div class="field">
          <label>NEAT（屋内）kcal</label>
          <input name="neat_kcal" type="number" value="${p?.neat_kcal ?? 180}" required />
          <p class="field-hint muted">家の中だけの活動（料理・掃除など）。目安 150〜220 kcal。歩数は屋外分として別計上。</p>
        </div>
        <div class="field"><label>TEF 率 (%)</label><input name="tef_pct" type="number" step="1" value="${((p?.tef_rate ?? 0.1) * 100).toFixed(0)}" required /></div>
        <button class="btn btn-primary btn-block" type="submit">${isSetup ? "はじめる" : "保存"}</button>
        <p id="settings-error" class="error"></p>
      </form>
    </div>
    ${isSetup ? "" : renderTabs()}
  `;
  if (!isSetup) bindTabs();
  document.getElementById("settings-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const body: ProfileUpdate = {
      height_cm: Number(fd.get("height_cm")),
      birth_date: String(fd.get("birth_date")),
      sex: String(fd.get("sex")) as "male" | "female",
      current_weight_kg: Number(fd.get("current_weight_kg")),
      neat_kcal: Number(fd.get("neat_kcal")),
      tef_rate: Number(fd.get("tef_pct")) / 100,
      setup_completed: true,
    };
    try {
      await api.putProfile(body);
      if (isSetup) {
        currentTab = "top";
        await render();
      } else {
        await renderSettings(await api.getProfile());
      }
    } catch (err) {
      (document.getElementById("settings-error")!.textContent = String(err));
    }
  });
}

async function render(): Promise<void> {
  if (historyView) {
    await renderHistory();
    return;
  }
  if (currentTab !== "settings" && !(await ensureProfile())) return;
  try {
    if (currentTab === "top") await renderTop();
    else if (currentTab === "meals") await renderMeals();
    else if (currentTab === "exercise") await renderExercise();
    else if (currentTab === "settings") await renderSettings(await api.getProfile());
  } catch (err) {
    app.innerHTML = `<div class="page"><p class="error">${String(err)}</p></div>${renderTabs()}`;
    bindTabs();
  }
}

render();
