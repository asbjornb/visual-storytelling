# Per-Acquisition Highlighting: Learnings & Refined Plan

## Goal
Highlight each territorial acquisition in a distinct "candy" color when it becomes the current step, then fade to the established US blue-gray. Creates a visual "quilt" showing how the US grew piece by piece.

## What Worked

### 1. Rendering Architecture
The D3 rendering approach is solid:
- Pre-render all acquisition polygons at initialization (hidden)
- On step change, animate fill colors only (no path recalculation)
- Use `.interrupt()` before new transitions to prevent animation conflicts

**Code pattern (keep this):**
```javascript
// At init - render all acquisitions once
svg.select(".layer-acquisitions")
  .selectAll(".acquisition")
  .data(acquisitions.features)
  .enter()
  .append("path")
  .attr("class", d => `acquisition acquisition-${d.properties.era}`)
  .attr("d", path)
  .attr("fill", ESTABLISHED_COLOR)
  .attr("opacity", 0);

// On step change - animate colors only
function goToStep(stepIndex) {
  acquisitions.features.forEach(feature => {
    const sel = svg.select(`.acquisition-${feature.properties.era}`);
    sel.interrupt();

    if (featureStep > stepIndex) {
      sel.transition().attr("opacity", 0);  // Future - hidden
    } else if (featureStep === stepIndex) {
      sel.transition().attr("fill", ERA_COLORS[era]);  // Current - candy
    } else {
      sel.transition().attr("fill", ESTABLISHED_COLOR);  // Past - gray
    }
  });
}
```

### 2. Winding Order (Critical!)
D3's spherical geometry uses **opposite** winding from planar GeoJSON:

| Convention | Exterior rings | Holes |
|------------|---------------|-------|
| Planar GeoJSON (RFC 7946) | CCW | CW |
| **D3 spherical** (< hemisphere) | **CW** | CCW |

**Must use this rewind function:**
```javascript
function rewindRing(ring, shouldBeCW) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
  }
  const isCW = area > 0;
  return isCW !== shouldBeCW ? ring.slice().reverse() : ring;
}

function rewindPolygon(coords) {
  return coords.map((ring, i) => rewindRing(ring, i === 0));
}
```

### 3. Mapshaper for Geometric Operations
Mapshaper CLI is reliable for:
- Dissolving features: `-dissolve`
- Computing differences: `-erase target=2 source=1`
- Filtering slivers: `-filter-slivers min-area=1000km2`
- Geographic clipping: `-clip bbox=...`
- Vertex snapping: `-snap interval=0.01`

**Avoid Turf.js** - produced incorrect geometry (wrong coordinates, weird artifacts).

### 4. Era Color Scheme
```javascript
const ERA_COLORS = {
  original: "#e63946",    // Red
  louisiana: "#f4a261",   // Orange
  redriver: "#e9c46a",    // Yellow
  florida: "#2a9d8f",     // Teal
  texas: "#264653",       // Dark blue
  oregon: "#8338ec",      // Purple
  mexican: "#ff006e",     // Pink
  gadsden: "#fb5607",     // Bright orange
  alaska: "#3a86ff",      // Blue
  hawaii: "#06d6a0",      // Green
};
const ESTABLISHED_COLOR = "#b8c4d0";  // Blue-gray
```

## What Didn't Work

### 1. Geometric Differencing from Cumulative Files
**Problem:** The source GeoJSON files (poezn/us-history-maps) contain cumulative US territory at each point in time. Computing `diff(step_n, step_n-1)` produces acquisition boundaries, BUT:

- **Boundary misalignment:** Consecutive files don't share exact vertex coordinates
- **Gaps appear** where acquisitions should meet seamlessly
- **Overlaps occur** when boundaries don't match perfectly
- **Internal holes** appear unexpectedly (e.g., Nevada/Utah gap in Mexican Cession)

### 2. Mixed Extracted + Manual Polygons
**Problem:** We used mapshaper extraction for some acquisitions (Original, Louisiana, Mexican Cession, etc.) and manual polygons for others (Florida, Texas, Oregon, Hawaii).

- Manual polygons don't align with extracted polygon boundaries
- Creates visible seams where they meet
- Texas/Louisiana boundary, Florida/Original boundary both show artifacts

### 3. Source Data Limitations
The poezn/us-history-maps dataset:
- Has 283 files but they're cumulative territory snapshots
- Boundaries change between files in inconsistent ways
- Not designed for per-acquisition extraction
- Missing some territories (Hawaii not in continental data)

## Current Visual Issues (from screenshot)

1. **Gap in Mexican Cession** - Vertical strip through Nevada/Utah area
2. **Gadsden Purchase misaligned** - Weird shape in Texas/Oklahoma region
3. **Florida alignment** - Gaps where Florida meets Original States
4. **Texas boundary** - Doesn't align cleanly with Louisiana Purchase

## Approaches to Fix

### Option A: Improve Extraction Pipeline
**Effort:** Medium | **Risk:** Medium

1. Use aggressive vertex snapping (`-snap interval=0.1` or higher)
2. Apply small buffer operations to close gaps: `turf.buffer(poly, 0.01).buffer(-0.01)`
3. Better bounding box filters for each acquisition
4. Manual vertex alignment for critical boundaries

**Pros:** Builds on existing work
**Cons:** May not fully eliminate alignment issues

### Option B: Find Pre-Separated Acquisition Data
**Effort:** Low-Medium | **Risk:** Low

Search for GeoJSON/TopoJSON that already has acquisitions as separate features:
- US Census historical boundary files
- National Atlas historical maps
- Academic GIS repositories
- Wikipedia SVG maps converted to GeoJSON

**Pros:** Cleanest solution if good data exists
**Cons:** May not exist in usable format

### Option C: Manual Tracing (All Acquisitions)
**Effort:** High | **Risk:** Low

Trace all 10 acquisitions manually from historical reference maps, ensuring:
- Shared boundaries use identical vertices
- No gaps or overlaps by construction
- Historically accurate shapes

**Pros:** Full control, guaranteed alignment
**Cons:** Time-intensive, requires careful reference work

### Option D: Visual Workarounds
**Effort:** Low | **Risk:** Medium

Instead of fixing geometry, hide issues visually:
1. Add strokes to acquisitions to cover small gaps
2. Render acquisitions with slight overlap (z-order handles it)
3. Use semi-transparent fills to soften overlap artifacts
4. Simplify geometries to reduce precision issues

**Pros:** Quick to implement
**Cons:** Doesn't fix root cause, may look hacky

### Option E: Hybrid Approach (Recommended)
**Effort:** Medium | **Risk:** Low

1. **Keep extraction for large, isolated acquisitions:** Alaska, Hawaii (manual), Oregon (manual)
2. **Find/create aligned data for contiguous US:** Original + Louisiana + Florida + Texas + Mexican + Gadsden need to share boundaries
3. **Build from established boundaries:** Start with modern US state boundaries, work backwards to attribute each area to its acquisition era

**Key insight:** The problem is that adjacent acquisitions don't share vertices. If we ensure they do (by construction), gaps/overlaps disappear.

## Recommended Next Steps

1. **Search for better source data** (Option B) - 2-4 hours
   - Check Natural Earth for historical US data
   - Look at US Census TIGER historical files
   - Search GitHub for "us territorial expansion geojson"

2. **If no good data found, try hybrid manual approach:**
   - Use modern US state boundaries as base
   - Assign each state to its acquisition era
   - Dissolve by era to get acquisition polygons
   - This guarantees no gaps (states tile perfectly)

3. **Keep current rendering code** - it works well once data is correct

## Files Reference

| File | Purpose |
|------|---------|
| `scripts/extract-acquisitions.js` | Extraction script with rewind logic |
| `public/data/us-territorial-expansion/acquisitions.geojson` | Generated acquisition boundaries |
| `src/us-territorial-expansion/main.js` | D3 rendering with per-acquisition highlighting |

## Technical Notes

- **Projection:** `geoConicEqualArea` centered on Americas
- **D3 version:** Using d3-geo for path generation
- **Animation:** D3 transitions with 600-800ms duration
- **Browser support:** Modern browsers only (uses ES modules)
