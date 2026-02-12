import * as d3 from "d3";
import { fmt0, fmt1, COLORS } from "./colors.js";

/* ──────────────────────────────────────────────────────────────────
   Advanced Merit Order — unit-level bids + elastic demand
   ────────────────────────────────────────────────────────────────── */

/* ── Technology definitions ──────────────────────────────────────── */

const TECHS = [
  { name: "Wind",       baseUnits: 12, capRange: [1.5, 4],  costMu: -8,  costSigma: 6,  color: "#22d3ee", mustRun: true  },
  { name: "Solar",      baseUnits: 10, capRange: [1.0, 3.5], costMu: -3,  costSigma: 5,  color: "#fbbf24", mustRun: false },
  { name: "Nuclear",    baseUnits: 4,  capRange: [2.5, 4],  costMu: 11,  costSigma: 3,  color: "#a78bfa", mustRun: true  },
  { name: "Hydro",      baseUnits: 5,  capRange: [1.5, 3],  costMu: 20,  costSigma: 8,  color: "#34d399", mustRun: false },
  { name: "Coal",       baseUnits: 6,  capRange: [2.0, 5],  costMu: 52,  costSigma: 15, color: "#94a3b8", mustRun: false },
  { name: "Gas CCGT",   baseUnits: 8,  capRange: [1.5, 4],  costMu: 75,  costSigma: 18, color: "#fb923c", mustRun: false },
  { name: "Gas Peaker", baseUnits: 5,  capRange: [1.0, 2.5], costMu: 125, costSigma: 25, color: "#f472b6", mustRun: false },
  { name: "Oil",        baseUnits: 3,  capRange: [1.0, 3],  costMu: 185, costSigma: 20, color: "#ef4444", mustRun: false },
];

/* ── Generate individual units with seeded pseudo-random variation ─ */

function generateUnits(solarPct, windPct) {
  const rng = d3.randomNormal.source(d3.randomLcg(42));
  const units = [];
  let id = 0;

  for (const tech of TECHS) {
    const numUnits = tech.baseUnits;
    for (let i = 0; i < numUnits; i++) {
      let cap = tech.capRange[0] + (tech.capRange[1] - tech.capRange[0]) * seededRand(id);
      const costNoise = rng(0, 1)();
      let cost = tech.costMu + costNoise * tech.costSigma;

      // Scale solar/wind capacity by slider
      if (tech.name === "Solar") cap *= solarPct / 100;
      if (tech.name === "Wind") cap *= windPct / 100;

      units.push({
        id: id++,
        tech: tech.name,
        cap,
        cost: Math.round(cost * 10) / 10,
        color: tech.color,
        mustRun: tech.mustRun,
      });
    }
  }

  // Sort by cost (ascending) — the merit order
  units.sort((a, b) => a.cost - b.cost);
  return units;
}

// Simple seeded random (0–1) for capacity variation (deterministic per unit id)
function seededRand(seed) {
  let x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

/* ── Elastic demand curve ─────────────────────────────────────────
   Linear demand: Q(P) = baseDemand - elasticity * P
   We clamp so it's always >= 0 and passes through baseDemand at P=0
   elasticity parameter controls slope                            ── */

function demandAtPrice(baseDemand, elasticity, price) {
  return Math.max(0, baseDemand - elasticity * price);
}

/* ── Find equilibrium: walk up the supply curve, check where
   supply crosses the demand curve ────────────────────────────── */

function findEquilibrium(units, baseDemand, elasticity) {
  let cumCap = 0;

  for (let i = 0; i < units.length; i++) {
    const prevCum = cumCap;
    cumCap += units[i].cap;
    const price = units[i].cost;
    const demandHere = demandAtPrice(baseDemand, elasticity, price);

    if (cumCap >= demandHere) {
      // Equilibrium is within or at this unit
      return {
        price,
        quantity: demandHere,
        marginalIdx: i,
      };
    }
  }

  // Demand exceeds all supply — price spikes
  const lastCost = units.length > 0 ? units[units.length - 1].cost : 0;
  return {
    price: lastCost + 100,
    quantity: cumCap,
    marginalIdx: units.length - 1,
  };
}

/* ── Init ─────────────────────────────────────────────────────── */

export function init() {
  const container = document.getElementById("adv-merit-chart");
  const priceEl = document.getElementById("adv-merit-price");
  const solarSlider = document.getElementById("adv-solar-slider");
  const windSlider = document.getElementById("adv-wind-slider");
  const demandSlider = document.getElementById("adv-demand-slider");
  const elasticitySlider = document.getElementById("adv-elasticity-slider");
  const dispatchedEl = document.getElementById("adv-dispatched");
  const totalCapEl = document.getElementById("adv-total-cap");
  const demandMetEl = document.getElementById("adv-demand-met");
  const legendEl = document.getElementById("adv-legend");

  if (!container || !priceEl) return;

  // SVG setup
  const margin = { top: 30, right: 25, bottom: 60, left: 55 };
  const svg = d3.select(container).append("svg")
    .attr("viewBox", "0 0 760 420").attr("preserveAspectRatio", "xMidYMid meet");

  const w = 760 - margin.left - margin.right;
  const h = 420 - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleLinear().range([0, w]);
  const yScale = d3.scaleLinear().range([h, 0]);

  const xAxisG = g.append("g").attr("class", "x-axis").attr("transform", `translate(0,${h})`);
  const yAxisG = g.append("g").attr("class", "y-axis");

  // Defs
  const defs = svg.append("defs");

  // Glow filter
  const glow = defs.append("filter").attr("id", "adv-glow")
    .attr("x", "-30%").attr("y", "-30%").attr("width", "160%").attr("height", "160%");
  glow.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "blur");
  glow.append("feMerge").selectAll("feMergeNode")
    .data(["blur", "SourceGraphic"]).join("feMergeNode").attr("in", d => d);

  // Negative zone gradient
  const negGrad = defs.append("linearGradient").attr("id", "adv-neg-gradient")
    .attr("x1", "0").attr("y1", "0").attr("x2", "0").attr("y2", "1");
  negGrad.append("stop").attr("offset", "0%").attr("stop-color", "#22d3ee").attr("stop-opacity", 0.0);
  negGrad.append("stop").attr("offset", "100%").attr("stop-color", "#22d3ee").attr("stop-opacity", 0.15);

  // Must-run pattern (diagonal stripes)
  const mustRunPattern = defs.append("pattern")
    .attr("id", "must-run-pattern")
    .attr("width", 6).attr("height", 6)
    .attr("patternUnits", "userSpaceOnUse")
    .attr("patternTransform", "rotate(45)");
  mustRunPattern.append("rect")
    .attr("width", 2).attr("height", 6)
    .attr("fill", "rgba(255,255,255,0.25)");

  // Layers (back to front)
  const negZoneRect = g.append("rect")
    .attr("class", "neg-zone")
    .attr("fill", "url(#adv-neg-gradient)")
    .attr("opacity", 0);

  const zeroLineG = g.append("g");
  const barsG = g.append("g").attr("class", "adv-bars");
  const mustRunG = g.append("g").attr("class", "adv-must-run-overlay");
  const demandCurveG = g.append("g");
  const equilibriumG = g.append("g");
  const tooltipG = g.append("g").attr("class", "adv-tooltip").attr("opacity", 0);

  // Tooltip background
  tooltipG.append("rect")
    .attr("rx", 6).attr("ry", 6)
    .attr("fill", "rgba(15,23,42,0.92)")
    .attr("stroke", "rgba(255,255,255,0.1)")
    .attr("stroke-width", 1);
  const tooltipText = tooltipG.append("text")
    .attr("fill", "#fff").attr("font-size", 11).attr("font-weight", 500);

  // Build legend
  buildLegend(legendEl);

  /* ── Main update ─────────────────────────────────────────────── */

  function update() {
    const solarPct = +solarSlider.value;
    const windPct = +windSlider.value;
    const baseDemand = +demandSlider.value;
    // Map 0–100 slider to 0–0.15 GW/€ elasticity
    const elasticity = (+elasticitySlider.value / 100) * 0.15;

    const units = generateUnits(solarPct, windPct);

    // Build cumulative x-positions
    let cumX = 0;
    const bars = units.map((u, i) => {
      const x0 = cumX;
      cumX += u.cap;
      return { ...u, x0, x1: cumX, idx: i };
    });

    const totalCap = cumX;
    const eq = findEquilibrium(units, baseDemand, elasticity);
    const clearingPrice = eq.price;
    const clearingQty = eq.quantity;
    const isNegative = clearingPrice < 0;

    // Mark dispatched and marginal
    bars.forEach((b, i) => {
      b.dispatched = i <= eq.marginalIdx;
      b.isMarginal = i === eq.marginalIdx;
    });

    // Y domain
    const minCost = d3.min(bars, d => d.cost);
    const yMin = Math.min(minCost - 5, isNegative ? clearingPrice - 10 : -15);
    const yMax = Math.max(220, d3.max(bars, d => d.cost) + 20);
    yScale.domain([yMin, yMax]);

    // X domain
    xScale.domain([0, Math.max(totalCap + 5, baseDemand + 10)]);

    // Axes
    xAxisG.transition().duration(300)
      .call(d3.axisBottom(xScale).ticks(8).tickFormat(d => `${d} GW`))
      .call(ax => ax.select(".domain").attr("stroke", COLORS.axisLine))
      .call(ax => ax.selectAll(".tick line").attr("stroke", COLORS.axisTick))
      .call(ax => ax.selectAll(".tick text").attr("fill", COLORS.axis).attr("font-size", 11));

    yAxisG.transition().duration(300)
      .call(d3.axisLeft(yScale).ticks(8).tickFormat(d => `\u20AC${d}`))
      .call(ax => ax.select(".domain").attr("stroke", COLORS.axisLine))
      .call(ax => ax.selectAll(".tick line").attr("stroke", COLORS.axisTick))
      .call(ax => ax.selectAll(".tick text").attr("fill", COLORS.axis).attr("font-size", 11));

    // Zero line
    zeroLineG.selectAll("*").remove();
    if (yMin < 0) {
      zeroLineG.append("line")
        .attr("x1", 0).attr("x2", w)
        .attr("y1", yScale(0)).attr("y2", yScale(0))
        .attr("stroke", COLORS.axis).attr("stroke-width", 1)
        .attr("stroke-dasharray", "3 3").attr("opacity", 0.6);
      zeroLineG.append("text")
        .attr("x", w + 4).attr("y", yScale(0) + 4)
        .attr("fill", COLORS.axis).attr("font-size", 10).text("\u20AC0");
    }

    // Negative zone
    if (isNegative) {
      negZoneRect.transition().duration(400)
        .attr("x", 0).attr("y", yScale(0))
        .attr("width", xScale(clearingQty))
        .attr("height", yScale(yMin) - yScale(0))
        .attr("opacity", 1);
    } else {
      negZoneRect.transition().duration(400).attr("opacity", 0);
    }

    // Y baseline
    const y0 = yScale(0);

    /* ── Supply bars (one thin rect per unit) ─────────────────── */
    const barSel = barsG.selectAll(".adv-unit").data(bars, d => d.id);

    const barEnter = barSel.enter().append("rect").attr("class", "adv-unit")
      .attr("rx", 1)
      .on("mouseenter", function (event, d) { showTooltip(event, d); })
      .on("mouseleave", function () { hideTooltip(); });

    barEnter.merge(barSel).transition().duration(350)
      .attr("x", d => xScale(d.x0) + 0.5)
      .attr("y", d => Math.min(yScale(d.cost), y0))
      .attr("width", d => Math.max(1, xScale(d.x1) - xScale(d.x0) - 1))
      .attr("height", d => Math.abs(y0 - yScale(d.cost)))
      .attr("fill", d => d.dispatched ? d.color : COLORS.capBarFill)
      .attr("stroke", d => d.dispatched ? d.color : COLORS.capBarStroke)
      .attr("stroke-width", 0.5)
      .attr("opacity", d => d.dispatched ? (d.isMarginal ? 1 : 0.8) : 0.25);

    barSel.exit().remove();

    /* ── Must-run overlay (stripe pattern over must-run units) ── */
    const mustRunBars = bars.filter(d => d.mustRun && d.cap > 0.1);
    const mrSel = mustRunG.selectAll(".mr-overlay").data(mustRunBars, d => d.id);

    mrSel.enter().append("rect").attr("class", "mr-overlay")
      .merge(mrSel).transition().duration(350)
      .attr("x", d => xScale(d.x0) + 0.5)
      .attr("y", d => Math.min(yScale(d.cost), y0))
      .attr("width", d => Math.max(1, xScale(d.x1) - xScale(d.x0) - 1))
      .attr("height", d => Math.abs(y0 - yScale(d.cost)))
      .attr("fill", "url(#must-run-pattern)")
      .attr("opacity", d => d.dispatched ? 0.6 : 0.15);

    mrSel.exit().remove();

    /* ── Demand curve ─────────────────────────────────────────── */
    demandCurveG.selectAll("*").remove();

    if (elasticity > 0.001) {
      // Draw downward-sloping demand curve
      const pMax = baseDemand / elasticity; // price at which demand = 0
      const demandPoints = [];
      const steps = 80;
      for (let i = 0; i <= steps; i++) {
        const p = yMin + (Math.min(pMax, yMax) - yMin) * (i / steps);
        const q = demandAtPrice(baseDemand, elasticity, p);
        if (q >= 0) demandPoints.push({ p, q });
      }

      const demandLine = d3.line()
        .x(d => xScale(d.q))
        .y(d => yScale(d.p))
        .curve(d3.curveMonotoneY);

      demandCurveG.append("path")
        .attr("d", demandLine(demandPoints))
        .attr("fill", "none")
        .attr("stroke", COLORS.accent)
        .attr("stroke-width", 2.5)
        .attr("stroke-dasharray", "8 4")
        .attr("opacity", 0.85);

      // Label the demand curve
      const labelPt = demandPoints[Math.floor(demandPoints.length * 0.15)];
      if (labelPt) {
        demandCurveG.append("text")
          .attr("x", xScale(labelPt.q) + 8)
          .attr("y", yScale(labelPt.p) - 6)
          .attr("fill", COLORS.accent)
          .attr("font-size", 10)
          .attr("font-weight", 700)
          .text("Demand");
      }
    } else {
      // Inelastic: vertical line
      demandCurveG.append("line")
        .attr("x1", xScale(baseDemand)).attr("x2", xScale(baseDemand))
        .attr("y1", yScale(yMin)).attr("y2", yScale(yMax))
        .attr("stroke", COLORS.accent).attr("stroke-width", 2)
        .attr("stroke-dasharray", "6 4");

      demandCurveG.append("text")
        .attr("x", xScale(baseDemand) + 6)
        .attr("y", yScale(yMax) + 14)
        .attr("fill", COLORS.accent)
        .attr("font-size", 10)
        .attr("font-weight", 700)
        .text("Demand");
    }

    /* ── Equilibrium point & clearing-price line ─────────────── */
    equilibriumG.selectAll("*").remove();

    // Horizontal clearing price line
    if (clearingPrice <= yMax) {
      equilibriumG.append("line")
        .attr("x1", 0).attr("x2", xScale(clearingQty))
        .attr("y1", yScale(clearingPrice)).attr("y2", yScale(clearingPrice))
        .attr("stroke", isNegative ? "#22d3ee" : COLORS.accent)
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "4 3")
        .attr("opacity", 0.55);
    }

    // Equilibrium dot
    equilibriumG.append("circle")
      .attr("cx", xScale(clearingQty))
      .attr("cy", yScale(clearingPrice))
      .attr("r", 6)
      .attr("fill", isNegative ? "#22d3ee" : COLORS.accent)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .attr("filter", "url(#adv-glow)");

    // Equilibrium label
    equilibriumG.append("text")
      .attr("x", xScale(clearingQty) + 10)
      .attr("y", yScale(clearingPrice) + 4)
      .attr("fill", isNegative ? "#22d3ee" : COLORS.accent)
      .attr("font-size", 10)
      .attr("font-weight", 700)
      .text(`${fmt1(clearingQty)} GW @ \u20AC${fmt0(clearingPrice)}`);

    /* ── Update price display ─────────────────────────────────── */
    const displayPrice = clearingPrice > 300 ? "300+"
      : fmt0(clearingPrice);
    priceEl.textContent = `\u20AC${displayPrice}`;
    priceEl.style.color = isNegative ? "#22d3ee"
      : clearingPrice > 150 ? COLORS.red
      : clearingPrice > 80 ? COLORS.amber
      : COLORS.green;

    /* ── Update stats ─────────────────────────────────────────── */
    const numDispatched = bars.filter(b => b.dispatched).length;
    if (dispatchedEl) dispatchedEl.textContent = `${numDispatched} / ${bars.length}`;
    if (totalCapEl) totalCapEl.textContent = `${fmt1(totalCap)} GW`;
    if (demandMetEl) demandMetEl.textContent = `${fmt1(clearingQty)} GW`;
  }

  /* ── Tooltip ─────────────────────────────────────────────────── */

  function showTooltip(event, d) {
    const [mx, my] = d3.pointer(event, g.node());
    const lines = [
      `${d.tech} unit #${d.id + 1}`,
      `Cost: \u20AC${fmt1(d.cost)}/MWh`,
      `Capacity: ${fmt1(d.cap)} GW`,
      d.mustRun ? "Must-run" : "",
    ].filter(Boolean);

    tooltipText.selectAll("tspan").remove();
    lines.forEach((line, i) => {
      tooltipText.append("tspan")
        .attr("x", 8).attr("dy", i === 0 ? 14 : 14)
        .text(line);
    });

    const textBox = tooltipText.node().getBBox();
    const tw = textBox.width + 16;
    const th = textBox.height + 10;

    // Position tooltip, keeping it inside chart bounds
    let tx = mx + 12;
    let ty = my - th - 6;
    if (tx + tw > w) tx = mx - tw - 8;
    if (ty < 0) ty = my + 12;

    tooltipG.select("rect").attr("x", 0).attr("y", 0)
      .attr("width", tw).attr("height", th);
    tooltipG.attr("transform", `translate(${tx},${ty})`);
    tooltipG.transition().duration(150).attr("opacity", 1);
  }

  function hideTooltip() {
    tooltipG.transition().duration(200).attr("opacity", 0);
  }

  /* ── Back link ───────────────────────────────────────────────── */
  const backLink = document.getElementById("adv-back-link");
  if (backLink) {
    backLink.addEventListener("click", (e) => {
      e.preventDefault();
      const target = document.querySelector('[data-page] #ch-merit');
      if (target) {
        const wrapper = target.closest(".page-wrapper");
        if (wrapper) {
          const pageIdx = parseInt(wrapper.dataset.page);
          window.dispatchEvent(new CustomEvent("go-to-page", { detail: pageIdx }));
        }
      }
    });
  }

  /* ── Bind sliders ────────────────────────────────────────────── */
  solarSlider.addEventListener("input", update);
  windSlider.addEventListener("input", update);
  demandSlider.addEventListener("input", update);
  elasticitySlider.addEventListener("input", update);

  update();
}

/* ── Legend builder ─────────────────────────────────────────────── */

function buildLegend(el) {
  if (!el) return;
  el.innerHTML = "";
  const items = TECHS.map(t => {
    const item = document.createElement("span");
    item.className = "adv-legend-item";
    const swatch = document.createElement("i");
    swatch.style.background = t.color;
    const label = document.createElement("span");
    label.textContent = t.name;
    item.appendChild(swatch);
    item.appendChild(label);
    if (t.mustRun) {
      const tag = document.createElement("span");
      tag.className = "adv-mr-tag";
      tag.textContent = "MR";
      tag.title = "Must-run: bids at or below zero to guarantee dispatch";
      item.appendChild(tag);
    }
    return item;
  });
  items.forEach(i => el.appendChild(i));
}

export function destroy() {}
