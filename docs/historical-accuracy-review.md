# Historical Accuracy Review: US Territorial Expansion Visualization

## Purpose

This document describes our methodology for visualizing US territorial expansion from 1783 to 1898. We need a historian to review whether our approach is historically accurate, particularly our mapping of modern US states to their acquisition eras.

## What We're Building

An interactive map showing how the United States grew through territorial acquisitions:

| Step | Year | Acquisition | Method |
|------|------|-------------|--------|
| 0 | 1783 | Original States (Treaty of Paris) | State dissolution |
| 1 | 1803 | Louisiana Purchase | State dissolution |
| 2 | 1818 | Red River Basin (Convention of 1818) | Geometric extraction |
| 3 | 1819 | Florida (Adams-Onís Treaty) | State dissolution |
| 4 | 1845 | Texas Annexation | State dissolution |
| 5 | 1846 | Oregon Territory (Oregon Treaty) | State dissolution |
| 6 | 1848 | Mexican Cession (Treaty of Guadalupe Hidalgo) | State dissolution |
| 7 | 1853 | Gadsden Purchase | Geometric extraction |
| 8 | 1867 | Alaska Purchase | State dissolution |
| 9 | 1898 | Hawaii Annexation | State dissolution |

## Our Methodology

### Primary Approach: Modern State Boundaries

For most acquisitions, we assign each modern US state to the acquisition era when most of its territory was obtained, then merge (dissolve) all states of the same era into a single polygon.

**Why this approach:**
- Modern state boundaries share exact vertices, guaranteeing no gaps or overlaps in the visualization
- Simplifies the data processing pipeline
- State boundaries are well-documented and unambiguous

**Known limitation:**
- Modern state boundaries do NOT match original acquisition boundaries exactly
- Some states span multiple acquisition eras (e.g., parts of Colorado came from different acquisitions)

### Secondary Approach: Geometric Differencing

For two acquisitions that don't align with state boundaries, we extract them by computing the geometric difference between consecutive historical boundary files:

1. **Red River Basin (1818)** - A strip along the 49th parallel ceded by Britain
2. **Gadsden Purchase (1853)** - Southern portions of Arizona and New Mexico

These are subtracted from their "parent" acquisitions (Louisiana Purchase and Mexican Cession) to prevent double-counting.

---

## State-to-Acquisition Mappings

### Please review each mapping for historical accuracy:

### Original Territory (1783) - Treaty of Paris

The original 13 colonies plus territory ceded by Britain east of the Mississippi River.

| State | Justification | Confidence | Questions |
|-------|---------------|------------|-----------|
| CT, DE, GA, MD, MA, NH, NJ, NY, NC, PA, RI, SC, VA | Original 13 colonies | High | - |
| VT | Became 14th state (1791), from disputed NY/NH territory | High | - |
| KY | Split from Virginia (1792) | High | - |
| TN | Split from North Carolina (1796) | High | - |
| OH | Northwest Territory, original cession | High | - |
| ME | Split from Massachusetts (1820) | High | - |
| WV | Split from Virginia (1863) | High | Part of original VA territory? |
| IN | Northwest Territory | Medium | Entirely within 1783 bounds? |
| IL | Northwest Territory | Medium | Entirely within 1783 bounds? |
| MI | Northwest Territory | Medium | Upper Peninsula acquisition timing? |
| WI | Northwest Territory | Medium | Northern boundary disputes? |
| AL | From Georgia's western claims | Medium | Or part Louisiana Purchase? |
| MS | From Georgia's western claims | Medium | Or part Louisiana Purchase? |

**Key question:** We assigned AL and MS to Original Territory based on Georgia's colonial western land claims. Is this correct, or should they be Louisiana Purchase?

---

### Louisiana Purchase (1803)

Territory purchased from France, roughly from the Mississippi River to the Rocky Mountains.

| State | Justification | Confidence | Questions |
|-------|---------------|------------|-----------|
| LA | Core Louisiana Purchase | High | - |
| AR | Core Louisiana Purchase | High | - |
| MO | Core Louisiana Purchase | High | - |
| IA | Core Louisiana Purchase | High | - |
| NE | Core Louisiana Purchase | High | - |
| KS | Core Louisiana Purchase | High | - |
| OK | Most of state from Louisiana Purchase | Medium | Panhandle from Texas? |
| ND | Core Louisiana Purchase | High | Minus Red River strip (1818) |
| SD | Core Louisiana Purchase | High | - |
| MN | Eastern portion from Louisiana Purchase | Medium | Western portion from Red River cession? |
| MT | Eastern portion from Louisiana Purchase | Low | Western portion from Oregon Treaty? |
| WY | Eastern portion from Louisiana Purchase | Low | Western portion from Mexican Cession? |
| CO | Eastern portion from Louisiana Purchase | Low | Western/southern from Mexican Cession? |

**Key questions:**
1. Montana, Wyoming, and Colorado span multiple acquisitions. We assigned them entirely to Louisiana Purchase. Is this reasonable, or should we split them?
2. Oklahoma's panhandle - was this Texas or Louisiana Purchase territory?
3. Minnesota's western boundary - how much came from the 1818 Red River cession vs. original Louisiana Purchase?

---

### Red River Basin (1818) - Convention of 1818

British cession of territory along the 49th parallel (the "Northwest Angle" and Red River area).

**Our approach:** Extract via geometric differencing from historical boundary files, then subtract from Louisiana Purchase.

**Questions:**
1. Is our bounding box correct? We use: longitude -105° to -90°, latitude 48° to 50°
2. Did this cession include any territory not already claimed by the US via Louisiana Purchase?
3. Was the "Northwest Angle" of Minnesota part of this cession?

---

### Florida (1819) - Adams-Onís Treaty

Spain ceded Florida to the United States.

| State | Justification | Confidence | Questions |
|-------|---------------|------------|-----------|
| FL | Adams-Onís Treaty | High | - |

**Question:** Did the Adams-Onís Treaty include any territory beyond modern Florida (e.g., parts of Alabama or Georgia)?

---

### Texas Annexation (1845)

The Republic of Texas joined the United States.

| State | Justification | Confidence | Questions |
|-------|---------------|------------|-----------|
| TX | Annexed Republic of Texas | High | - |

**Questions:**
1. The Republic of Texas claimed territory extending into parts of modern New Mexico, Oklahoma, Kansas, Colorado, and Wyoming. Should any of these states (or parts) be assigned to Texas instead of Louisiana Purchase / Mexican Cession?
2. Our visualization shows Texas as its modern boundaries. Is this historically misleading?

---

### Oregon Territory (1846) - Oregon Treaty

Britain ceded claims to territory south of the 49th parallel (jointly occupied since 1818).

| State | Justification | Confidence | Questions |
|-------|---------------|------------|-----------|
| OR | Oregon Treaty | High | - |
| WA | Oregon Treaty | High | - |
| ID | Oregon Treaty | Medium | Eastern boundary? |

**Questions:**
1. Did Idaho come entirely from the Oregon Treaty, or was part of it from the Louisiana Purchase?
2. Parts of Montana and Wyoming were in the Oregon Country - should any portion be assigned here?

---

### Mexican Cession (1848) - Treaty of Guadalupe Hidalgo

Territory ceded by Mexico after the Mexican-American War.

| State | Justification | Confidence | Questions |
|-------|---------------|------------|-----------|
| CA | Mexican Cession | High | - |
| NV | Mexican Cession | High | - |
| UT | Mexican Cession | High | - |
| AZ | Mexican Cession (minus Gadsden) | High | - |
| NM | Mexican Cession (minus Gadsden) | Medium | Eastern portion from Texas claims? |

**Questions:**
1. Did the Mexican Cession include parts of Colorado or Wyoming? Our mapping assigns those entirely to Louisiana Purchase.
2. New Mexico's eastern boundary - was some of this Texas territory?

---

### Gadsden Purchase (1853)

Territory purchased from Mexico for a southern railroad route.

**Our approach:** Extract via geometric differencing from historical boundary files, then subtract from Mexican Cession.

**Questions:**
1. Is our bounding box correct? We use: longitude -115° to -106°, latitude 31° to 34°
2. The Gadsden Purchase boundary is more complex than a simple rectangle. Are we capturing it accurately?

---

### Alaska (1867)

Purchased from Russia.

| State | Justification | Confidence | Questions |
|-------|---------------|------------|-----------|
| AK | Alaska Purchase | High | - |

---

### Hawaii (1898)

Annexed as a territory.

| State | Justification | Confidence | Questions |
|-------|---------------|------------|-----------|
| HI | Hawaiian annexation | High | - |

---

## Known Simplifications

1. **States spanning multiple acquisitions:** Colorado, Wyoming, Montana, and possibly others actually came from multiple acquisitions. We assign each state to a single era for visual simplicity.

2. **Modern vs. historical boundaries:** State boundaries were often established decades after acquisition. We use modern boundaries, not the boundaries at time of acquisition.

3. **Disputed territories:** Some areas had competing claims (e.g., Texas claims, Oregon Country joint occupation). We assign each to a single acquisition.

4. **Native American territories:** This visualization shows the perspective of US territorial claims. It does not represent indigenous land rights or the complex history of treaties, cessions, and dispossession.

5. **Territorial vs. statehood dates:** We show when territory was acquired by the US, not when states were admitted to the Union.

---

## Specific Questions for Historian Review

1. **Alabama and Mississippi:** Should these be Original Territory (from Georgia's western claims) or Louisiana Purchase?

2. **Colorado, Wyoming, Montana:** These states span the Louisiana Purchase / Oregon Treaty / Mexican Cession boundaries. Is assigning them entirely to Louisiana Purchase acceptable for a simplified visualization?

3. **Oklahoma Panhandle:** Was this part of Texas claims, or Louisiana Purchase?

4. **New Mexico's eastern boundary:** How much came from Texas claims vs. Mexican Cession?

5. **Idaho's eastern boundary:** Was any of Idaho from Louisiana Purchase, or entirely Oregon Treaty?

6. **Texas Annexation boundaries:** The Republic of Texas claimed more territory than modern Texas. Is it misleading to show only modern Texas boundaries?

7. **Red River Basin (1818):** Is this acquisition significant enough to highlight separately? What exactly did it add to US territory?

8. **Are we missing any significant acquisitions?** (Besides Pacific island territories post-1898)

---

## Source Data

- Historical boundary GeoJSON: [Michael Porath's US History Maps](https://github.com/poezn/us-history-maps) (CC BY-SA 3.0)
- Modern state boundaries: Same dataset, 1959 file
- Processing: Node.js + Mapshaper for geometric operations

---

## How to Provide Feedback

Please annotate this document or provide feedback on:
1. Any state assignments that are incorrect
2. Suggested corrections with sources
3. Whether the simplifications are acceptable for a general-audience visualization
4. Any other historical inaccuracies or concerns
