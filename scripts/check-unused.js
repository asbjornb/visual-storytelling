#!/usr/bin/env node
/**
 * Static analysis script: finds unused JS constants, unused CSS classes,
 * and misplaced dependencies in the visual-storytelling project.
 *
 * Usage: node scripts/check-unused.js
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Collect all source files ────────────────────────────────

function walk(dir, exts) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walk(full, exts));
    } else if (exts.includes(extname(full))) {
      results.push(full);
    }
  }
  return results;
}

const jsFiles = walk(join(ROOT, "src"), [".js"]);
const cssFiles = walk(join(ROOT, "src"), [".css"]);
const htmlFiles = walk(join(ROOT, "src"), [".html"]);

// Also include root files
if (statSync(join(ROOT, "style.css")).isFile()) cssFiles.push(join(ROOT, "style.css"));
if (statSync(join(ROOT, "index.html")).isFile()) htmlFiles.push(join(ROOT, "index.html"));

const allSourceContent = {};
for (const f of [...jsFiles, ...cssFiles, ...htmlFiles]) {
  allSourceContent[f] = readFileSync(f, "utf-8");
}

let issues = 0;

function report(category, file, message) {
  const relFile = file.replace(ROOT + "/", "");
  console.log(`  [${category}] ${relFile}: ${message}`);
  issues++;
}

// ── 1. Check for JS identifiers only defined but never referenced ──

console.log("\n=== Unused JS Constants / Variables ===\n");

// Check CATEGORY_CLASS usage
{
  const mainJs = join(ROOT, "src/us-territorial-expansion/main.js");
  const content = allSourceContent[mainJs];
  const defCount = (content.match(/CATEGORY_CLASS/g) || []).length;
  if (defCount === 1) {
    // Defined exactly once (its declaration) but never referenced elsewhere
    report("UNUSED", mainJs, "CATEGORY_CLASS is defined but never referenced");
  }
}

// Check isZooming usage
{
  const mainJs = join(ROOT, "src/us-territorial-expansion/main.js");
  const content = allSourceContent[mainJs];
  const total = (content.match(/isZooming/g) || []).length;
  if (total > 0) {
    const conditionalReads = (content.match(/if\s*\([^)]*isZooming/g) || []).length;
    const ternaryReads = (content.match(/isZooming\s*\?/g) || []).length;
    if (conditionalReads === 0 && ternaryReads === 0) {
      report("UNUSED", mainJs, "isZooming is assigned but never read in any condition");
    }
  }
}

// ── 2. Check for unused function parameters ──

console.log("\n=== Unused Function Parameters ===\n");

// renderMapStep's geoData parameter
{
  const mainJs = join(ROOT, "src/us-territorial-expansion/main.js");
  const content = allSourceContent[mainJs];
  const funcMatch = content.match(/function renderMapStep\(([^)]*)\)/);
  if (funcMatch && funcMatch[1].includes("geoData")) {
    const funcStart = content.indexOf("function renderMapStep(");
    let braceCount = 0;
    let bodyStart = -1;
    for (let i = funcStart; i < content.length; i++) {
      if (content[i] === "{") {
        if (bodyStart === -1) bodyStart = i;
        braceCount++;
      } else if (content[i] === "}") {
        braceCount--;
        if (braceCount === 0) {
          const body = content.slice(bodyStart, i + 1);
          if (!body.includes("geoData")) {
            report("UNUSED_PARAM", mainJs, "renderMapStep() parameter 'geoData' is never used in function body");
          }
          break;
        }
      }
    }
  }
}

// updateAllPaths's duration parameter
{
  const mainJs = join(ROOT, "src/us-territorial-expansion/main.js");
  const content = allSourceContent[mainJs];
  const funcMatch = content.match(/function updateAllPaths\(([^)]*)\)/);
  if (funcMatch && funcMatch[1].includes("duration")) {
    const funcStart = content.indexOf("function updateAllPaths(");
    let braceCount = 0;
    let bodyStart = -1;
    for (let i = funcStart; i < content.length; i++) {
      if (content[i] === "{") {
        if (bodyStart === -1) bodyStart = i;
        braceCount++;
      } else if (content[i] === "}") {
        braceCount--;
        if (braceCount === 0) {
          const body = content.slice(bodyStart, i + 1);
          if (!body.includes("duration")) {
            report("UNUSED_PARAM", mainJs, "updateAllPaths() parameter 'duration' is never used in function body");
          }
          break;
        }
      }
    }
  }
}

// ── 3. Check for CSS classes never referenced in JS or HTML ──

console.log("\n=== Unused CSS Classes ===\n");

const cssClassesOfInterest = [
  "map-state", "map-territory", "map-other", "map-disputed", "map-none", "map-seceded",
];

const allJsAndHtml = [...jsFiles, ...htmlFiles].map(f => allSourceContent[f]).join("\n");

for (const cls of cssClassesOfInterest) {
  // Check if this class is ever used in JS (as a string) or HTML (as a class attribute)
  const inJsHtml = allJsAndHtml.includes(`"${cls}"`) ||
                   allJsAndHtml.includes(`'${cls}'`) ||
                   allJsAndHtml.includes(`class="${cls}"`) ||
                   allJsAndHtml.includes(cls);

  // Exclude the CATEGORY_CLASS definition itself (which maps strings to these class names)
  const onlyInCategoryClass = allJsAndHtml.split(cls).length - 1 <= 1;

  if (!inJsHtml || onlyInCategoryClass) {
    // Find which CSS file defines it
    for (const cssFile of cssFiles) {
      if (allSourceContent[cssFile].includes(`.${cls}`)) {
        report("UNUSED_CSS", cssFile, `.${cls} is defined in CSS but never applied to DOM elements`);
      }
    }
  }
}

// ── 4. Check for misplaced dependencies ──

console.log("\n=== Dependency Issues ===\n");

{
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
  const deps = Object.keys(pkg.dependencies || {});

  for (const dep of deps) {
    // Check if the dependency is used in any src/ file
    const usedInSrc = jsFiles.some(f => allSourceContent[f].includes(`from "${dep}"`) ||
                                        allSourceContent[f].includes(`from '${dep}'`));
    if (!usedInSrc) {
      // Check if it's used in scripts/
      const scriptFiles = walk(join(ROOT, "scripts"), [".js"]);
      const usedInScripts = scriptFiles.some(f => {
        const content = readFileSync(f, "utf-8");
        return content.includes(`from "${dep}"`) || content.includes(`from '${dep}'`);
      });

      if (usedInScripts) {
        report("MISPLACED_DEP", join(ROOT, "package.json"),
          `"${dep}" is in dependencies but only used in scripts/ — should be devDependencies`);
      } else if (!usedInSrc) {
        report("UNUSED_DEP", join(ROOT, "package.json"),
          `"${dep}" is in dependencies but never imported in any source file`);
      }
    }
  }
}

// ── 5. Performance: unnecessary data loading ──

console.log("\n=== Performance Issues ===\n");

{
  const mainJs = join(ROOT, "src/us-territorial-expansion/main.js");
  const content = allSourceContent[mainJs];

  // Check if all GeoJSON files are loaded when only the last is needed
  if (content.includes("loadAllGeoJSON") && content.includes("geoData[geoData.length - 1]")) {
    report("PERF", mainJs,
      "loadAllGeoJSON() loads all GeoJSON files at startup, but only the last entry is used " +
      "(for projection calculation). The actual map rendering uses acquisitionsData exclusively.");
  }
  // Verify the optimization: loadFinalGeoJSON should exist instead
  if (content.includes("loadFinalGeoJSON") && content.includes("MAP_STEPS.map")) {
    report("PERF", mainJs,
      "loadFinalGeoJSON exists but MAP_STEPS.map is still loading all files");
  }
}

// ── Summary ──

console.log(`\n${"═".repeat(50)}`);
console.log(`Total issues found: ${issues}`);
console.log(`${"═".repeat(50)}\n`);

process.exit(issues > 0 ? 1 : 0);
