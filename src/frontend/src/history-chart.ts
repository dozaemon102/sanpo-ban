import type { HistoryMetric, HistoryPeriod, HistoryPoint } from "./types";

function shortLabel(label: string, period: HistoryPeriod): string {
  if (period === "day" && /^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const [, m, d] = label.split("-");
    return `${Number(m)}/${Number(d)}`;
  }
  if (period === "week" && label.includes("-W")) {
    return `W${label.split("-W")[1] ?? label}`;
  }
  if (period === "month" && /^\d{4}-\d{2}$/.test(label)) {
    return `${Number(label.split("-")[1])}月`;
  }
  if (period === "year" && /^\d{4}$/.test(label)) {
    return `${label.slice(2)}年`;
  }
  return label;
}

function detailLabel(pt: HistoryPoint, period: HistoryPeriod): string {
  if (period === "day") return pt.label;
  if (period === "week") return `${pt.start_date} 〜 ${pt.end_date}`;
  if (period === "month") return pt.label.replace("-", "年") + "月";
  return `${pt.label}年`;
}

function formatHistoryValue(
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

function xLabelIndices(n: number, period: HistoryPeriod): number[] {
  if (n <= 7) return Array.from({ length: n }, (_, i) => i);
  const maxLabels = period === "year" ? 5 : 6;
  const step = Math.max(1, Math.ceil((n - 1) / (maxLabels - 1)));
  const indices = new Set<number>([0, n - 1]);
  for (let i = step; i < n - 1; i += step) indices.add(i);
  const sorted = [...indices].sort((a, b) => a - b);
  if (sorted.length >= 2 && sorted[sorted.length - 1]! - sorted[sorted.length - 2]! <= 1) {
    sorted.splice(sorted.length - 2, 1);
  }
  return sorted;
}

function shouldShowXLabel(i: number, n: number, period: HistoryPeriod): boolean {
  return xLabelIndices(n, period).includes(i);
}

type ChartPoint = {
  index: number;
  x: number;
  y: number;
  barX: number;
  barY: number;
  barW: number;
  barH: number;
  point: HistoryPoint;
};

function renderChart(
  container: HTMLElement,
  metric: HistoryMetric,
  points: HistoryPoint[],
  period: HistoryPeriod,
  accent: string
): void {
  const width = Math.max(container.clientWidth || 320, 280);
  const height = 240;
  const pad = { top: 24, right: 28, bottom: 40, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const n = Math.max(points.length, 1);
  const slot = plotW / n;
  const barW = Math.min(slot * 0.55, 22);

  const defined = points.filter((p) => p.value != null).map((p) => p.value as number);
  const signedMetric = metric === "balance";
  const dataMin = defined.length ? Math.min(...defined) : 0;
  const dataMax = defined.length ? Math.max(...defined) : 0;
  // 全メトリクスで Y 軸は 0 を必ず含める（変化率の誤認防止）
  let yMin = signedMetric ? Math.min(dataMin, 0) : 0;
  let yMax = signedMetric ? Math.max(dataMax, 0) : dataMax;
  if (!defined.length) {
    yMin = 0;
    yMax = signedMetric ? 0 : 1;
  }
  if (yMin === yMax) {
    const spread = Math.max(Math.abs(yMax) * 0.15, 1);
    if (signedMetric) {
      yMin -= spread;
      yMax += spread;
    } else {
      yMax += spread;
    }
  } else {
    const span = yMax - yMin;
    const padY = span * 0.12;
    if (signedMetric) {
      if (yMax > 0) yMax += padY;
      else yMax = padY * 0.25;
      if (yMin < 0) yMin -= padY;
      else yMin = -padY * 0.25;
    } else {
      yMax += padY;
    }
  }

  const xAt = (i: number) => pad.left + slot * i + slot / 2;
  const yAt = (v: number) => pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const yZero = yAt(0);

  const hits: ChartPoint[] = [];
  const bars: string[] = [];

  points.forEach((pt, i) => {
    const x = xAt(i);
    if (pt.value != null) {
      const yVal = yAt(pt.value);
      let barY: number;
      let h: number;
      if (signedMetric) {
        barY = Math.min(yVal, yZero);
        h = Math.max(Math.abs(yVal - yZero), 3);
      } else {
        h = Math.max(pad.top + plotH - yVal, 3);
        barY = pad.top + plotH - h;
      }
      const bx = x - barW / 2;
      bars.push(
        `<rect class="chart-bar" data-idx="${i}" x="${bx.toFixed(1)}" y="${barY.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${accent}" opacity="0.88"/>`
      );
      hits.push({
        index: i,
        x,
        y: barY,
        barX: bx,
        barY,
        barW,
        barH: h,
        point: pt,
      });
    }
  });

  const yTicks = signedMetric
    ? [...new Set([yMin, 0, yMax])].sort((a, b) => a - b)
    : [...new Set([0, Math.round((yMax / 2) * 10) / 10, yMax])].sort((a, b) => a - b);
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
      return `<text x="${pad.left - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#9ca3af" font-size="10">${text}</text>`;
    })
    .join("");

  const zeroLine =
    defined.length && yMin <= 0 && yMax >= 0
      ? `<line x1="${pad.left}" y1="${yZero.toFixed(1)}" x2="${width - pad.right}" y2="${yZero.toFixed(1)}" stroke="#c4c9d4" stroke-width="1.5"/>`
      : "";

  const xLabels = points
    .map((pt, i) => {
      if (!shouldShowXLabel(i, n, period)) return "";
      const x = xAt(i);
      const anchor = i === n - 1 ? "end" : i === 0 ? "start" : "middle";
      const clampedX =
        i === n - 1
          ? Math.min(x, width - pad.right)
          : i === 0
            ? Math.max(x, pad.left)
            : x;
      return `<text x="${clampedX.toFixed(1)}" y="${height - 8}" text-anchor="${anchor}" fill="#9ca3af" font-size="10">${shortLabel(pt.label, period)}</text>`;
    })
    .join("");

  const hitAreas = hits
    .map(
      (h) =>
        `<rect class="chart-hit" data-idx="${h.index}" x="${(h.x - slot / 2).toFixed(1)}" y="${pad.top}" width="${slot.toFixed(1)}" height="${plotH}" fill="transparent"/>`
    )
    .join("");

  const emptyHint =
    defined.length === 0
      ? `<text x="${(width / 2).toFixed(1)}" y="${(height / 2).toFixed(1)}" text-anchor="middle" fill="#9ca3af" font-size="12">データがありません</text>`
      : "";

  container.innerHTML = `
    <div class="history-chart-wrap">
      <svg class="history-chart-svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="推移グラフ" overflow="visible">
        ${gridLines}
        ${zeroLine}
        ${bars.join("")}
        ${hitAreas}
        ${yLabels}
        ${xLabels}
        ${emptyHint}
      </svg>
      <div id="chart-tooltip" class="chart-tooltip" hidden></div>
    </div>`;

  const tooltip = container.querySelector("#chart-tooltip") as HTMLElement;
  const svg = container.querySelector("svg")!;

  const showTip = (idx: number, clientX: number, clientY: number) => {
    const hit = hits.find((h) => h.index === idx);
    if (!hit || hit.point.value == null) return;
    tooltip.hidden = false;
    tooltip.innerHTML = `<strong>${detailLabel(hit.point, period)}</strong><span>${formatHistoryValue(metric, hit.point.value)}</span>`;
    const wrap = container.querySelector(".history-chart-wrap")!.getBoundingClientRect();
    const left = Math.min(Math.max(clientX - wrap.left - 60, 8), wrap.width - 128);
    const top = Math.max(clientY - wrap.top - 56, 8);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    svg.querySelectorAll(".chart-bar").forEach((el) => {
      el.setAttribute("opacity", el.getAttribute("data-idx") === String(idx) ? "1" : "0.45");
    });
  };

  const hideTip = () => {
    tooltip.hidden = true;
    svg.querySelectorAll(".chart-bar").forEach((el) => el.setAttribute("opacity", "0.88"));
  };

  container.querySelectorAll(".chart-hit, .chart-bar").forEach((el) => {
    const idx = Number((el as HTMLElement).dataset.idx);
    el.addEventListener("click", (ev) => {
      const e = ev as MouseEvent;
      showTip(idx, e.clientX, e.clientY);
    });
  });

  svg.addEventListener("click", (ev) => {
    if ((ev.target as Element).classList.contains("chart-hit")) return;
    hideTip();
  });
}

export function mountHistoryChart(
  container: HTMLElement,
  metric: HistoryMetric,
  points: HistoryPoint[],
  period: HistoryPeriod,
  accent: string
): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      renderChart(container, metric, points, period, accent);
    });
  });
}
