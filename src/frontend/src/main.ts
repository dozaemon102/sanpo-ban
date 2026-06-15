import "./styles/notion.css";
import { api } from "./api/client";
import { openBarcodeFlow } from "./barcode-flow";
import type {
  DashboardTop,
  HistoryMetric,
  HistoryPeriod,
  Profile,
  ProfileUpdate,
} from "./types";

type Tab = "top" | "meals" | "exercise" | "settings";

const app = document.getElementById("app")!;
let currentTab: Tab = "top";
let historyView: { metric: HistoryMetric; label: string } | null = null;
let historyPeriod: HistoryPeriod = "day";

const CARD_ORDER: { metric: HistoryMetric; label: string; large?: boolean }[] = [
  { metric: "balance", label: "収支", large: true },
  { metric: "weight", label: "体重" },
  { metric: "intake", label: "摂取" },
  { metric: "bmr", label: "基礎代謝" },
  { metric: "exercise", label: "消費" },
  { metric: "steps", label: "歩数" },
  { metric: "body_fat_pct", label: "体脂肪率" },
  { metric: "bmi", label: "BMI" },
  { metric: "lbm", label: "LBM" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function formatValue(metric: HistoryMetric, value: number | null | undefined): string {
  if (value == null) return "--";
  if (metric === "balance") return `${Math.round(value)} kcal`;
  if (metric === "weight" || metric === "lbm") return `${value.toFixed(1)} kg`;
  if (metric === "body_fat_pct") return `${value.toFixed(1)} %`;
  if (metric === "bmi") return value.toFixed(1);
  if (metric === "steps") return `${Math.round(value).toLocaleString()} 歩`;
  return `${Math.round(value)} kcal`;
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
  return `<nav class="tab-bar">${tabs
    .map(
      (t) =>
        `<button class="tab ${currentTab === t.id ? "active" : ""}" data-tab="${t.id}">${t.label}</button>`
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
    const deficit =
      card.metric === "balance" && val != null && val < 0 ? " balance-deficit" : "";
    const size = card.large ? " card-hero" : "";
    return `
      <button type="button" class="metric-card${size}${deficit}" data-metric="${card.metric}" data-label="${card.label}">
        <div class="stat-label">${card.label}</div>
        <div class="stat-lg">${formatValue(card.metric, val)}</div>
        ${card.metric === "bmr" ? balanceHint : ""}
      </button>`;
  }).join("");

  return `
    <div class="page">
      <h1 class="page-title">健康管理</h1>
      <div class="card-scroll">${cardsHtml}</div>
      <p class="muted">カードをタップで推移を表示（マイナス収支＝痩せ方向）</p>
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

  app.innerHTML = `
    <div class="page">
      <button type="button" class="btn btn-block modal-secondary" id="history-back">← TOP</button>
      <h1 class="page-title">${historyView.label}</h1>
      <div class="segmented">
        ${periods
          .map(
            (p) =>
              `<button type="button" class="segment ${historyPeriod === p ? "active" : ""}" data-period="${p}">${periodLabels[p]}</button>`
          )
          .join("")}
      </div>
      <div class="card">
        ${hist.points
          .slice()
          .reverse()
          .map(
            (pt) =>
              `<div class="list-row"><div class="list-row-main"><strong>${pt.label}</strong></div><div>${formatValue(historyView!.metric, pt.value)}</div></div>`
          )
          .join("")}
      </div>
    </div>
  `;

  document.getElementById("history-back")!.addEventListener("click", () => {
    historyView = null;
    currentTab = "top";
    render();
  });
  document.querySelectorAll(".segment").forEach((el) => {
    el.addEventListener("click", () => {
      historyPeriod = (el as HTMLElement).dataset.period as HistoryPeriod;
      renderHistory();
    });
  });
}

async function renderMeals(): Promise<void> {
  const date = todayIso();
  const [presets, meals] = await Promise.all([api.getPresets(), api.getMeals(date)]);
  const totals = meals.reduce(
    (acc, m) => ({
      protein_g: acc.protein_g + m.protein_g,
      fat_g: acc.fat_g + m.fat_g,
      carbs_g: acc.carbs_g + m.carbs_g,
    }),
    { protein_g: 0, fat_g: 0, carbs_g: 0 }
  );

  app.innerHTML = `
    <div class="page">
      <h1 class="page-title">食事</h1>
      <div class="card mint">
        <div class="stat-label">今日の P / F / C 合計 (g)</div>
        <div class="stat-lg">${totals.protein_g.toFixed(1)} / ${totals.fat_g.toFixed(1)} / ${totals.carbs_g.toFixed(1)}</div>
      </div>
      <button class="btn btn-primary btn-block" id="barcode-btn">バーコード</button>
      <p class="muted">Myセット（${date}）</p>
      <div class="preset-grid">
        ${
          presets.length
            ? presets
                .map(
                  (p) =>
                    `<button class="preset-btn" data-id="${p.id}"><strong>${p.name}</strong><span class="muted">${p.kcal} kcal · P${p.protein_g} F${p.fat_g} C${p.carbs_g}</span></button>`
                )
                .join("")
            : `<p class="muted">Myセットがありません</p>`
        }
      </div>
      <div class="card" style="margin-top:16px">
        <div class="stat-label">今日の記録</div>
        ${
          meals.length
            ? meals
                .map(
                  (m) => `
            <div class="list-row">
              <div class="list-row-main">
                <strong>${m.name}</strong>
                <span class="muted"> · ${formatTime(m.logged_at)} · ${m.kcal} kcal</span>
              </div>
              <button type="button" class="btn-delete" data-delete-id="${m.id}" data-delete-kind="meal">削除</button>
            </div>`
                )
                .join("")
            : `<p class="muted">まだ記録がありません</p>`
        }
      </div>
    </div>
    ${renderTabs()}
  `;
  bindTabs();
  document.getElementById("barcode-btn")!.addEventListener("click", () => {
    openBarcodeFlow(date, renderMeals);
  });
  presets.forEach((p) => {
    document.querySelector(`[data-id="${p.id}"]`)!.addEventListener("click", async () => {
      await api.addMealFromPreset(p, date);
      await renderMeals();
    });
  });
  bindDeleteButtons('[data-delete-kind="meal"]', api.deleteMeal, renderMeals);
}

async function renderExercise(): Promise<void> {
  const date = todayIso();
  const [templates, treadmill, strength] = await Promise.all([
    api.getStrengthTemplates(),
    api.getTreadmillLogs(date),
    api.getStrengthLogs(date),
  ]);
  const templateNames = Object.fromEntries(templates.map((t) => [t.code, t.name]));

  app.innerHTML = `
    <div class="page">
      <h1 class="page-title">運動</h1>
      <div class="card">
        <h2 style="margin:0 0 8px;font-size:1rem">トレッドミル</h2>
        <div class="field"><label>分数</label><input id="tm-min" type="number" value="30" /></div>
        <div class="field"><label>マシン kcal（任意）</label><input id="tm-kcal" type="number" /></div>
        <button class="btn btn-primary btn-block" id="tm-btn">記録</button>
      </div>
      <div class="card">
        <h2 style="margin:0 0 8px;font-size:1rem">筋トレ</h2>
        <div class="field"><label>種目</label>
          <select id="st-code">${templates.map((t) => `<option value="${t.code}">${t.name}</option>`).join("")}</select>
        </div>
        <div class="field"><label>分数</label><input id="st-min" type="number" value="45" /></div>
        <button class="btn btn-primary btn-block" id="st-btn">記録</button>
      </div>
      <div class="card">
        <div class="stat-label">今日のトレッドミル</div>
        ${
          treadmill.length
            ? treadmill
                .map(
                  (t) => `
            <div class="list-row">
              <div class="list-row-main">
                <strong>${t.minutes} 分</strong>
                <span class="muted"> · ${formatTime(t.logged_at)} · ${t.calculated_kcal} kcal</span>
              </div>
              <button type="button" class="btn-delete" data-delete-id="${t.id}" data-delete-kind="treadmill">削除</button>
            </div>`
                )
                .join("")
            : `<p class="muted">まだ記録がありません</p>`
        }
      </div>
      <div class="card">
        <div class="stat-label">今日の筋トレ</div>
        ${
          strength.length
            ? strength
                .map(
                  (s) => `
            <div class="list-row">
              <div class="list-row-main">
                <strong>${templateNames[s.exercise_code] ?? s.exercise_code}</strong>
                <span class="muted"> · ${s.minutes} 分 · ${formatTime(s.logged_at)} · ${s.calculated_kcal} kcal</span>
              </div>
              <button type="button" class="btn-delete" data-delete-id="${s.id}" data-delete-kind="strength">削除</button>
            </div>`
                )
                .join("")
            : `<p class="muted">まだ記録がありません</p>`
        }
      </div>
    </div>
    ${renderTabs()}
  `;
  bindTabs();
  document.getElementById("tm-btn")!.addEventListener("click", async () => {
    const minutes = Number((document.getElementById("tm-min") as HTMLInputElement).value);
    const kcalRaw = (document.getElementById("tm-kcal") as HTMLInputElement).value;
    await api.addTreadmill(minutes, kcalRaw ? Number(kcalRaw) : undefined);
    await renderExercise();
  });
  document.getElementById("st-btn")!.addEventListener("click", async () => {
    const code = (document.getElementById("st-code") as HTMLSelectElement).value;
    const minutes = Number((document.getElementById("st-min") as HTMLInputElement).value);
    await api.addStrength(code, minutes);
    await renderExercise();
  });
  bindDeleteButtons('[data-delete-kind="treadmill"]', api.deleteTreadmill, renderExercise);
  bindDeleteButtons('[data-delete-kind="strength"]', api.deleteStrength, renderExercise);
}

async function renderSettings(existing: Profile | null, isSetup = false): Promise<void> {
  const p = existing ?? (await api.getProfile().catch(() => null));
  app.innerHTML = `
    <div class="page">
      <h1 class="page-title">${isSetup ? "初回設定" : "設定"}</h1>
      <form id="settings-form">
        <div class="field"><label>身長 (cm)</label><input name="height_cm" type="number" value="${p?.height_cm ?? 175}" required /></div>
        <div class="field"><label>生年月日</label><input name="birth_date" type="date" value="${p?.birth_date ?? "1990-01-15"}" required /></div>
        <div class="field"><label>性別</label>
          <select name="sex">
            <option value="male" ${p?.sex === "female" ? "" : "selected"}>男性</option>
            <option value="female" ${p?.sex === "female" ? "selected" : ""}>女性</option>
          </select>
        </div>
        <div class="field"><label>体重 (kg)</label><input name="current_weight_kg" type="number" step="0.1" value="${p?.initial_weight_kg ?? 72}" required /></div>
        <div class="field"><label>NEAT (kcal)</label><input name="neat_kcal" type="number" value="${p?.neat_kcal ?? 200}" required /></div>
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
