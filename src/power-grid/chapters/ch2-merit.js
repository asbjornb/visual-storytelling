import * as d3 from "d3";
import { fmt0, COLORS } from "./colors.js";

export function init() {
  const container = document.getElementById("merit-chart");
  const priceEl = document.getElementById("merit-price");
  const solarSlider = document.getElementById("solar-slider");
  const windSlider = document.getElementById("wind-slider");
  const demandSlider = document.getElementById("demand-merit");
  const negNote = document.getElementById("negative-price-note");

  if (!container || !priceEl) return;

  const sources = [
    { name: "Solar", baseCap: 25, cost: 0, color: "#fbbf24" },
    { name: "Wind", baseCap: 30, cost: 0, color: "#22d3ee" },
    { name: "Nuclear", baseCap: 14, cost: 12, color: "#a78bfa" },
    { name: "Hydro", baseCap: 12, cost: 22, color: "#34d399" },
    { name: "Coal", baseCap: 16, cost: 55, color: "#94a3b8" },
    { name: "Gas CCGT", baseCap: 22, cost: 78, color: "#fb923c" },
    { name: "Gas Peaker", baseCap: 12, cost: 130, color: "#f472b6" },
    { name: "Oil", baseCap: 20, cost: 190, color: "#ef4444" },
  ];

  const margin = { top: 30, right: 20, bottom: 60, left: 50 };
  const svg = d3.select(container).append("svg")
    .attr("viewBox", "0 0 760 400").attr("preserveAspectRatio", "xMidYMid meet");

  const w = 760 - margin.left - margin.right;
  const h = 400 - margin.top - margin.bottom;
  const gEl = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleLinear().range([0, w]);
  const yScale = d3.scaleLinear().domain([0, 220]).range([h, 0]);

  const xAxisG = gEl.append("g").attr("class", "x-axis").attr("transform", `translate(0,${h})`);
  const yAxisG = gEl.append("g").attr("class", "y-axis");

  const defs = svg.append("defs");
  const glowFilter = defs.append("filter").attr("id", "merit-glow").attr("x", "-30%").attr("y", "-30%").attr("width", "160%").attr("height", "160%");
  glowFilter.append("feGaussianBlur").attr("stdDeviation", "5").attr("result", "blur");
  glowFilter.append("feMerge").selectAll("feMergeNode").data(["blur", "SourceGraphic"]).join("feMergeNode").attr("in", d => d);

  /* Negative-zone shaded band (drawn behind everything else) */
  const negZoneRect = gEl.insert("rect", ":first-child")
    .attr("class", "neg-zone")
    .attr("fill", "url(#neg-gradient)")
    .attr("opacity", 0);

  const negGrad = defs.append("linearGradient").attr("id", "neg-gradient")
    .attr("x1", "0").attr("y1", "0").attr("x2", "0").attr("y2", "1");
  negGrad.append("stop").attr("offset", "0%").attr("stop-color", "#22d3ee").attr("stop-opacity", 0.0);
  negGrad.append("stop").attr("offset", "100%").attr("stop-color", "#22d3ee").attr("stop-opacity", 0.18);

  const zeroLineG = gEl.append("g");
  const demandLineG = gEl.append("g");

  function update() {
    const solarPct = +solarSlider.value;
    const windPct = +windSlider.value;
    const demand = +demandSlider.value;

    const stack = sources.map(s => {
      let cap = s.baseCap;
      if (s.name === "Solar") cap = (solarPct / 100) * s.baseCap;
      if (s.name === "Wind") cap = (windPct / 100) * s.baseCap;
      return { ...s, cap };
    });

    let cumX = 0;
    let marginalSource = null;
    let clearingPrice = 0;
    const blocks = stack.map(s => {
      const x0 = cumX;
      cumX += s.cap;
      const dispatched = demand > x0;
      const isMarginal = demand > x0 && demand <= cumX;
      if (isMarginal) { marginalSource = s; clearingPrice = s.cost; }
      if (demand > cumX && !marginalSource) clearingPrice = s.cost;
      return { ...s, x0, x1: cumX, dispatched, isMarginal };
    });

    if (demand > cumX) { clearingPrice = 300; }
    if (!marginalSource && demand <= cumX) {
      for (let i = blocks.length - 1; i >= 0; i--) {
        if (blocks[i].dispatched) { blocks[i].isMarginal = true; clearingPrice = blocks[i].cost; break; }
      }
    }

    /* ── Negative pricing when renewables exceed demand ─────── */
    const renewableCap = stack
      .filter(s => s.name === "Solar" || s.name === "Wind")
      .reduce((sum, s) => sum + s.cap, 0);

    if (clearingPrice === 0 && renewableCap > demand) {
      const excess = renewableCap - demand;
      clearingPrice = -Math.round(Math.min(80, excess * 2));
    }

    const isNegative = clearingPrice < 0;

    /* ── Dynamic y-domain: extend below zero when negative ─── */
    const yMin = isNegative ? Math.min(-20, clearingPrice - 10) : 0;
    yScale.domain([yMin, 220]);

    /* Reposition x-axis to chart bottom (which now maps to yMin) */
    xAxisG.transition().duration(300)
      .attr("transform", `translate(0,${h})`);

    const totalCap = cumX;
    xScale.domain([0, Math.max(totalCap, demand + 5)]);

    xAxisG.transition().duration(300)
      .call(d3.axisBottom(xScale).ticks(8).tickFormat(d => `${d} GW`))
      .call(g => g.select(".domain").attr("stroke", COLORS.axisLine))
      .call(g => g.selectAll(".tick line").attr("stroke", COLORS.axisTick))
      .call(g => g.selectAll(".tick text").attr("fill", COLORS.axis).attr("font-size", 11));

    yAxisG.transition().duration(300)
      .call(d3.axisLeft(yScale).ticks(6).tickFormat(d => `\u20AC${d}`))
      .call(g => g.select(".domain").attr("stroke", COLORS.axisLine))
      .call(g => g.selectAll(".tick line").attr("stroke", COLORS.axisTick))
      .call(g => g.selectAll(".tick text").attr("fill", COLORS.axis).attr("font-size", 11));

    /* ── Zero line (visible only when y-axis extends negative) ── */
    zeroLineG.selectAll("*").remove();
    if (isNegative) {
      zeroLineG.append("line")
        .attr("x1", 0).attr("x2", w)
        .attr("y1", yScale(0)).attr("y2", yScale(0))
        .attr("stroke", COLORS.axis).attr("stroke-width", 1)
        .attr("stroke-dasharray", "3 3").attr("opacity", 0.6);
      zeroLineG.append("text")
        .attr("x", w + 4).attr("y", yScale(0) + 4)
        .attr("fill", COLORS.axis).attr("font-size", 10)
        .text("\u20AC0");
    }

    /* ── Negative-zone shading below zero line ────────────── */
    if (isNegative) {
      negZoneRect.transition().duration(400)
        .attr("x", 0).attr("y", yScale(0))
        .attr("width", xScale(demand))
        .attr("height", yScale(yMin) - yScale(0))
        .attr("opacity", 1);
    } else {
      negZoneRect.transition().duration(400).attr("opacity", 0);
    }

    /* ── Supply blocks (anchored to zero line, not chart bottom) */
    const y0 = yScale(0);

    const sel = gEl.selectAll(".merit-block").data(blocks, d => d.name);
    const enter = sel.enter().append("g").attr("class", "merit-block");
    enter.append("rect").attr("class", "block-bg");
    enter.append("rect").attr("class", "block-glow");
    enter.append("text").attr("class", "block-label");
    const merged = enter.merge(sel);

    merged.select(".block-bg").transition().duration(400)
      .attr("x", d => xScale(d.x0) + 1).attr("y", d => yScale(d.cost))
      .attr("width", d => Math.max(0, xScale(d.x1) - xScale(d.x0) - 2))
      .attr("height", d => y0 - yScale(d.cost)).attr("rx", 4)
      .attr("fill", d => d.dispatched ? d.color : COLORS.capBarFill)
      .attr("stroke", d => d.dispatched ? d.color : COLORS.capBarStroke)
      .attr("stroke-width", 1)
      .attr("opacity", d => d.dispatched ? (d.isMarginal ? 1 : 0.75) : 0.3);

    merged.select(".block-glow").transition().duration(400)
      .attr("x", d => xScale(d.x0) + 1).attr("y", d => yScale(d.cost))
      .attr("width", d => Math.max(0, xScale(d.x1) - xScale(d.x0) - 2))
      .attr("height", d => y0 - yScale(d.cost)).attr("rx", 4)
      .attr("fill", d => d.isMarginal ? d.color : "none")
      .attr("opacity", d => d.isMarginal ? 0.3 : 0)
      .attr("filter", "url(#merit-glow)");

    merged.select(".block-label")
      .attr("x", d => xScale((d.x0 + d.x1) / 2))
      .attr("y", d => (y0 - yScale(d.cost)) > 30 ? yScale(d.cost) + 18 : yScale(d.cost) - 8)
      .attr("text-anchor", "middle")
      .attr("fill", d => (y0 - yScale(d.cost)) > 30 ? COLORS.labelInside : d.color)
      .attr("font-size", d => (xScale(d.x1) - xScale(d.x0)) > 40 ? 11 : 9)
      .attr("font-weight", 600)
      .attr("opacity", d => d.cap > 0.5 ? 1 : 0)
      .text(d => d.name);

    sel.exit().remove();

    /* ── Demand & clearing-price lines ────────────────────── */
    demandLineG.selectAll("*").remove();
    demandLineG.append("line")
      .attr("x1", xScale(demand)).attr("x2", xScale(demand))
      .attr("y1", -10).attr("y2", h + 10)
      .attr("stroke", COLORS.accent).attr("stroke-width", 2).attr("stroke-dasharray", "6 4");

    if (clearingPrice !== 0 && clearingPrice <= 220) {
      demandLineG.append("line")
        .attr("x1", 0).attr("x2", xScale(demand))
        .attr("y1", yScale(clearingPrice)).attr("y2", yScale(clearingPrice))
        .attr("stroke", isNegative ? "#22d3ee" : COLORS.accent)
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "4 3").attr("opacity", isNegative ? 0.8 : 0.5);
    }

    /* ── Price display ────────────────────────────────────── */
    const displayPrice = clearingPrice > 220 ? "300+"
      : isNegative ? fmt0(clearingPrice)
      : fmt0(clearingPrice);
    priceEl.textContent = `\u20AC${displayPrice}`;
    priceEl.style.color = isNegative ? "#22d3ee"
      : clearingPrice > 150 ? COLORS.red
      : clearingPrice > 80 ? COLORS.amber
      : COLORS.green;

    /* ── Show/hide negative-price explainer ────────────────── */
    if (negNote) {
      negNote.style.display = isNegative ? "block" : "none";
    }
  }

  solarSlider.addEventListener("input", update);
  windSlider.addEventListener("input", update);
  demandSlider.addEventListener("input", update);
  update();
}

export function destroy() {}
