import { api } from "./api/client";
import { openBarcodeFlow, openManualMealFlow } from "./barcode-flow";
import type { FoodPreset } from "./types";

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

function showEntryMenu(logDate: string, onDone: () => Promise<void>): void {
  openModal(
    `
    <h2 class="modal-title">入力</h2>
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
          if (choice === "barcode") openBarcodeFlow(logDate, onDone, "meal");
          else if (choice === "manual") openManualMealFlow(logDate, onDone, "meal");
          else if (choice === "preset") void showPresetFlow(logDate, onDone);
        });
      });
    }
  );
}

function showPresetRegisterMenu(logDate: string, onDone: () => Promise<void>): void {
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
        void showPresetFlow(logDate, onDone);
      });
      body.querySelectorAll(".entry-menu-btn").forEach((el) => {
        el.addEventListener("click", () => {
          const choice = (el as HTMLElement).dataset.choice;
          close();
          const refreshPresets = async (): Promise<void> => {
            await showPresetFlow(logDate, onDone);
          };
          if (choice === "barcode") openBarcodeFlow(logDate, refreshPresets, "preset");
          else if (choice === "manual") openManualMealFlow(logDate, refreshPresets, "preset");
        });
      });
    }
  );
}

async function showPresetFlow(logDate: string, onDone: () => Promise<void>): Promise<void> {
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
        <button type="button" class="preset-list-item" data-preset-id="${p.id}">
          <strong>${p.name}</strong>
          <span class="muted">${p.kcal} kcal · P${p.protein_g} F${p.fat_g} C${p.carbs_g}</span>
        </button>`
        )
        .join("")
    : `<p class="muted record-empty">Myセットがありません</p>`;

  openModal(
    `
    <h2 class="modal-title">Myセット</h2>
    <p class="muted">タップで食事に追加</p>
    <div class="preset-list">${listHtml}</div>
    <button class="btn btn-primary btn-block" id="preset-register-btn">登録</button>
    <button class="btn btn-block modal-secondary" id="preset-close">閉じる</button>
  `,
    (body, close) => {
      document.getElementById("preset-close")!.addEventListener("click", close);
      document.getElementById("preset-register-btn")!.addEventListener("click", () => {
        close();
        showPresetRegisterMenu(logDate, onDone);
      });
      presets.forEach((p) => {
        body.querySelector(`[data-preset-id="${p.id}"]`)!.addEventListener("click", async () => {
          await api.addMealFromPreset(p, logDate);
          close();
          await onDone();
        });
      });
    }
  );
}

export function openMealEntryFlow(logDate: string, onDone: () => Promise<void>): void {
  showEntryMenu(logDate, onDone);
}
