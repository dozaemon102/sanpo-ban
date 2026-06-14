import { api } from "./api/client";
import type { FoodLookupResponse, MealCreate } from "./types";

type BarcodeFormat = "ean_13" | "upc_a" | "ean_8";

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement | ImageBitmap): Promise<Array<{ rawValue: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: BarcodeFormat[] }) => BarcodeDetectorLike;
  }
}

const BARCODE_PATTERN = /^[0-9]{8,14}$/;

function showToast(message: string): void {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 3500);
}

function validateBarcode(code: string): boolean {
  return BARCODE_PATTERN.test(code);
}

function renderConfirmForm(
  container: HTMLElement,
  lookup: FoodLookupResponse,
  logDate: string,
  onDone: () => Promise<void>,
  onCancel: () => void
): void {
  container.innerHTML = `
    <h2 class="modal-title">食事を確認</h2>
    <p class="muted">${lookup.serving_note ?? ""}</p>
    <form id="meal-confirm-form">
      <div class="field"><label>名称</label><input name="name" value="${escapeAttr(lookup.name)}" required maxlength="200" /></div>
      <div class="field"><label>kcal</label><input name="kcal" type="number" min="0" step="1" value="${lookup.kcal}" required /></div>
      <div class="field"><label>たんぱく質 (g)</label><input name="protein_g" type="number" min="0" step="0.1" value="${lookup.protein_g}" required /></div>
      <div class="field"><label>脂質 (g)</label><input name="fat_g" type="number" min="0" step="0.1" value="${lookup.fat_g}" required /></div>
      <div class="field"><label>炭水化物 (g)</label><input name="carbs_g" type="number" min="0" step="0.1" value="${lookup.carbs_g}" required /></div>
      <button class="btn btn-primary btn-block" type="submit">食事に追加</button>
      <button class="btn btn-block modal-secondary" type="button" id="confirm-cancel">キャンセル</button>
      <p id="confirm-error" class="error"></p>
    </form>
  `;
  document.getElementById("confirm-cancel")!.addEventListener("click", onCancel);
  document.getElementById("meal-confirm-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const body: MealCreate = {
      log_date: logDate,
      name: String(fd.get("name")),
      kcal: Number(fd.get("kcal")),
      protein_g: Number(fd.get("protein_g")),
      fat_g: Number(fd.get("fat_g")),
      carbs_g: Number(fd.get("carbs_g")),
      food_preset_id: null,
      barcode: lookup.barcode,
    };
    try {
      await api.addMeal(body);
      onCancel();
      await onDone();
    } catch (err) {
      (document.getElementById("confirm-error")!.textContent = String(err));
    }
  });
}

function renderManualForm(
  container: HTMLElement,
  logDate: string,
  onDone: () => Promise<void>,
  onCancel: () => void,
  opts?: { barcode?: string; reason?: string }
): void {
  container.innerHTML = `
    <h2 class="modal-title">手入力で追加</h2>
    ${opts?.reason ? `<p class="muted">${escapeHtml(opts.reason)}</p>` : ""}
    <form id="meal-manual-form">
      ${
        opts?.barcode
          ? `<div class="field"><label>バーコード</label><input name="barcode" value="${escapeAttr(opts.barcode)}" readonly /></div>`
          : `<div class="field"><label>バーコード（任意）</label><input name="barcode" inputmode="numeric" pattern="[0-9]{8,14}" placeholder="8〜14桁" /></div>`
      }
      <div class="field"><label>名称</label><input name="name" required maxlength="200" /></div>
      <div class="field"><label>kcal</label><input name="kcal" type="number" min="0" step="1" value="0" required /></div>
      <div class="field"><label>たんぱく質 (g)</label><input name="protein_g" type="number" min="0" step="0.1" value="0" required /></div>
      <div class="field"><label>脂質 (g)</label><input name="fat_g" type="number" min="0" step="0.1" value="0" required /></div>
      <div class="field"><label>炭水化物 (g)</label><input name="carbs_g" type="number" min="0" step="0.1" value="0" required /></div>
      <button class="btn btn-primary btn-block" type="submit">食事に追加</button>
      <button class="btn btn-block modal-secondary" type="button" id="manual-cancel">キャンセル</button>
      <p id="manual-error" class="error"></p>
    </form>
  `;
  document.getElementById("manual-cancel")!.addEventListener("click", onCancel);
  document.getElementById("meal-manual-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const barcodeRaw = String(fd.get("barcode") ?? "").trim();
    const body: MealCreate = {
      log_date: logDate,
      name: String(fd.get("name")),
      kcal: Number(fd.get("kcal")),
      protein_g: Number(fd.get("protein_g")),
      fat_g: Number(fd.get("fat_g")),
      carbs_g: Number(fd.get("carbs_g")),
      food_preset_id: null,
    };
    if (barcodeRaw && validateBarcode(barcodeRaw)) body.barcode = barcodeRaw;
    try {
      await api.addMeal(body);
      onCancel();
      await onDone();
    } catch (err) {
      (document.getElementById("manual-error")!.textContent = String(err));
    }
  });
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtml(value: string): string {
  return escapeAttr(value);
}

export function openBarcodeFlow(logDate: string, onDone: () => Promise<void>): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card">
      <div id="barcode-modal-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const body = overlay.querySelector("#barcode-modal-body") as HTMLElement;
  let stream: MediaStream | null = null;
  let scanTimer: number | null = null;
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    if (scanTimer != null) window.clearInterval(scanTimer);
    stream?.getTracks().forEach((t) => t.stop());
    overlay.remove();
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  const lookupAndConfirm = async (code: string): Promise<void> => {
    body.innerHTML = `<p class="muted modal-loading">商品を検索中…</p>`;
    try {
      const lookup = await api.lookupBarcode(code);
      renderConfirmForm(body, lookup, logDate, onDone, close);
    } catch (err) {
      const msg = String(err);
      const reason =
        msg.includes("not found") || msg.includes("見つかり")
          ? "商品が見つかりませんでした。手入力してください。"
          : msg.includes("unavailable") || msg.includes("利用でき")
            ? "Open Food Facts に接続できません。手入力してください。"
            : "検索に失敗しました。手入力してください。";
      showToast(reason);
      renderManualForm(body, logDate, onDone, close, { barcode: code, reason });
    }
  };

  const startScanUi = async (): Promise<void> => {
    const hasDetector = typeof window.BarcodeDetector !== "undefined";
    body.innerHTML = `
      <h2 class="modal-title">バーコード</h2>
      ${
        hasDetector
          ? `<video id="barcode-video" class="barcode-video" playsinline muted autoplay></video>
             <p class="muted">カメラをバーコードに向けてください</p>`
          : `<p class="muted">このブラウザはカメラスキャンに非対応です。番号を入力してください。</p>`
      }
      <div class="field"><label>バーコード番号</label><input id="barcode-manual" inputmode="numeric" placeholder="8〜14桁" /></div>
      <button class="btn btn-primary btn-block" id="barcode-search">検索</button>
      <button class="btn btn-block modal-secondary" id="barcode-manual-only">手入力で追加</button>
      <button class="btn btn-block modal-secondary" id="barcode-close">閉じる</button>
      <p id="scan-error" class="error"></p>
    `;

    document.getElementById("barcode-close")!.addEventListener("click", close);
    document.getElementById("barcode-manual-only")!.addEventListener("click", () => {
      renderManualForm(body, logDate, onDone, close);
    });

    const runSearch = async (): Promise<void> => {
      const code = (document.getElementById("barcode-manual") as HTMLInputElement).value.trim();
      if (!validateBarcode(code)) {
        (document.getElementById("scan-error")!.textContent = "8〜14桁の数字を入力してください");
        return;
      }
      if (scanTimer != null) window.clearInterval(scanTimer);
      await lookupAndConfirm(code);
    };

    document.getElementById("barcode-search")!.addEventListener("click", () => void runSearch());

    if (!hasDetector) return;

    const video = document.getElementById("barcode-video") as HTMLVideoElement;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      video.srcObject = stream;
      await video.play();

      const detector = new window.BarcodeDetector!({
        formats: ["ean_13", "upc_a", "ean_8"],
      });
      let scanning = false;
      scanTimer = window.setInterval(() => {
        if (scanning || closed) return;
        scanning = true;
        void detector
          .detect(video)
          .then((codes) => {
            if (closed || !codes.length) return;
            const code = codes[0]!.rawValue.trim();
            if (!validateBarcode(code)) return;
            (document.getElementById("barcode-manual") as HTMLInputElement).value = code;
            if (scanTimer != null) window.clearInterval(scanTimer);
            void lookupAndConfirm(code);
          })
          .catch(() => {})
          .finally(() => {
            scanning = false;
          });
      }, 400);
    } catch {
      (document.getElementById("scan-error")!.textContent =
        "カメラを使えません。番号入力または手入力を使ってください。");
    }
  };

  void startScanUi();
}
