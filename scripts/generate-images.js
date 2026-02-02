#!/usr/bin/env node

/**
 * Generate illustrations for the US Territorial Expansion visualization
 * using the Nano Banana (Gemini) image generation API.
 *
 * Usage:
 *   GOOGLE_API_KEY=<key> node scripts/generate-images.js [--step <index>] [--dry-run]
 *
 * Reads specs from scripts/image-specs.jsonl
 * Writes images to public/images/us-territorial-expansion/
 *
 * Options:
 *   --step <n>   Only generate image for step n (0-indexed)
 *   --dry-run    Print prompts without calling the API
 *   --model <m>  Model to use (default: gemini-2.5-flash-image)
 */

import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_FILE = path.join(__dirname, "image-specs.jsonl");
const OUTPUT_DIR = path.join(__dirname, "..", "public", "images", "us-territorial-expansion");

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { step: null, dryRun: false, model: "gemini-2.5-flash-image" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--step" && args[i + 1]) {
      opts.step = parseInt(args[++i], 10);
    } else if (args[i] === "--dry-run") {
      opts.dryRun = true;
    } else if (args[i] === "--model" && args[i + 1]) {
      opts.model = args[++i];
    }
  }
  return opts;
}

function loadSpecs() {
  const content = fs.readFileSync(SPECS_FILE, "utf-8");
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

async function generateImage(ai, model, spec) {
  const response = await ai.models.generateContent({
    model,
    contents: spec.prompt,
    config: {
      responseModalities: ["IMAGE"],
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }
  throw new Error("No image data in response");
}

async function main() {
  const opts = parseArgs();
  const specs = loadSpecs();

  console.log(`Loaded ${specs.length} image specs from ${SPECS_FILE}`);

  // Filter to specific step if requested
  const toGenerate = opts.step !== null
    ? [{ ...specs[opts.step], _index: opts.step }]
    : specs.map((s, i) => ({ ...s, _index: i }));

  if (opts.dryRun) {
    for (const spec of toGenerate) {
      console.log(`\n[${spec._index}] ${spec.id}`);
      console.log(`  Prompt: ${spec.prompt}`);
      console.log(`  Output: ${spec.filename}`);
    }
    return;
  }

  if (!process.env.GOOGLE_API_KEY) {
    console.error("Error: GOOGLE_API_KEY environment variable is required");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const spec of toGenerate) {
    const outPath = path.join(OUTPUT_DIR, spec.filename);
    console.log(`\n[${spec._index}] Generating: ${spec.id}...`);

    try {
      const imageBuffer = await generateImage(ai, opts.model, spec);
      fs.writeFileSync(outPath, imageBuffer);
      console.log(`  Saved: ${outPath} (${(imageBuffer.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }

    // Rate limit: small delay between requests
    if (toGenerate.length > 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log("\nDone.");
}

main();
