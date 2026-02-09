import * as d3 from "d3";
import { clamp, fmt0, fmt1, COLORS } from "./colors.js";

export function init() {
  const container = document.getElementById("trade-viz");
  const slider = document.getElementById("trade-slider");
  const output = document.getElementById("trade-val");

  if (!container || !slider) return;

  const margin = { top: 50, right: 40, bottom: 55, left: 40 };
  const svg = d3.select(container).append("svg")
    .attr("viewBox", "0 0 700 400").attr("preserveAspectRatio", "xMidYMid meet");

  const w = 700 - margin.left - margin.right;
  const h = 400 - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const yScale = d3.scaleLinear().domain([0, 200]).range([h, 0]);
  const barWidth = 100;
  const norwayX = w * 0.2 - barWidth / 2;
  const germanyX = w * 0.8 - barWidth / 2;

  g.append("text").attr("x", w * 0.2).attr("y", -20).attr("text-anchor", "middle")
    .attr("fill", COLORS.label).attr("font-size", 16).attr("font-weight", 700).text("Norway");
  g.append("text").attr("x", w * 0.2).attr("y", -5).attr("text-anchor", "middle")
    .attr("fill", COLORS.labelDim).attr("font-size", 11).text("Hydro: \u20AC35/MWh");
  g.append("text").attr("x", w * 0.8).attr("y", -20).attr("text-anchor", "middle")
    .attr("fill", COLORS.label).attr("font-size", 16).attr("font-weight", 700).text("Germany");
  g.append("text").attr("x", w * 0.8).attr("y", -5).attr("text-anchor", "middle")
    .attr("fill", COLORS.labelDim).attr("font-size", 11).text("Gas: \u20AC180/MWh");

  g.append("rect").attr("x", norwayX).attr("y", 0).attr("width", barWidth).attr("height", h)
    .attr("rx", 8).attr("fill", COLORS.capBarFill).attr("stroke", COLORS.capBarStroke);
  g.append("rect").attr("x", germanyX).attr("y", 0).attr("width", barWidth).attr("height", h)
    .attr("rx", 8).attr("fill", COLORS.capBarFill).attr("stroke", COLORS.capBarStroke);

  const norwayBar = g.append("rect").attr("x", norwayX).attr("width", barWidth).attr("rx", 8);
  const germanyBar = g.append("rect").attr("x", germanyX).attr("width", barWidth).attr("rx", 8);
  const norwayPrice = g.append("text").attr("x", w * 0.2).attr("text-anchor", "middle").attr("font-size", 22).attr("font-weight", 800);
  const germanyPrice = g.append("text").attr("x", w * 0.8).attr("text-anchor", "middle").attr("font-size", 22).attr("font-weight", 800);
  const flowGroup = g.append("g");
  const savingsText = g.append("text").attr("x", w * 0.5).attr("y", h + 35).attr("text-anchor", "middle").attr("font-size", 13).attr("font-weight", 600);
  const cableLabel = g.append("text").attr("x", w * 0.5).attr("y", h + 48).attr("text-anchor", "middle").attr("font-size", 11);

  const defs = svg.append("defs");
  const marker = defs.append("marker").attr("id", "flow-arrow").attr("viewBox", "0 0 10 10")
    .attr("refX", 10).attr("refY", 5).attr("markerWidth", 8).attr("markerHeight", 8).attr("orient", "auto");
  marker.append("path").attr("d", "M 0 0 L 10 5 L 0 10 Z").attr("fill", COLORS.accent);

  function update() {
    const capacityMW = +slider.value;
    output.textContent = `${fmt0(capacityMW)} MW`;

    const maxCap = 8000;
    const t = capacityMW / maxCap;

    const noBase = 35;
    const deBase = 180;
    const convergence = t * 0.65;
    const midpoint = (noBase + deBase) / 2;
    const noPrice = noBase + (midpoint - noBase) * convergence;
    const dePrice = deBase - (deBase - midpoint) * convergence;
    const flowGW = capacityMW / 1000;

    norwayBar.transition().duration(300)
      .attr("y", yScale(noPrice)).attr("height", h - yScale(noPrice)).attr("fill", COLORS.green);
    norwayPrice.transition().duration(300).attr("y", yScale(noPrice) - 8);
    norwayPrice.attr("fill", COLORS.green).text(`\u20AC${fmt0(noPrice)}`);

    germanyBar.transition().duration(300)
      .attr("y", yScale(dePrice)).attr("height", h - yScale(dePrice)).attr("fill", COLORS.red);
    germanyPrice.transition().duration(300).attr("y", yScale(dePrice) - 8);
    germanyPrice.attr("fill", COLORS.red).text(`\u20AC${fmt0(dePrice)}`);

    flowGroup.selectAll("*").remove();
    if (capacityMW > 100) {
      const numArrows = clamp(Math.ceil(flowGW), 1, 6);
      const arrowY = yScale(midpoint);
      const startX = norwayX + barWidth + 15;
      const endX = germanyX - 15;

      for (let i = 0; i < numArrows; i++) {
        const yOff = (i - (numArrows - 1) / 2) * 18;
        flowGroup.append("line")
          .attr("x1", startX).attr("y1", arrowY + yOff)
          .attr("x2", endX).attr("y2", arrowY + yOff)
          .attr("stroke", COLORS.accent).attr("stroke-width", 2)
          .attr("stroke-opacity", 0.3 + t * 0.5)
          .attr("stroke-dasharray", "8 5")
          .attr("marker-end", "url(#flow-arrow)")
          .style("animation", `flowDash ${(1.5 - t * 0.5).toFixed(1)}s linear infinite`);
      }

      flowGroup.append("text")
        .attr("x", (startX + endX) / 2).attr("y", arrowY - numArrows * 9 - 10)
        .attr("text-anchor", "middle").attr("fill", COLORS.accent)
        .attr("font-size", 12).attr("font-weight", 600)
        .text(`${fmt1(flowGW)} GW flowing \u2192`);
    }

    const saving = (deBase - noBase) * convergence;
    if (capacityMW < 100) {
      savingsText.attr("fill", COLORS.labelDim).text("No cable \u2014 prices reflect local supply only");
      cableLabel.attr("fill", "transparent").text("");
    } else {
      savingsText.attr("fill", COLORS.green)
        .text(`German consumers save \u20AC${fmt0(saving)}/MWh \u00B7 Norway earns \u20AC${fmt0(noPrice - noBase)}/MWh more`);
      cableLabel.attr("fill", COLORS.labelDim)
        .text(`Real cable: NordLink (1,400 MW, Norway\u2013Germany) \u2014 you've built ${fmt0(capacityMW)} MW`);
    }
  }

  slider.addEventListener("input", update);
  update();
}

export function destroy() {}
