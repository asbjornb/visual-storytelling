import * as d3 from "d3";

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const fmt0 = d3.format(",.0f");
export const fmt1 = d3.format(",.1f");

export const COLORS = {
  axis: "#94a3b8",
  axisLine: "rgba(0,0,0,0.1)",
  axisTick: "rgba(0,0,0,0.06)",
  label: "#1e293b",
  labelDim: "#94a3b8",
  labelInside: "#fff",
  capBarFill: "rgba(0,0,0,0.03)",
  capBarStroke: "rgba(0,0,0,0.06)",
  accent: "#6366f1",
  accentGlow: "rgba(99,102,241,0.2)",
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  cyan: "#06b6d4",
};
