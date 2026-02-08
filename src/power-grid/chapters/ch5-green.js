import * as d3 from "d3";
import { fmt0, COLORS } from "./colors.js";

let playInterval = null;

export function init() {
  const container = document.getElementById("gen-stack-viz");
  const hourSlider = document.getElementById("hour-slider");
  const solarSlider = document.getElementById("solar-cap");
  const batterySlider = document.getElementById("battery-cap");
  const playBtn = document.getElementById("play-btn");
  const clockHour = document.getElementById("clock-hour");
  const clockPeriod = document.getElementById("clock-period");
  const clockDemand = document.getElementById("clock-demand");
  const clockPrice = document.getElementById("clock-price");
  const clockRenew = document.getElementById("clock-renew");
  const clockCo2 = document.getElementById("clock-co2");

  if (!container || !hourSlider) return;

  const genTypes = [
    { name: "Nuclear", color: "#a78bfa", co2: 12 },
    { name: "Wind", color: "#22d3ee", co2: 0 },
    { name: "Solar", color: "#fbbf24", co2: 0 },
    { name: "Hydro", color: "#34d399", co2: 0 },
    { name: "Battery", color: "#10b981", co2: 0 },
    { name: "Gas CCGT", color: "#fb923c", co2: 400 },
    { name: "Gas Peaker", color: "#f472b6", co2: 550 },
    { name: "Coal", color: "#94a3b8", co2: 900 },
  ];

  const margin = { top: 30, right: 20, bottom: 50, left: 50 };
  const svg = d3.select(container).append("svg")
    .attr("viewBox", "0 0 760 400").attr("preserveAspectRatio", "xMidYMid meet");

  const w = 760 - margin.left - margin.right;
  const h = 400 - margin.top - margin.bottom;
  const gEl = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleBand().domain(d3.range(24)).range([0, w]).padding(0.12);
  const yScale = d3.scaleLinear().domain([0, 110]).range([h, 0]);

  gEl.append("g").attr("class", "x-axis").attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(xScale).tickFormat(d => `${d}h`))
    .call(g => g.select(".domain").attr("stroke", COLORS.axisLine))
    .call(g => g.selectAll(".tick line").attr("stroke", COLORS.axisTick))
    .call(g => g.selectAll(".tick text").attr("fill", COLORS.axis).attr("font-size", 9));

  const yAxisG = gEl.append("g").attr("class", "y-axis");

  const defs = svg.append("defs");
  const skyGrad = defs.append("linearGradient").attr("id", "sky-bg").attr("x1", "0%").attr("x2", "100%");
  skyGrad.append("stop").attr("offset", "0%").attr("stop-color", "#e8edf5");
  skyGrad.append("stop").attr("offset", "25%").attr("stop-color", "#e8edf5");
  skyGrad.append("stop").attr("offset", "33%").attr("stop-color", "#dbe4f0");
  skyGrad.append("stop").attr("offset", "45%").attr("stop-color", "#bfdbfe");
  skyGrad.append("stop").attr("offset", "50%").attr("stop-color", "#93c5fd");
  skyGrad.append("stop").attr("offset", "55%").attr("stop-color", "#bfdbfe");
  skyGrad.append("stop").attr("offset", "67%").attr("stop-color", "#dbe4f0");
  skyGrad.append("stop").attr("offset", "75%").attr("stop-color", "#e8edf5");
  skyGrad.append("stop").attr("offset", "100%").attr("stop-color", "#e8edf5");

  gEl.insert("rect", ":first-child")
    .attr("x", 0).attr("y", 0).attr("width", w).attr("height", h)
    .attr("fill", "url(#sky-bg)").attr("opacity", 0.25);

  const demandPath = gEl.append("path")
    .attr("fill", "none").attr("stroke", COLORS.label).attr("stroke-width", 2)
    .attr("stroke-dasharray", "4 3").attr("opacity", 0.4);

  const hourHighlight = gEl.append("rect")
    .attr("fill", COLORS.accent).attr("opacity", 0.1).attr("rx", 3);

  const legend = svg.append("g").attr("transform", `translate(${margin.left},${margin.top + h + 30})`);
  genTypes.forEach((gen, i) => {
    const lg = legend.append("g").attr("transform", `translate(${i * 88}, 0)`);
    lg.append("rect").attr("width", 10).attr("height", 10).attr("rx", 2).attr("fill", gen.color);
    lg.append("text").attr("x", 14).attr("y", 9).attr("fill", "#64748b").attr("font-size", 9).text(gen.name);
  });

  function computeHourlyMix(solarCap, batteryCap) {
    const hours = d3.range(24);
    const demand = hours.map(hr => {
      const morning = 8 * Math.exp(-((hr - 8) ** 2) / 14);
      const evening = 16 * Math.exp(-((hr - 19) ** 2) / 12);
      return 62 + morning + evening + 1.5 * Math.sin(((hr - 3) / 24) * Math.PI * 2);
    });

    const solarOutput = hours.map(hr => {
      const shape = Math.max(0, Math.sin(((hr - 6) / 12) * Math.PI)) ** 1.6;
      return solarCap * shape * 0.9;
    });

    const windOutput = hours.map(hr => 15 + 4 * Math.sin(((hr + 2) / 24) * Math.PI * 2));

    const energyCap = batteryCap * 4;
    const powerCap = batteryCap * 0.6;
    let energy = energyCap * 0.3;
    const batteryOutput = [];

    hours.forEach(hr => {
      const netNeed = demand[hr] - solarOutput[hr] - windOutput[hr] - 12;
      let batt = 0;
      if (netNeed < 30 && energy < energyCap) {
        const charge = Math.min(powerCap, 30 - netNeed, energyCap - energy);
        batt = -charge;
        energy += charge * 0.92;
      } else if (netNeed > 50 && energy > 0) {
        const discharge = Math.min(powerCap, netNeed - 50, energy);
        batt = discharge;
        energy -= discharge / 0.92;
      }
      batteryOutput.push(batt);
    });

    return hours.map(hr => {
      const d = demand[hr];
      let remaining = d;
      const mix = {};

      const nuclear = Math.min(12, remaining);
      mix["Nuclear"] = nuclear; remaining -= nuclear;

      const wind = Math.min(windOutput[hr], remaining);
      mix["Wind"] = wind; remaining -= wind;

      const solar = Math.min(solarOutput[hr], remaining);
      mix["Solar"] = solar; remaining -= solar;

      const hydro = Math.min(12, remaining);
      mix["Hydro"] = hydro; remaining -= hydro;

      const batt = Math.max(0, batteryOutput[hr]);
      const battUsed = Math.min(batt, remaining);
      mix["Battery"] = battUsed; remaining -= battUsed;

      const ccgt = Math.min(22, remaining);
      mix["Gas CCGT"] = ccgt; remaining -= ccgt;

      const peaker = Math.min(12, remaining);
      mix["Gas Peaker"] = peaker; remaining -= peaker;

      const coal = Math.min(15, remaining);
      mix["Coal"] = coal;

      return { hour: hr, demand: d, mix };
    });
  }

  function getPeriodName(hr) {
    if (hr >= 6 && hr < 10) return "Morning";
    if (hr >= 10 && hr < 14) return "Midday";
    if (hr >= 14 && hr < 17) return "Afternoon";
    if (hr >= 17 && hr < 21) return "Evening";
    if (hr >= 21 || hr < 1) return "Night";
    return "Late Night";
  }

  function update() {
    const solarCap = +solarSlider.value;
    const batteryCap = +batterySlider.value;
    const selectedHour = +hourSlider.value;

    const data = computeHourlyMix(solarCap, batteryCap);

    const maxDemand = d3.max(data, d => d.demand);
    yScale.domain([0, Math.max(100, maxDemand + 5)]);

    yAxisG.transition().duration(200)
      .call(d3.axisLeft(yScale).ticks(6).tickFormat(d => `${d} GW`))
      .call(g => g.select(".domain").attr("stroke", COLORS.axisLine))
      .call(g => g.selectAll(".tick line").attr("stroke", COLORS.axisTick))
      .call(g => g.selectAll(".tick text").attr("fill", COLORS.axis).attr("font-size", 10));

    const stackData = data.map(d => {
      let y0 = 0;
      const segments = genTypes.map(gen => {
        const val = d.mix[gen.name] || 0;
        const seg = { name: gen.name, color: gen.color, y0, y1: y0 + val, value: val };
        y0 += val;
        return seg;
      });
      return { hour: d.hour, segments, demand: d.demand };
    });

    const hourGroups = gEl.selectAll(".hour-group").data(stackData, d => d.hour);
    const enterGroups = hourGroups.enter().append("g").attr("class", "hour-group");
    const mergedGroups = enterGroups.merge(hourGroups);

    mergedGroups.each(function(d) {
      const sel = d3.select(this);
      const rects = sel.selectAll("rect").data(d.segments, s => s.name);

      rects.enter().append("rect")
        .attr("x", xScale(d.hour))
        .attr("width", xScale.bandwidth())
        .attr("rx", 3)
        .merge(rects)
        .transition().duration(300)
        .attr("x", xScale(d.hour))
        .attr("width", xScale.bandwidth())
        .attr("y", s => yScale(s.y1))
        .attr("height", s => Math.max(0, yScale(s.y0) - yScale(s.y1)))
        .attr("fill", s => s.color)
        .attr("opacity", () => d.hour === selectedHour ? 1 : 0.6);

      rects.exit().remove();
    });

    hourGroups.exit().remove();

    const lineGen = d3.line()
      .x(d => xScale(d.hour) + xScale.bandwidth() / 2)
      .y(d => yScale(d.demand))
      .curve(d3.curveCatmullRom);
    demandPath.transition().duration(300).attr("d", lineGen(data));

    hourHighlight.transition().duration(200)
      .attr("x", xScale(selectedHour))
      .attr("y", 0)
      .attr("width", xScale.bandwidth())
      .attr("height", h);

    const hourData = data[selectedHour];
    clockHour.textContent = `${String(selectedHour).padStart(2, "0")}:00`;
    clockPeriod.textContent = getPeriodName(selectedHour);
    clockDemand.textContent = `${fmt0(hourData.demand)} GW`;

    const coalUsed = hourData.mix["Coal"] || 0;
    let price = 20;
    if (coalUsed > 0) price = 55 + coalUsed * 4;
    else if ((hourData.mix["Gas Peaker"] || 0) > 0) price = 130 + (hourData.mix["Gas Peaker"] || 0) * 5;
    else if ((hourData.mix["Gas CCGT"] || 0) > 0) price = 78 + (hourData.mix["Gas CCGT"] || 0) * 1.5;
    else if ((hourData.mix["Hydro"] || 0) > 5) price = 22;
    else price = 5;
    clockPrice.textContent = `\u20AC${fmt0(price)}/MWh`;
    clockPrice.style.color = price > 150 ? COLORS.red : price > 80 ? COLORS.amber : COLORS.green;

    const totalGen = Object.values(hourData.mix).reduce((s, v) => s + v, 0);
    const renewableGen = (hourData.mix["Solar"] || 0) + (hourData.mix["Wind"] || 0) + (hourData.mix["Hydro"] || 0) + (hourData.mix["Battery"] || 0);
    const renewPct = totalGen > 0 ? (renewableGen / totalGen) * 100 : 0;
    clockRenew.textContent = `${fmt0(renewPct)}%`;
    clockRenew.style.color = renewPct > 70 ? COLORS.green : renewPct > 40 ? COLORS.amber : COLORS.red;

    let totalCo2 = 0;
    genTypes.forEach(gen => { totalCo2 += (hourData.mix[gen.name] || 0) * gen.co2; });
    const co2Intensity = totalGen > 0 ? totalCo2 / totalGen : 0;
    clockCo2.textContent = `${fmt0(co2Intensity)} g/kWh`;
    clockCo2.style.color = co2Intensity > 300 ? COLORS.red : co2Intensity > 150 ? COLORS.amber : COLORS.green;
  }

  hourSlider.addEventListener("input", update);
  solarSlider.addEventListener("input", update);
  batterySlider.addEventListener("input", update);

  let playing = false;

  playBtn.addEventListener("click", () => {
    if (playing) {
      clearInterval(playInterval);
      playing = false;
      playBtn.textContent = "\u25B6 Play 24h";
      playBtn.classList.remove("playing");
      return;
    }

    playing = true;
    playBtn.textContent = "\u25A0 Stop";
    playBtn.classList.add("playing");
    hourSlider.value = 0;

    playInterval = setInterval(() => {
      let hr = +hourSlider.value + 1;
      if (hr > 23) {
        hr = 0;
        clearInterval(playInterval);
        playing = false;
        playBtn.textContent = "\u25B6 Play 24h";
        playBtn.classList.remove("playing");
      }
      hourSlider.value = hr;
      update();
    }, 600);
  });

  update();
}

export function destroy() {
  if (playInterval) {
    clearInterval(playInterval);
    playInterval = null;
  }
}
