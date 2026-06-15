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
    return `${label}年`;
  }
  return label;
}

function detailLabel(pt: HistoryPoint, period: HistoryPeriod): string {
  if (period === "day") return pt.label;
  if (period === "week") return `${pt.start_date} 〜 ${pt.end_date}`;
  if (period === "month") return pt.label.replace("-", "年") + "月";
  return `${pt.label}年`;
}

export function formatHistoryValue(
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

export function mountHistoryChart(
  container: HTMLElement,
  metric: HistoryMetric,
  points: HistoryPoint[],
  period: HistoryPeriod,
  accent: string
): void {
  const width = Math.max(container.clientWidth || 320, 280);
  const height = 240;
  const pad = { top: 24, right: 12, bottom: 36, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const n = Math.max(points.length, 1);
  const slot = plotW / n;
  const barW = Math.min(slot * 0.52, 24);

  const defined = points.filter((p) => p.value != null).map((p) => p.value as number);
  let yMin = defined.length ? Math.min(...defined) : 0;
  let yMax = defined.length ? Math.max(...defined) : 1;
  if (yMin === yMax) {
    yMin -= Math.abs(yMin) * 0.15 + 1;
    yMax += Math.abs(yMax) * 0.15 + 1;
  } else {
    const padY = (yMax - yMin) * 0.12;
    yMin -= padY;
    yMax += padY;
  }

  const xAt = (i: number) => pad.left + slot * i + slot / 2;
  const yAt = (v: number) => pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const hits: ChartPoint[] = [];
  const bars: string[] = [];
  const linePts: string[] = [];
  let prevXY: { x: number; y: number } | null = null;

  points.forEach((pt, i) => {
    const x = xAt(i);
    if (pt.value != null) {
      const y = yAt(pt.value);
      const h = pad.top + plotH - y;
      const bx = x - barW / 2;
      bars.push(
        `<rect class="chart-bar" data-idx="${i}" x="${bx.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="${accent}" opacity="0.88"/>`
      );
      hits.push({
        index: i,
        x,
        y,
        barX: bx,
        barY: y,
        barW,
        barH: h,
        point: pt,
      });
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
      if (n > 8 && i % 2 !== 0 && i !== n - 1) return "";
      const x = xAt(i);
      return `<text x="${x.toFixed(1)}" y="${height - 10}" text-anchor="middle" fill="#9ca3af" font-size="10">${shortLabel(pt.label, period)}</text>`;
    })
    .join("");

  const hitAreas = hits
    .map(
      (h) =>
        `<rect class="chart-hit" data-idx="${h.index}" x="${(h.x - slot / 2).toFixed(1)}" y="${pad.top}" width="${slot.toFixed(1)}" height="${plotH}" fill="transparent"/>`
    )
    .join("");

  const linePath =
    linePts.length > 0
      ? `<path d="${linePts.join(" ")}" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
      : "";

  const emptyHint =
    defined.length === 0
      ? `<text x="${(width / 2).toFixed(1)}" y="${(height / 2).toFixed(1)}" text-anchor="middle" fill="#9ca3af" font-size="12">タップ可能なデータがありません</text>`
      : "";

  container.innerHTML = `
    <div class="history-chart-wrap">
      <svg class="history-chart-svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="推移グラフ">
        ${gridLines}
        ${bars.join("")}
        ${linePath}
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
