# US Territorial Expansion

Scroll-driven visual story of how the United States grew from 1776 to present day.

## Source material

`reference/timeline-research.pdf` - timeline covering each major acquisition from the 1783 Treaty of Paris through modern-era expansion rhetoric (2025-26).

## Timeline entries (in order)

1. 1776 - Declaration of Independence (prologue/starting point)
2. 1783 - Treaty of Paris (original states + land to Mississippi)
3. 1803 - Louisiana Purchase
4. 1818 - Red River Basin (British cession)
5. 1819 - Florida (Adams-Onis Treaty)
6. 1845 - Texas annexation
7. 1846 - Oregon Treaty
8. 1848 - Mexican Cession (Treaty of Guadalupe Hidalgo)
9. 1853 - Gadsden Purchase
10. 1867 - Alaska Purchase
11. 1898 - Hawaii annexation
12. 1898 - Spanish-American War (Puerto Rico, Guam, Philippines)
13. 1899 - American Samoa
14. 1917 - US Virgin Islands
15. 1947 - Pacific Trust Territories / Northern Mariana Islands
16. 2025-26 - Modern expansion rhetoric (epilogue with disclaimer)

## Tech approach

- Scrollytelling format (scroll-driven transitions between sections)
- D3.js + TopoJSON for animated territory maps
- Historical boundary GeoJSON from Michael Porath's US History Maps dataset (poezn.github.io/us-history-maps, CC BY-SA 3.0)
- Nano Banana API (Google Gemini image gen) for consistent-style editorial illustrations
- Image specs stored in JSONL, generated via local script for iterability

## Design notes

- The map is the hero element - persistent and animating as user scrolls
- Each acquisition gets a distinct color, building up a "quilt" of territory
- Text panels with narrative, quotes, and data callouts (price, area) per section
- Illustrations supplement the map, showing the human element (treaty signings, etc.)

## Map implementation

- Uses `geoConicEqualArea` projection to show the Americas from Greenland to Panama
- Context countries: Canada, Mexico, Greenland, Central America (Belize through Panama), Caribbean (Cuba, Jamaica, Haiti, Dominican Republic, Bahamas)
- Context countries loaded from Natural Earth 50m TopoJSON (`world-countries-50m.json`)
- Pacific territories (Hawaii, Guam, Samoa, etc.) are not shown on the main map due to geographic distance

## Roadmap / Future improvements

1. **Per-acquisition highlighting** (planned)
   - Currently: All US territory uses the same color, with the whole shape growing each step
   - Goal: Highlight newly-acquired territory in a distinct "candy" color, then fade to established US color
   - Blocker: Current GeoJSON data has merged polygons per category (state, territory). Need individual polygons per acquisition with `era` tags
   - Data options:
     - Compute geometric differences between consecutive step files
     - Manual tracing from historical maps
     - Find alternative data source with pre-separated acquisition boundaries
   - Once data exists, rendering is straightforward: render all acquisitions once, animate fill colors per step

2. **Progressive zoom** (planned)
   - Early slides (1783-1853): Zoom in on eastern/central US where the action is
   - Later slides (Alaska, Pacific): Pull back to show full continental view
   - Final slide (2025-26 rhetoric): Full Americas view showing Greenland, Canada, Panama
   - Implementation: Adjust projection scale/translate per step, animate between zoom levels

3. **Pacific territory insets**
   - Add small inset maps for Hawaii, Guam, American Samoa, Virgin Islands
   - These are too far from continental US to show on the main projection
