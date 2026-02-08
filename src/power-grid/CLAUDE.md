# How the Power Grid Really Works

Interactive 5-chapter visual storybook explaining how electricity grids, markets, and trading work.

## Source material

- `docs/POWER_GRID_GUIDE.md` - content script
- `docs/Refining the Visual Storybook Concept and Implementation Plan.pdf` - detailed implementation guidance with citations

## Design

- Modern glass morphism: white/light background (#FAFBFF), frosted glass cards with backdrop-blur
- Bright candy color palette for data (yellow solar, cyan wind, violet nuclear, mint hydro, pink gas peaker, etc.)
- Typography: Outfit (headings) + Inter (body)
- Indigo (#6366F1) as primary accent, indigo→pink gradients for decorative elements
- Vanilla JS + D3.js, no framework

## Chapters

1. **The Balancing Act** - Supply must equal demand every second. Light switch triggers a 25 GW demand surge; time-based cascade shows batteries firing instantly, handing off to hydro, then gas, then batteries recharging. Real-time frequency display.
2. **The Merit Order** - D3 supply curve showing generators stacked by cost, with solar/wind/demand sliders and live clearing price readout. The marginal plant glows.
3. **Grid Pressures** - Node-link European grid map (8 regions) with 4 scenario buttons (wind drought, cold snap, Nordic dry spell, French nuclear outage). Shows price divergence, congested lines, animated power flows.
4. **Enter the Traders** - Two-region visualization (Norway vs Germany). Interconnector capacity slider shows spatial arbitrage: price convergence, consumer savings, flow arrows.
5. **The Green Transition** - 24-hour generation stack chart with hour/solar/battery sliders and Play 24h button. Shows how the mix shifts through a day, battery charge/discharge logic, CO2 intensity, renewables %.

## Assets

- `assets/energy-icons-color.png` - Colored energy source illustrations (wind, solar, hydro, nuclear, gas, coal, battery, grid)
- `assets/energy-icons-bw-simple.png` - B&W simple version
- `assets/energy-icons-bw-detailed.png` - B&W detailed line art version
