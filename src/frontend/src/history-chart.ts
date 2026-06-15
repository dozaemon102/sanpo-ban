import type { HistoryMetric, HistoryPeriod, HistoryPoint } from "./types";

function shortLabel(label: string, period: HistoryPeriod): string {
  if (period === "day" && /^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const [, m, d] = label.split("-");
    return `${Number(m)}/${Number(d)}`;
  }
  if (period === "week" && label.includes("-W")) {
    return label.split("-W")[1] ?? label;
  }
  if (period === "month" && /^\d{4}-\d{2}$/.test(label)) {
    return `${Number(label.split("-")[1])}月`;
  }
  return label;
}

export function mountHistoryChart(
  container: HTMLElement,
  points: HistoryPoint[],
  period: HistoryPeriod,
  accent: string
): void {
  const defined = points.filter((p) => p.value != null);
  if (defined.length === 0) {
    container.innerHTML = `<p class="muted history-chart-empty">この期間に記録がありません</p>`;
    return;
  }

  const width = Math.max(container.clientWidth || 320, 280);
  const height = 220;
  const pad = { top: 18, right: 12, bottom: 32, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const n = points.length;
  const slot = plotW / Math.max(n, 1);
  const barW = Math.min(slot * 0.55, 22);

  const values = defined.map((p) => p.value as number);
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (yMin === yMax) {
    yMin -= Math.abs(yMin) * 0.1 + 1;
    yMax += Math.abs(yMax) * 0.1 + 1;
  } else {
    const padY = (yMax - yMin) * 0.12;
    yMin -= padY;
    yMax += padY;
  }

  const xAt = (i: number) => pad.left + slot * i + slot / 2;
  const yAt = (v: number) => pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const bars: string[] = [];
  const linePts: string[] = [];
  let prevXY: { x: number; y: number } | null = null;

  points.forEach((pt, i) => {
    const x = xAt(i);
    if (pt.value != null) {
      const y = yAt(pt.value);
      const h = pad.top + plotH - y;
      bars.push(
        `<rect x="${(x - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${accent}" opacity="0.85"/>`
      );
      if (prevXY) {
        linePts.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
      } else {
        linePts.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      prevXY = { x, y };
    }
  });

  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  const gridLines = yTicks
    .map((v) => {
      const y = yAt(v);
      return `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}" stroke="#e8eaef" stroke-width="1"/>`;
    })
    .join("");

  const yLabels = yTicks
    .map((v) => {
      const y = yAt(v);
      const text = Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1);
      return `<text x="${pad.left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#9ca3af" font-size="10">${text}</text>`;
    })
    .join("");

  const xLabels = points
    .map((pt, i) => {
      if (n > 10 && i % 2 !== 0 && i !== n - 1) return "";
      const x = xAt(i);
      return `<text x="${x.toFixed(1)}" y="${height - 8}" text-anchor="middle" fill="#9ca3af" font-size="10">${shortLabel(pt.label, period)}</text>`;
    })
    .join("");

  const linePath =
    linePts.length > 0
      ? `<path d="${linePts.join(" ")}" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
      : "";

  container.innerHTML = `
    <svg class="history-chart-svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="推移グラフ">
      ${gridLines}
      ${bars.join("")}
      ${linePath}
      ${yLabels}
      ${xLabels}
    </svg>`;
}

export function formatHistoryListValue(
  metric: HistoryMetric,
  value: number | null | undefined
): string {
  if (value == null) return "—";
  if (metric === "balance") return `${Math.round(value)} kcal`;
  if (metric === "weight" || metric === "lbm") return `${value.toFixed(1)} kg`;
  if (metric === "body_fat_pct") return `${value.toFixed(1)} %`;
  if (metric === "bmi") return value.toFixed(1);
  if (metric === "steps") return `${Math.round(value).toLocaleString()} 歩`;
  return `${Math.round(value)} kcal`;
}
