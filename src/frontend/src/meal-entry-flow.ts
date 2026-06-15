import { api } from "./api/client";
import { openBarcodeFlow, openManualMealFlow } from "./barcode-flow";
import type { FoodPreset, MealSlot } from "./types";

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

function openModal(innerHtml: string, onMount: (body: HTMLElement, close: () => void) => void): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal-card"><div id="entry-modal-body"></div></div>`;
  document.body.appendChild(overlay);
  const body = overlay.querySelector("#entry-modal-body") as HTMLElement;
  body.innerHTML = innerHtml;
  const close = (): void => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  onMount(body, close);
}

function showEntryMenu(logDate: string, mealSlot: MealSlot, onDone: () => Promise<void>): void {
  openModal(
    `
    <h2 class="modal-title">${SLOT_LABELS[mealSlot]}を入力</h2>
    <p class="muted">記録方法を選んでください</p>
    <button class="btn btn-primary btn-block entry-menu-btn" data-choice="barcode">バーコード</button>
    <button class="btn btn-block entry-menu-btn modal-secondary" data-choice="manual">手入力</button>
    <button class="btn btn-block entry-menu-btn modal-secondary" data-choice="preset">Myセット</button>
    <button class="btn btn-block modal-secondary" id="entry-close">キャンセル</button>
  `,
    (body, close) => {
      document.getElementById("entry-close")!.addEventListener("click", close);
      body.querySelectorAll(".entry-menu-btn").forEach((el) => {
        el.addEventListener("click", () => {
          const choice = (el as HTMLElement).dataset.choice;
          close();
          if (choice === "barcode") openBarcodeFlow(logDate, onDone, "meal", mealSlot);
          else if (choice === "manual") openManualMealFlow(logDate, onDone, "meal", mealSlot);
          else if (choice === "preset") void showPresetFlow(logDate, mealSlot, onDone);
        });
      });
    }
  );
}

function showPresetRegisterMenu(
  logDate: string,
  mealSlot: MealSlot,
  onDone: () => Promise<void>
): void {
  openModal(
    `
    <h2 class="modal-title">Myセット登録</h2>
    <p class="muted">登録方法を選んでください</p>
    <button class="btn btn-primary btn-block entry-menu-btn" data-choice="barcode">バーコード</button>
    <button class="btn btn-block entry-menu-btn modal-secondary" data-choice="manual">手入力</button>
    <button class="btn btn-block modal-secondary" id="preset-register-back">戻る</button>
  `,
    (body, close) => {
      document.getElementById("preset-register-back")!.addEventListener("click", () => {
        close();
        void showPresetFlow(logDate, mealSlot, onDone);
      });
      body.querySelectorAll(".entry-menu-btn").forEach((el) => {
        el.addEventListener("click", () => {
          const choice = (el as HTMLElement).dataset.choice;
          close();
          const refreshPresets = async (): Promise<void> => {
            await showPresetFlow(logDate, mealSlot, onDone);
          };
          if (choice === "barcode") openBarcodeFlow(logDate, refreshPresets, "preset");
          else if (choice === "manual") openManualMealFlow(logDate, refreshPresets, "preset");
        });
      });
    }
  );
}

async function showPresetFlow(
  logDate: string,
  mealSlot: MealSlot,
  onDone: () => Promise<void>
): Promise<void> {
  let presets: FoodPreset[];
  try {
    presets = await api.getPresets();
  } catch (err) {
    openModal(`<p class="error">${String(err)}</p>`, (_body, close) => {
      document.getElementById("entry-close")?.addEventListener("click", close);
    });
    return;
  }

  const listHtml = presets.length
    ? presets
        .map(
          (p) => `
        <div class="preset-list-item">
          <button type="button" class="preset-list-item__add" data-preset-id="${p.id}">
            <strong>${p.name}</strong>
            <span class="muted">${p.kcal} kcal · P${p.protein_g} F${p.fat_g} C${p.carbs_g}</span>
          </button>
          <button type="button" class="btn-delete" data-delete-preset-id="${p.id}">削除</button>
        </div>`
        )
        .join("")
    : `<p class="muted record-empty">Myセットがありません</p>`;

  openModal(
    `
    <h2 class="modal-title">Myセット → ${SLOT_LABELS[mealSlot]}</h2>
    <p class="muted">タップで食事に追加 · 削除で Myセットから除去</p>
    <div class="preset-list">${listHtml}</div>
    <button class="btn btn-primary btn-block" id="preset-register-btn">登録</button>
    <button class="btn btn-block modal-secondary" id="preset-close">閉じる</button>
  `,
    (body, close) => {
      document.getElementById("preset-close")!.addEventListener("click", close);
      document.getElementById("preset-register-btn")!.addEventListener("click", () => {
        close();
        showPresetRegisterMenu(logDate, mealSlot, onDone);
      });
      presets.forEach((p) => {
        body.querySelector(`[data-preset-id="${p.id}"]`)!.addEventListener("click", async () => {
          await api.addMealFromPreset(p, logDate, mealSlot);
          close();
          await onDone();
        });
        body.querySelector(`[data-delete-preset-id="${p.id}"]`)!.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!confirm(`「${p.name}」を Myセットから削除しますか？`)) return;
          await api.deletePreset(p.id);
          close();
          await showPresetFlow(logDate, mealSlot, onDone);
        });
      });
    }
  );
}

export function openMealEntryFlow(
  logDate: string,
  mealSlot: MealSlot,
  onDone: () => Promise<void>
): void {
  showEntryMenu(logDate, mealSlot, onDone);
}
