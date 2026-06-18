import { api } from "./api/client";
import type { FoodLookupResponse, FoodPresetCreate, MealCreate, MealSlot } from "./types";

type EntryTarget = "meal" | "preset";

type BarcodeFormatName = "ean_13" | "upc_a" | "ean_8";

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement | ImageBitmap): Promise<Array<{ rawValue: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: BarcodeFormatName[] }) => BarcodeDetectorLike;
  }
}

const BARCODE_PATTERN = /^[0-9]{8,14}$/;

type ZxingModule = {
  BrowserMultiFormatReader: typeof import("@zxing/browser").BrowserMultiFormatReader;
  BarcodeFormat: typeof import("@zxing/library").BarcodeFormat;
  DecodeHintType: typeof import("@zxing/library").DecodeHintType;
};

let zxingModulePromise: Promise<ZxingModule> | null = null;

function loadZxing(): Promise<ZxingModule> {
  zxingModulePromise ??= Promise.all([import("@zxing/browser"), import("@zxing/library")]).then(
    ([browser, library]) => ({
      BrowserMultiFormatReader: browser.BrowserMultiFormatReader,
      BarcodeFormat: library.BarcodeFormat,
      DecodeHintType: library.DecodeHintType,
    })
  );
  return zxingModulePromise;
}

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

function normalizeBarcodeForLookup(code: string): string {
  const trimmed = code.trim();
  if (trimmed.length === 12) return `0${trimmed}`;
  return trimmed;
}

function requireMealSlot(target: EntryTarget, mealSlot?: MealSlot): MealSlot | null {
  if (target !== "meal") return null;
  if (!mealSlot) return null;
  return mealSlot;
}

async function zxingHints(): Promise<Map<import("@zxing/library").DecodeHintType, import("@zxing/library").BarcodeFormat[]>> {
  const { BarcodeFormat, DecodeHintType } = await loadZxing();
  const hints = new Map<import("@zxing/library").DecodeHintType, import("@zxing/library").BarcodeFormat[]>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.UPC_A,
    BarcodeFormat.EAN_8,
  ]);
  return hints;
}

function renderConfirmForm(
  container: HTMLElement,
  lookup: FoodLookupResponse,
  logDate: string,
  onDone: () => Promise<void>,
  onCancel: () => void,
  target: EntryTarget = "meal",
  mealSlot?: MealSlot
): void {
  const submitLabel = target === "preset" ? "Myセットに登録" : "食事に追加";
  const title = target === "preset" ? "Myセットを確認" : "食事を確認";
  container.innerHTML = `
    <h2 class="modal-title">${title}</h2>
    <p class="muted">${lookup.serving_note ?? ""}</p>
    <form id="meal-confirm-form">
      <div class="field"><label>名称</label><input name="name" value="${escapeAttr(lookup.name)}" required maxlength="200" /></div>
      <div class="field"><label>kcal</label><input name="kcal" type="number" min="0" step="1" value="${lookup.kcal}" required /></div>
      <div class="field"><label>たんぱく質 (g)</label><input name="protein_g" type="number" min="0" step="0.1" value="${lookup.protein_g}" required /></div>
      <div class="field"><label>脂質 (g)</label><input name="fat_g" type="number" min="0" step="0.1" value="${lookup.fat_g}" required /></div>
      <div class="field"><label>炭水化物 (g)</label><input name="carbs_g" type="number" min="0" step="0.1" value="${lookup.carbs_g}" required /></div>
      <button class="btn btn-primary btn-block" type="submit">${submitLabel}</button>
      <button class="btn btn-block modal-secondary" type="button" id="confirm-cancel">キャンセル</button>
      <p id="confirm-error" class="error"></p>
    </form>
  `;
  document.getElementById("confirm-cancel")!.addEventListener("click", onCancel);
  document.getElementById("meal-confirm-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      if (target === "preset") {
        const body: FoodPresetCreate = {
          name: String(fd.get("name")),
          kcal: Number(fd.get("kcal")),
          protein_g: Number(fd.get("protein_g")),
          fat_g: Number(fd.get("fat_g")),
          carbs_g: Number(fd.get("carbs_g")),
        };
        await api.createPreset(body);
      } else {
        const slot = requireMealSlot(target, mealSlot);
        if (!slot) {
          throw new Error("食事枠が未選択です。もう一度「入力」から開き直してください。");
        }
        const body: MealCreate = {
          log_date: logDate,
          meal_slot: slot,
          name: String(fd.get("name")),
          kcal: Number(fd.get("kcal")),
          protein_g: Number(fd.get("protein_g")),
          fat_g: Number(fd.get("fat_g")),
          carbs_g: Number(fd.get("carbs_g")),
          food_preset_id: null,
          barcode: lookup.barcode,
        };
        await api.addMeal(body);
      }
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
  opts?: { barcode?: string; reason?: string; target?: EntryTarget; mealSlot?: MealSlot }
): void {
  const target = opts?.target ?? "meal";
  const mealSlot = opts?.mealSlot;
  const submitLabel = target === "preset" ? "Myセットに登録" : "食事に追加";
  const title = target === "preset" ? "Myセットを手入力" : "手入力で追加";
  container.innerHTML = `
    <h2 class="modal-title">${title}</h2>
    ${opts?.reason ? `<p class="muted">${escapeHtml(opts.reason)}</p>` : ""}
    <form id="meal-manual-form">
      ${
        target === "meal" && opts?.barcode
          ? `<div class="field"><label>バーコード</label><input name="barcode" value="${escapeAttr(opts.barcode)}" readonly /></div>`
          : target === "meal"
            ? `<div class="field"><label>バーコード（任意）</label><input name="barcode" inputmode="numeric" placeholder="8〜14桁" /></div>`
            : ""
      }
      <div class="field"><label>名称</label><input name="name" required maxlength="200" /></div>
      <div class="field"><label>kcal</label><input name="kcal" type="number" min="0" step="1" value="0" required /></div>
      <div class="field"><label>たんぱく質 (g)</label><input name="protein_g" type="number" min="0" step="0.1" value="0" required /></div>
      <div class="field"><label>脂質 (g)</label><input name="fat_g" type="number" min="0" step="0.1" value="0" required /></div>
      <div class="field"><label>炭水化物 (g)</label><input name="carbs_g" type="number" min="0" step="0.1" value="0" required /></div>
      <button class="btn btn-primary btn-block" type="submit">${submitLabel}</button>
      <button class="btn btn-block modal-secondary" type="button" id="manual-cancel">キャンセル</button>
      <p id="manual-error" class="error"></p>
    </form>
  `;
  document.getElementById("manual-cancel")!.addEventListener("click", onCancel);
  document.getElementById("meal-manual-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      if (target === "preset") {
        const body: FoodPresetCreate = {
          name: String(fd.get("name")),
          kcal: Number(fd.get("kcal")),
          protein_g: Number(fd.get("protein_g")),
          fat_g: Number(fd.get("fat_g")),
          carbs_g: Number(fd.get("carbs_g")),
        };
        await api.createPreset(body);
      } else {
        const barcodeRaw = String(fd.get("barcode") ?? "").trim();
        if (barcodeRaw && !validateBarcode(barcodeRaw)) {
          throw new Error("バーコードは 8〜14 桁の数字で入力してください");
        }
        const slot = requireMealSlot(target, mealSlot);
        if (!slot) {
          throw new Error("食事枠が未選択です。もう一度「入力」から開き直してください。");
        }
        const body: MealCreate = {
          log_date: logDate,
          meal_slot: slot,
          name: String(fd.get("name")),
          kcal: Number(fd.get("kcal")),
          protein_g: Number(fd.get("protein_g")),
          fat_g: Number(fd.get("fat_g")),
          carbs_g: Number(fd.get("carbs_g")),
          food_preset_id: null,
        };
        if (barcodeRaw && validateBarcode(barcodeRaw)) body.barcode = barcodeRaw;
        await api.addMeal(body);
      }
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

function setManualInputValue(code: string): void {
  const input = document.getElementById("barcode-manual") as HTMLInputElement | null;
  if (input) input.value = code;
}

async function decodeBarcodeFromFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const { BrowserMultiFormatReader } = await loadZxing();
    const reader = new BrowserMultiFormatReader(await zxingHints());
    const result = await reader.decodeFromImageUrl(url);
    const code = normalizeBarcodeForLookup(result.getText());
    if (!validateBarcode(code)) throw new Error("invalid barcode");
    return code;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function startBarcodeDetectorScan(
  video: HTMLVideoElement,
  onCode: (code: string) => void
): Promise<() => void> {
  const detector = new window.BarcodeDetector!({
    formats: ["ean_13", "upc_a", "ean_8"],
  });
  let scanning = false;
  const timer = window.setInterval(() => {
    if (scanning) return;
    scanning = true;
    void detector
      .detect(video)
      .then((codes) => {
        if (!codes.length) return;
        const code = normalizeBarcodeForLookup(codes[0]!.rawValue);
        if (!validateBarcode(code)) return;
        onCode(code);
      })
      .catch(() => {})
      .finally(() => {
        scanning = false;
      });
  }, 400);
  return () => window.clearInterval(timer);
}

async function startZxingScan(video: HTMLVideoElement, onCode: (code: string) => void): Promise<() => void> {
  const { BrowserMultiFormatReader } = await loadZxing();
  const reader = new BrowserMultiFormatReader(await zxingHints(), { delayBetweenScanAttempts: 500 });
  const controls = await reader.decodeFromVideoDevice(undefined, video, (result, _err, ctrl) => {
    if (!result) return;
    const code = normalizeBarcodeForLookup(result.getText());
    if (!validateBarcode(code)) return;
    ctrl.stop();
    onCode(code);
  });
  return () => {
    controls.stop();
  };
}

export function openBarcodeFlow(
  logDate: string,
  onDone: () => Promise<void>,
  target: EntryTarget = "meal",
  mealSlot?: MealSlot
): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card">
      <div id="barcode-modal-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const body = overlay.querySelector("#barcode-modal-body") as HTMLElement;
  let scanCleanup: (() => void) | null = null;
  let closed = false;
  const canUseLiveCamera = window.isSecureContext;

  const close = (): void => {
    if (closed) return;
    closed = true;
    scanCleanup?.();
    scanCleanup = null;
    overlay.remove();
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  const showScanError = (message: string): void => {
    const el = document.getElementById("scan-error");
    if (el) el.textContent = message;
    else showToast(message);
  };

  const lookupAndConfirm = async (rawCode: string): Promise<void> => {
    const code = normalizeBarcodeForLookup(rawCode);
    if (!validateBarcode(code)) {
      showScanError("8〜14桁の数字を入力してください");
      return;
    }
    scanCleanup?.();
    scanCleanup = null;
    body.innerHTML = `<p class="muted modal-loading">商品を検索中…</p>`;
    try {
      const lookup = await api.lookupBarcode(code);
      renderConfirmForm(body, lookup, logDate, onDone, close, target, mealSlot);
    } catch (err) {
      const msg = String(err);
      const reason =
        msg.includes("not found") || msg.includes("見つかり") || msg.includes("BARCODE_NOT_FOUND")
          ? "商品が見つかりませんでした。手入力してください。"
          : msg.includes("unavailable") || msg.includes("利用でき") || msg.includes("OFF_UNAVAILABLE")
            ? "Open Food Facts に接続できません。手入力してください。"
            : msg.includes("JSON 以外")
              ? msg
              : `検索に失敗しました: ${msg}`;
      showScanError(reason);
      showToast(reason);
      renderManualForm(body, logDate, onDone, close, { barcode: code, reason, target, mealSlot });
    }
  };

  const startScanUi = async (): Promise<void> => {
    body.innerHTML = `
      <h2 class="modal-title">バーコード</h2>
      ${
        canUseLiveCamera
          ? `<video id="barcode-video" class="barcode-video" playsinline muted autoplay></video>
             <p class="muted">カメラをバーコードに向けてください</p>`
          : `<p class="muted">HTTP ではライブカメラが使えません。「写真で読み取る」を使うか、HTTPS の URL で開いてください。</p>`
      }
      <input type="file" id="barcode-photo-input" accept="image/*" capture="environment" hidden />
      <button class="btn btn-primary btn-block" id="barcode-photo">写真で読み取る</button>
      <div class="field"><label>バーコード番号</label><input id="barcode-manual" inputmode="numeric" placeholder="8〜14桁" /></div>
      <button class="btn btn-block modal-secondary" id="barcode-search">番号で検索</button>
      <button class="btn btn-block modal-secondary" id="barcode-manual-only">手入力で追加</button>
      <button class="btn btn-block modal-secondary" id="barcode-close">閉じる</button>
      <p id="scan-error" class="error"></p>
    `;

    document.getElementById("barcode-close")!.addEventListener("click", close);
    document.getElementById("barcode-manual-only")!.addEventListener("click", () => {
      scanCleanup?.();
      scanCleanup = null;
      renderManualForm(body, logDate, onDone, close, { target, mealSlot });
    });

    const runSearch = async (): Promise<void> => {
      const code = (document.getElementById("barcode-manual") as HTMLInputElement).value;
      await lookupAndConfirm(code);
    };

    document.getElementById("barcode-search")!.addEventListener("click", () => void runSearch());
    document.getElementById("barcode-manual")!.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void runSearch();
      }
    });

    const onCode = (code: string): void => {
      if (closed) return;
      setManualInputValue(code);
      void lookupAndConfirm(code);
    };

    const photoInput = document.getElementById("barcode-photo-input") as HTMLInputElement;
    document.getElementById("barcode-photo")!.addEventListener("click", () => photoInput.click());
    photoInput.addEventListener("change", () => {
      const file = photoInput.files?.[0];
      photoInput.value = "";
      if (!file) return;
      void decodeBarcodeFromFile(file)
        .then(onCode)
        .catch(() => {
          showScanError("バーコードを読み取れませんでした。もう一度撮影するか番号を入力してください。");
        });
    });

    if (!canUseLiveCamera) return;

    const video = document.getElementById("barcode-video") as HTMLVideoElement;
    try {
      if (typeof window.BarcodeDetector !== "undefined") {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        video.srcObject = stream;
        await video.play();
        const stopDetector = await startBarcodeDetectorScan(video, onCode);
        scanCleanup = () => {
          stopDetector();
          stream.getTracks().forEach((t) => t.stop());
        };
      } else {
        scanCleanup = await startZxingScan(video, onCode);
      }
    } catch {
      showScanError("ライブカメラを開始できません。「写真で読み取る」を使ってください。");
    }
  };

  void startScanUi();
}

export function openManualMealFlow(
  logDate: string,
  onDone: () => Promise<void>,
  target: EntryTarget = "meal",
  mealSlot?: MealSlot
): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal-card"><div id="manual-modal-body"></div></div>`;
  document.body.appendChild(overlay);
  const body = overlay.querySelector("#manual-modal-body") as HTMLElement;
  const close = (): void => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  renderManualForm(body, logDate, onDone, close, { target, mealSlot });
}
