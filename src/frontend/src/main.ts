import "./styles/notion.css";
import { api } from "./api/client";
import type { DashboardToday, ProfileUpdate } from "./types";

type Tab = "today" | "meals" | "walks" | "exercise" | "week";

const app = document.getElementById("app")!;
let currentTab: Tab = "today";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function recordDate(iso: string): string {
  return iso.slice(0, 10);
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
      renderSetup();
      return false;
    }
    return true;
  } catch {
    renderSetup();
    return false;
  }
}

function renderSetup(): void {
  app.innerHTML = `
    <div class="page">
      <h1 class="page-title">初回設定</h1>
      <form id="setup-form">
        <div class="field"><label>身長 (cm)</label><input name="height_cm" type="number" value="175" required /></div>
        <div class="field"><label>生年月日</label><input name="birth_date" type="date" value="1990-01-15" required /></div>
        <div class="field"><label>性別</label>
          <select name="sex"><option value="male">男性</option><option value="female">女性</option></select>
        </div>
        <div class="field"><label>体重 (kg)</label><input name="current_weight_kg" type="number" step="0.1" value="72" required /></div>
        <div class="field"><label>活動量</label>
          <select name="activity_factor">
            <option value="1.2">低い</option>
            <option value="1.375" selected>やや active</option>
            <option value="1.55">active</option>
            <option value="1.725">高い</option>
          </select>
        </div>
        <button class="btn btn-primary btn-block" type="submit">はじめる</button>
        <p id="setup-error" class="error"></p>
      </form>
    </div>
  `;
  document.getElementById("setup-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const body: ProfileUpdate = {
      height_cm: Number(fd.get("height_cm")),
      birth_date: String(fd.get("birth_date")),
      sex: String(fd.get("sex")) as "male" | "female",
      activity_factor: Number(fd.get("activity_factor")),
      current_weight_kg: Number(fd.get("current_weight_kg")),
      setup_completed: true,
    };
    try {
      await api.putProfile(body);
      currentTab = "today";
      await render();
    } catch (err) {
      (document.getElementById("setup-error")!.textContent = String(err));
    }
  });
}

function renderTabs(): string {
  const tabs: { id: Tab; label: string }[] = [
    { id: "today", label: "今日" },
    { id: "meals", label: "食事" },
    { id: "walks", label: "散歩" },
    { id: "exercise", label: "運動" },
    { id: "week", label: "週" },
  ];
  return `<nav class="tab-bar">${tabs
    .map(
      (t) =>
        `<button class="tab ${currentTab === t.id ? "active" : ""}" data-tab="${t.id}">${t.label}</button>`
    )
    .join("")}</nav>`;
}

function renderDashboard(d: DashboardToday, todayWeightsHtml = ""): string {
  return `
    <div class="page">
      <h1 class="page-title">今日</h1>
      <div class="card mint">
        <div class="stat-label">残り kcal</div>
        <div class="stat-lg">${Math.round(d.remaining.kcal)}</div>
        <div class="muted">摂取 ${d.intake.kcal} / 目標 ${d.targets.kcal} + 消費 ${d.burn.total_kcal}</div>
      </div>
      <div class="card peach">
        <div class="stat-label">P / F / C 残り (g)</div>
        <div>${d.remaining.protein_g} / ${d.remaining.fat_g} / ${d.remaining.carbs_g}</div>
      </div>
      <div class="card sky">
        <div class="stat-label">消費 kcal 内訳</div>
        <div>歩行 ${d.burn.walk_kcal} · ミル ${d.burn.treadmill_kcal} · 筋トレ ${d.burn.strength_kcal}</div>
      </div>
      <div class="card lavender">
        <div class="stat-label">歩数 / 体重</div>
        <div class="stat-lg">${d.steps.toLocaleString()} 歩</div>
        <div>${d.weight_kg != null ? `${d.weight_kg} kg` : "—"} · 散歩 ${d.walk_sessions_today} 回</div>
      </div>
      ${todayWeightsHtml}
      <button class="btn btn-primary fab" id="walk-fab">散歩した</button>
    </div>
    ${renderTabs()}
  `;
}

async function renderToday(): Promise<void> {
  const date = todayIso();
  const [d, weights] = await Promise.all([api.getDashboard(), api.getWeights()]);
  const todayWeights = weights.filter((w) => recordDate(w.logged_at) === date);
  const todayWeightsHtml = todayWeights.length
    ? `
      <div class="card">
        <div class="stat-label">今日の体重記録（削除可）</div>
        ${todayWeights
          .map(
            (w) => `
          <div class="list-row">
            <div class="list-row-main">
              <strong>${w.weight_kg} kg</strong>
              <span class="muted"> · ${formatTime(w.logged_at)} · ${w.source}</span>
            </div>
            <button type="button" class="btn-delete" data-delete-id="${w.id}" data-delete-kind="weight">削除</button>
          </div>`
          )
          .join("")}
      </div>`
    : "";
  app.innerHTML = renderDashboard(d, todayWeightsHtml);
  bindTabs();
  document.getElementById("walk-fab")!.addEventListener("click", async () => {
    const note = prompt("発見メモ（任意）") ?? undefined;
    await api.recordWalk(note);
    await renderToday();
  });
  bindDeleteButtons('[data-delete-kind="weight"]', api.deleteWeight, renderToday);
}

async function renderMeals(): Promise<void> {
  const date = todayIso();
  const [presets, meals] = await Promise.all([api.getPresets(), api.getMeals(date)]);
  app.innerHTML = `
    <div class="page">
      <h1 class="page-title">食事</h1>
      <p class="muted">定番をタップで記録（${date}）</p>
      <div class="preset-grid">
        ${
          presets.length
            ? presets
                .map(
                  (p) =>
                    `<button class="preset-btn" data-id="${p.id}"><strong>${p.name}</strong><span class="muted">${p.kcal} kcal · P${p.protein_g} F${p.fat_g} C${p.carbs_g}</span></button>`
                )
                .join("")
            : `<p class="muted">プリセットがありません。API から追加してください。</p>`
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
  presets.forEach((p) => {
    document.querySelector(`[data-id="${p.id}"]`)!.addEventListener("click", async () => {
      await api.addMealFromPreset(p, date);
      await renderMeals();
    });
  });
  bindDeleteButtons('[data-delete-kind="meal"]', api.deleteMeal, renderMeals);
}

async function renderWalks(): Promise<void> {
  const date = todayIso();
  const walks = (await api.getWalks()).filter((w) => recordDate(w.walked_at) === date);
  app.innerHTML = `
    <div class="page">
      <h1 class="page-title">散歩</h1>
      <button class="btn btn-primary btn-block" id="walk-btn">散歩した</button>
      <p class="muted" style="margin-top:12px">iPhone の歩数はショートカットで自動同期されます。</p>
      <div class="card" style="margin-top:16px">
        <div class="stat-label">今日の散歩</div>
        ${
          walks.length
            ? walks
                .map(
                  (w) => `
            <div class="list-row">
              <div class="list-row-main">
                <strong>${formatTime(w.walked_at)}</strong>
                <span class="muted">${w.discovery_note ? ` · ${w.discovery_note}` : ""}</span>
              </div>
              <button type="button" class="btn-delete" data-delete-id="${w.id}" data-delete-kind="walk">削除</button>
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
  document.getElementById("walk-btn")!.addEventListener("click", async () => {
    const note = prompt("発見メモ（任意）") ?? undefined;
    await api.recordWalk(note);
    await renderWalks();
  });
  bindDeleteButtons('[data-delete-kind="walk"]', api.deleteWalk, renderWalks);
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

async function renderWeek(): Promise<void> {
  const w = await api.getWeekSummary();
  app.innerHTML = `
    <div class="page">
      <h1 class="page-title">週サマリー</h1>
      <div class="card mint">
        <div class="stat-label">平均摂取 kcal</div>
        <div class="stat-lg">${w.avg_intake_kcal}</div>
      </div>
      <div class="card sky">
        <div class="stat-label">平均歩数</div>
        <div class="stat-lg">${Math.round(w.avg_steps).toLocaleString()}</div>
      </div>
      <div class="card lavender">
        <div class="stat-label">運動回数</div>
        <div>散歩 ${w.counts.walk_sessions} · ミル ${w.counts.treadmill_sessions} · 筋トレ ${w.counts.strength_sessions}</div>
      </div>
      <div class="card">
        <div class="stat-label">体重推移</div>
        ${w.weight_trend
          .map((r) => `<div class="list-item">${r.date}: ${r.weight_kg ?? "—"} kg</div>`)
          .join("")}
      </div>
    </div>
    ${renderTabs()}
  `;
  bindTabs();
}

function bindTabs(): void {
  document.querySelectorAll(".tab").forEach((el) => {
    el.addEventListener("click", () => {
      currentTab = (el as HTMLElement).dataset.tab as Tab;
      render();
    });
  });
}

async function render(): Promise<void> {
  if (!(await ensureProfile())) return;
  try {
    if (currentTab === "today") await renderToday();
    else if (currentTab === "meals") await renderMeals();
    else if (currentTab === "walks") await renderWalks();
    else if (currentTab === "exercise") await renderExercise();
    else if (currentTab === "week") await renderWeek();
  } catch (err) {
    app.innerHTML = `<div class="page"><p class="error">${String(err)}</p></div>${renderTabs()}`;
    bindTabs();
  }
}

render();
