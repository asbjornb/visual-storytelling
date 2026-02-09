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
  const dailyPrice = document.getElementById("daily-price");
  const dailyRenew = document.getElementById("daily-renew");
  const dailyCo2 = document.getElementById("daily-co2");
  const dailyTonnes = document.getElementById("daily-tonnes");

  if (!container || !hourSlider) return;

  const genTypes = [
    { name: "Solar", color: "#fbbf24", co2: 0 },
    { name: "Wind", color: "#22d3ee", co2: 0 },
    { name: "Nuclear", color: "#a78bfa", co2: 12 },
    { name: "Hydro", color: "#34d399", co2: 0 },
    { name: "Battery", color: "#10b981", co2: 0 },
    { name: "Gas CCGT", color: "#fb923c", co2: 400 },
    { name: "Gas Peaker", color: "#f472b6", co2: 550 },
    { name: "Coal", color: "#94a3b8", co2: 900 },
  ];

  const margin = { top: 30, right: 20, bottom: 25, left: 50 };
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

  // Diagonal stripe pattern for the "charging" overlay above the demand line
  const chargePat = defs.append("pattern")
    .attr("id", "charge-stripes")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 5).attr("height", 5)
    .attr("patternTransform", "rotate(45)");
  chargePat.append("rect").attr("width", 2).attr("height", 5)
    .attr("fill", "#10b981").attr("opacity", 0.45);

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

  const chargeOverlayG = gEl.append("g").attr("class", "charge-overlays");

  const demandPath = gEl.append("path")
    .attr("fill", "none").attr("stroke", COLORS.label).attr("stroke-width", 2)
    .attr("stroke-dasharray", "4 3").attr("opacity", 0.4);

  const hourHighlight = gEl.append("rect")
    .attr("fill", COLORS.accent).attr("opacity", 0.1).attr("rx", 3);

  // Legend is rendered in HTML (not SVG) so it stays readable on mobile.

  // Dispatch the merit order stack to meet a given load, with optional
  // battery discharge injected after hydro (near-zero marginal cost).
  function dispatchStack(load, solar, wind, battDischarge) {
    let remaining = load;
    const mix = {};

    const s = Math.min(solar, remaining);
    mix["Solar"] = s; remaining -= s;

    const w = Math.min(wind, remaining);
    mix["Wind"] = w; remaining -= w;

    const nuc = Math.min(12, remaining);
    mix["Nuclear"] = nuc; remaining -= nuc;

    const hyd = Math.min(12, remaining);
    mix["Hydro"] = hyd; remaining -= hyd;

    const batt = Math.min(battDischarge, remaining);
    mix["Battery"] = batt; remaining -= batt;

    const ccgt = Math.min(22, remaining);
    mix["Gas CCGT"] = ccgt; remaining -= ccgt;

    const peaker = Math.min(12, remaining);
    mix["Gas Peaker"] = peaker; remaining -= peaker;

    const coal = Math.min(15, remaining);
    mix["Coal"] = coal;

    return mix;
  }

  // Battery operators forecast the day and schedule optimally:
  //   - charge ONLY when cheap generation (solar+wind+nuclear+hydro) exceeds
  //     consumer demand — so no fossil fuel is needed to power the charging
  //   - discharge into hours where fossil is running, displacing the dirtiest plants
  function scheduleBattery(demand, solarOutput, windOutput, batteryCap) {
    if (batteryCap <= 0) return new Array(24).fill(0);

    const energyCap = batteryCap * 5;
    const powerCap = batteryCap * 0.8;
    const hours = d3.range(24);

    // "Cheap headroom" = how much cheap generation exceeds consumer demand.
    // Positive → surplus cheap power available for charging.
    // Negative → fossil already needed, charging would make it worse.
    const cheapCap = hours.map(hr =>
      solarOutput[hr] + windOutput[hr] + 12 + 12 // solar + wind + nuclear + hydro
    );
    const headroom = hours.map(hr => cheapCap[hr] - demand[hr]);

    // Fossil load without battery = how much fossil runs to meet demand
    const fossilLoad = hours.map(hr => Math.max(0, -headroom[hr]));

    // Rank charge candidates: most headroom first (cheapest to charge)
    const chargeRank = hours.filter(hr => headroom[hr] > 1)
      .sort((a, b) => headroom[b] - headroom[a]);

    // Rank discharge candidates: most fossil first (most value to displace)
    const dischargeRank = hours.filter(hr => fossilLoad[hr] > 1)
      .sort((a, b) => fossilLoad[b] - fossilLoad[a]);

    // Build schedule: charge up to headroom (never needing fossil),
    // discharge up to fossil load (never displacing more than is running)
    const chargePower = new Array(24).fill(0);
    const dischargePower = new Array(24).fill(0);

    let chargeTarget = energyCap * 0.7; // aim to store this much
    for (const hr of chargeRank) {
      if (chargeTarget <= 0) break;
      const pw = Math.min(powerCap, headroom[hr], chargeTarget / 0.92);
      if (pw > 0.5) {
        chargePower[hr] = pw;
        chargeTarget -= pw * 0.92;
      }
    }

    let dischargeAvail = (energyCap * 0.7 - chargeTarget) * 0.92; // what was stored
    for (const hr of dischargeRank) {
      if (dischargeAvail <= 0) break;
      const pw = Math.min(powerCap, fossilLoad[hr], dischargeAvail);
      if (pw > 0.5) {
        dischargePower[hr] = pw;
        dischargeAvail -= pw / 0.92;
      }
    }

    // Simulate chronologically respecting energy limits
    let energy = energyCap * 0.3;
    const result = [];
    for (let hr = 0; hr < 24; hr++) {
      let batt = 0;
      if (chargePower[hr] > 0 && energy < energyCap) {
        batt = -Math.min(chargePower[hr], (energyCap - energy) / 0.92);
        energy += (-batt) * 0.92;
      } else if (dischargePower[hr] > 0 && energy > energyCap * 0.05) {
        batt = Math.min(dischargePower[hr], (energy - energyCap * 0.05) * 0.92);
        energy -= batt / 0.92;
      }
      result.push(batt);
    }
    return result;
  }

  function computeHourlyMix(solarCap, batteryCap) {
    const hours = d3.range(24);
    const demand = hours.map(hr => {
      const morning = 8 * Math.exp(-((hr - 8) ** 2) / 14);
      const evening = 20 * Math.exp(-((hr - 19) ** 2) / 12);
      const middayDip = -2.5 * Math.exp(-((hr - 13) ** 2) / 8);
      return 62 + morning + evening + middayDip + 1.5 * Math.sin(((hr - 3) / 24) * Math.PI * 2);
    });

    const solarOutput = hours.map(hr => {
      const shape = Math.max(0, Math.sin(((hr - 6) / 12) * Math.PI)) ** 1.6;
      return solarCap * shape * 0.9;
    });

    const windOutput = hours.map(hr => 15 + 4 * Math.sin(((hr + 2) / 24) * Math.PI * 2));

    // Cost-optimised battery schedule
    const battSchedule = scheduleBattery(demand, solarOutput, windOutput, batteryCap);

    return hours.map(hr => {
      const d = demand[hr];
      const charging = battSchedule[hr] < 0 ? -battSchedule[hr] : 0;
      const discharging = battSchedule[hr] > 0 ? battSchedule[hr] : 0;

      // Total load the grid must serve: consumers + battery charging.
      // The charging power comes from real generators — bars exceed the
      // demand line at midday because solar/wind are powering the battery.
      const totalLoad = d + charging;
      const mix = dispatchStack(totalLoad, solarOutput[hr], windOutput[hr], discharging);

      // Renewable surplus that can't be absorbed (drives negative prices)
      const surplus = Math.max(0, solarOutput[hr] + windOutput[hr] - totalLoad);

      return { hour: hr, demand: d, mix, surplus, charging };
    });
  }

  function hourPrice(d) {
    const surplus = d.surplus || 0;
    const coal = d.mix["Coal"] || 0;
    if (surplus > 0) return -10 - surplus * 2;
    if (coal > 0) return 55 + coal * 4;
    if ((d.mix["Gas Peaker"] || 0) > 0) return 130 + (d.mix["Gas Peaker"] || 0) * 5;
    if ((d.mix["Gas CCGT"] || 0) > 0) return 78 + (d.mix["Gas CCGT"] || 0) * 1.5;
    if ((d.mix["Hydro"] || 0) > 5) return 22;
    if ((d.mix["Nuclear"] || 0) > 0) return 12;
    return 0;
  }

  function hourStats(d) {
    const gen = Object.values(d.mix).reduce((s, v) => s + v, 0);
    // Renewables % is relative to consumer demand (not total load incl. charging)
    const renew = (d.mix["Solar"] || 0) + (d.mix["Wind"] || 0) + (d.mix["Hydro"] || 0) + (d.mix["Battery"] || 0);
    const denom = d.demand || gen;
    let co2 = 0;
    genTypes.forEach(g => { co2 += (d.mix[g.name] || 0) * g.co2; });
    return { gen, renew, renewPct: denom > 0 ? Math.min(100, (renew / denom) * 100) : 0, co2, co2Intensity: gen > 0 ? co2 / gen : 0 };
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
    const maxStack = d3.max(data, d => Object.values(d.mix).reduce((s, v) => s + v, 0));
    yScale.domain([0, Math.max(100, maxDemand + 5, maxStack + 5)]);

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

    // Charging overlay: diagonal stripes on the portion above the demand line
    const chargeData = data.filter(d => d.charging > 0).map(d => {
      const stackTop = Object.values(d.mix).reduce((s, v) => s + v, 0);
      return { hour: d.hour, demandY: d.demand, stackTop };
    });
    const chargeRects = chargeOverlayG.selectAll("rect").data(chargeData, d => d.hour);
    chargeRects.enter().append("rect").attr("rx", 3)
      .merge(chargeRects)
      .transition().duration(300)
      .attr("x", d => xScale(d.hour))
      .attr("width", xScale.bandwidth())
      .attr("y", d => yScale(d.stackTop))
      .attr("height", d => Math.max(0, yScale(d.demandY) - yScale(d.stackTop)))
      .attr("fill", "url(#charge-stripes)")
      .attr("pointer-events", "none");
    chargeRects.exit().remove();

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

    // --- Selected-hour stats ---
    const hourData = data[selectedHour];
    clockHour.textContent = `${String(selectedHour).padStart(2, "0")}:00`;
    clockPeriod.textContent = getPeriodName(selectedHour);
    clockDemand.textContent = `${fmt0(hourData.demand)} GW`;

    const price = hourPrice(hourData);
    clockPrice.textContent = `\u20AC${fmt0(price)}/MWh`;
    clockPrice.style.color = price < 0 ? "#6366f1" : price > 150 ? COLORS.red : price > 80 ? COLORS.amber : COLORS.green;

    const hs = hourStats(hourData);
    clockRenew.textContent = `${fmt0(hs.renewPct)}%`;
    clockRenew.style.color = hs.renewPct > 70 ? COLORS.green : hs.renewPct > 40 ? COLORS.amber : COLORS.red;
    clockCo2.textContent = `${fmt0(hs.co2Intensity)} g/kWh`;
    clockCo2.style.color = hs.co2Intensity > 300 ? COLORS.red : hs.co2Intensity > 150 ? COLORS.amber : COLORS.green;

    // --- Daily averages ---
    let sumPrice = 0, sumRenewPct = 0, sumCo2Intensity = 0, sumCo2Total = 0;
    data.forEach(d => {
      sumPrice += hourPrice(d);
      const s = hourStats(d);
      sumRenewPct += s.renewPct;
      sumCo2Intensity += s.co2Intensity;
      sumCo2Total += s.co2;
    });
    const avgPrice = sumPrice / 24;
    const avgRenew = sumRenewPct / 24;
    const avgCo2 = sumCo2Intensity / 24;
    // co2 is g/kWh * GW per hour; convert to kilotonnes per day
    // each hour: sum(GW * gCO2/kWh) = sum in g·GW/kWh
    // GW·h * g/kWh = 1e6 kW·h * g/kWh = 1e6 g = 1 tonne
    const totalTonnes = sumCo2Total / 1000; // kilotonnes

    dailyPrice.textContent = `\u20AC${fmt0(avgPrice)}/MWh`;
    dailyPrice.style.color = avgPrice < 0 ? "#6366f1" : avgPrice > 150 ? COLORS.red : avgPrice > 80 ? COLORS.amber : COLORS.green;
    dailyRenew.textContent = `${fmt0(avgRenew)}%`;
    dailyRenew.style.color = avgRenew > 70 ? COLORS.green : avgRenew > 40 ? COLORS.amber : COLORS.red;
    dailyCo2.textContent = `${fmt0(avgCo2)} g/kWh`;
    dailyCo2.style.color = avgCo2 > 300 ? COLORS.red : avgCo2 > 150 ? COLORS.amber : COLORS.green;
    dailyTonnes.textContent = `${totalTonnes.toFixed(1)} kt`;
    dailyTonnes.style.color = totalTonnes > 30 ? COLORS.red : totalTonnes > 15 ? COLORS.amber : COLORS.green;
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
