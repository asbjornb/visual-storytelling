import * as d3 from "d3";
import { COLORS } from "./colors.js";

export function init() {
  const container = document.getElementById("grid-map");
  if (!container) return;

  const nodes = {
    NO: { x: 200, y: 70, label: "Norway" },
    SE: { x: 310, y: 100, label: "Sweden" },
    DK: { x: 310, y: 185, label: "Denmark" },
    UK: { x: 120, y: 260, label: "UK" },
    NL: { x: 310, y: 265, label: "Netherlands" },
    DE: { x: 400, y: 230, label: "Germany" },
    BE: { x: 280, y: 310, label: "Belgium" },
    FR: { x: 230, y: 370, label: "France" },
  };

  const edges = [
    { from: "NO", to: "SE" }, { from: "NO", to: "DK" },
    { from: "SE", to: "DK" }, { from: "DK", to: "DE" },
    { from: "NO", to: "UK" }, { from: "NO", to: "DE" },
    { from: "UK", to: "NL" }, { from: "UK", to: "BE" },
    { from: "UK", to: "FR" }, { from: "NL", to: "DE" },
    { from: "NL", to: "BE" }, { from: "DE", to: "BE" },
    { from: "DE", to: "FR" }, { from: "FR", to: "BE" },
  ];

  const scenarios = {
    wind: {
      prices: { NO: 45, SE: 52, DK: 95, UK: 130, NL: 155, DE: 175, BE: 160, FR: 140 },
      flows: { "NO-SE": 0.6, "NO-DK": 0.7, "SE-DK": 0.5, "DK-DE": 0.95, "NO-UK": 0.5, "NO-DE": 0.85, "UK-NL": 0.4, "UK-BE": 0.3, "UK-FR": 0.2, "NL-DE": 0.7, "NL-BE": 0.5, "DE-BE": 0.6, "DE-FR": 0.5, "FR-BE": 0.3 },
      congested: ["DK-DE", "NO-DE"],
    },
    cold: {
      prices: { NO: 80, SE: 90, DK: 220, UK: 280, NL: 310, DE: 350, BE: 320, FR: 300 },
      flows: { "NO-SE": 0.7, "NO-DK": 0.8, "SE-DK": 0.6, "DK-DE": 0.98, "NO-UK": 0.6, "NO-DE": 0.9, "UK-NL": 0.55, "UK-BE": 0.5, "UK-FR": 0.45, "NL-DE": 0.95, "NL-BE": 0.85, "DE-BE": 0.9, "DE-FR": 0.88, "FR-BE": 0.5 },
      congested: ["DK-DE", "NL-DE", "DE-BE", "DE-FR"],
    },
    drought: {
      prices: { NO: 130, SE: 140, DK: 170, UK: 190, NL: 210, DE: 230, BE: 215, FR: 200 },
      flows: { "NO-SE": 0.4, "NO-DK": 0.3, "SE-DK": 0.35, "DK-DE": 0.6, "NO-UK": 0.25, "NO-DE": 0.4, "UK-NL": 0.45, "UK-BE": 0.4, "UK-FR": 0.35, "NL-DE": 0.5, "NL-BE": 0.45, "DE-BE": 0.4, "DE-FR": 0.5, "FR-BE": 0.35 },
      congested: ["NO-SE"],
    },
    nuclear: {
      prices: { NO: 70, SE: 85, DK: 180, UK: 200, NL: 260, DE: 280, BE: 290, FR: 420 },
      flows: { "NO-SE": 0.5, "NO-DK": 0.6, "SE-DK": 0.55, "DK-DE": 0.75, "NO-UK": 0.4, "NO-DE": 0.7, "UK-NL": 0.5, "UK-BE": 0.55, "UK-FR": 0.8, "NL-DE": 0.6, "NL-BE": 0.7, "DE-BE": 0.8, "DE-FR": 0.95, "FR-BE": 0.92 },
      congested: ["DE-FR", "FR-BE", "UK-FR"],
    },
  };

  const svg = d3.select(container).append("svg")
    .attr("viewBox", "0 0 540 440").attr("preserveAspectRatio", "xMidYMid meet");

  const defs = svg.append("defs");
  const nodeGlow = defs.append("filter").attr("id", "node-glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
  nodeGlow.append("feGaussianBlur").attr("stdDeviation", "6").attr("result", "blur");
  nodeGlow.append("feMerge").selectAll("feMergeNode").data(["blur", "SourceGraphic"]).join("feMergeNode").attr("in", d => d);

  const edgeG = svg.append("g");
  const nodeG = svg.append("g");

  const priceColor = d3.scaleLinear().domain([40, 150, 350]).range([COLORS.green, COLORS.amber, COLORS.red]).clamp(true);

  function renderScenario(key) {
    const sc = scenarios[key];
    if (!sc) return;

    const edgeSel = edgeG.selectAll(".flow-line").data(edges, d => `${d.from}-${d.to}`);
    const edgeEnter = edgeSel.enter().append("g").attr("class", "flow-line");
    edgeEnter.append("line").attr("class", "flow-bg");
    edgeEnter.append("line").attr("class", "flow-dash");

    edgeEnter.merge(edgeSel).each(function(d) {
      const k = `${d.from}-${d.to}`;
      const flow = sc.flows[k] ?? 0.2;
      const congested = sc.congested.includes(k);
      const from = nodes[d.from], to = nodes[d.to];
      const color = congested ? COLORS.red : "rgba(0,0,0,0.08)";
      const width = 1.5 + flow * 5;
      const sel = d3.select(this);
      sel.select(".flow-bg").transition().duration(500)
        .attr("x1", from.x).attr("y1", from.y).attr("x2", to.x).attr("y2", to.y)
        .attr("stroke", color).attr("stroke-width", width).attr("stroke-opacity", 0.25);
      sel.select(".flow-dash")
        .attr("x1", from.x).attr("y1", from.y).attr("x2", to.x).attr("y2", to.y)
        .attr("stroke", congested ? COLORS.red : COLORS.accent)
        .attr("stroke-width", Math.max(1.5, width * 0.6))
        .attr("stroke-opacity", congested ? 0.9 : 0.4 + flow * 0.4)
        .attr("stroke-dasharray", "8 6")
        .style("animation", `flowDash ${(2 - flow * 0.8).toFixed(1)}s linear infinite`);
    });

    const nodeSel = nodeG.selectAll(".grid-node").data(Object.entries(nodes), d => d[0]);
    const nodeEnter = nodeSel.enter().append("g").attr("class", "grid-node")
      .attr("transform", d => `translate(${d[1].x},${d[1].y})`);
    nodeEnter.append("circle").attr("class", "node-glow-circle").attr("r", 28).attr("filter", "url(#node-glow)");
    nodeEnter.append("circle").attr("class", "node-bg").attr("r", 24).attr("fill", "rgba(255,255,255,0.9)").attr("stroke-width", 2.5);
    nodeEnter.append("text").attr("class", "node-code").attr("y", -5).attr("text-anchor", "middle").attr("font-size", 14).attr("font-weight", 700);
    nodeEnter.append("text").attr("class", "node-price").attr("y", 12).attr("text-anchor", "middle").attr("font-size", 10).attr("font-weight", 600);

    nodeEnter.merge(nodeSel).each(function(d) {
      const [code] = d;
      const price = sc.prices[code] ?? 100;
      const c = priceColor(price);
      const sel = d3.select(this);
      sel.select(".node-glow-circle").transition().duration(500).attr("fill", c).attr("opacity", 0.18);
      sel.select(".node-bg").transition().duration(500).attr("stroke", c);
      sel.select(".node-code").attr("fill", c).text(code);
      sel.select(".node-price").attr("fill", "#475569").text(`\u20AC${price}`);
    });
  }

  // Inject flow animation keyframe
  if (!document.getElementById("flow-dash-style")) {
    const style = document.createElement("style");
    style.id = "flow-dash-style";
    style.textContent = `@keyframes flowDash { to { stroke-dashoffset: -28; } }`;
    document.head.appendChild(style);
  }

  renderScenario("wind");
  container._renderScenario = renderScenario;

  // Wire up scenario buttons
  const bar = document.getElementById("scenario-bar");
  const buttons = bar.querySelectorAll(".sc-btn");
  const texts = document.querySelectorAll(".sc-text");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const sc = btn.dataset.sc;
      buttons.forEach(b => b.classList.toggle("active", b === btn));
      texts.forEach(t => t.classList.toggle("hidden", t.dataset.sc !== sc));
      if (container._renderScenario) container._renderScenario(sc);
    });
  });
}

export function destroy() {}
