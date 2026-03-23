#!/usr/bin/env node
/**
 * Adds a pithy `title:` property to the YAML frontmatter of every knowledge
 * graph node file in seeds/. Calls Claude in batches to generate titles.
 *
 * Usage: node scripts/add-titles.mjs [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Manually load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] ??= m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 30; // files per Claude call
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── helpers ────────────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  return { fm: match[1], body: match[2] };
}

function hasTitleField(fm) {
  return /^title:/m.test(fm);
}

function injectTitle(content, title) {
  // Insert title: after the first line of frontmatter (after opening ---)
  return content.replace(/^(---\n)/, `$1title: "${title.replace(/"/g, "'")}"\n`);
}

async function collectFiles(seedsDir) {
  const files = [];
  const seedDirs = fs.readdirSync(seedsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(seedsDir, d.name));

  const nodeDirs = ['observation', 'hypothesis', 'conjecture', 'pain_point',
                    'existing_solution', 'validation_strategy', 'product_plan'];

  for (const seed of seedDirs) {
    for (const nodeDir of nodeDirs) {
      const dir = path.join(seed, nodeDir);
      if (!fs.existsSync(dir)) continue;
      const mdFiles = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const f of mdFiles) {
        files.push(path.join(dir, f));
      }
    }
  }
  return files;
}

function buildPrompt(batch) {
  const items = batch.map((f, i) => {
    const content = fs.readFileSync(f, 'utf8');
    const parsed = parseFrontmatter(content);
    // Send type + first 600 chars of body to keep tokens low
    const snippet = parsed ? parsed.body.slice(0, 600).replace(/\n+/g, ' ').trim() : content.slice(0, 600);
    const type = (parsed?.fm.match(/^type:\s*(\S+)/m) || [])[1] || 'node';
    return `[${i}] type=${type}\n${snippet}`;
  }).join('\n\n---\n\n');

  return `You are writing Obsidian graph node titles. For each numbered node below, write ONE pithy sentence (max 12 words) that captures the node's single most important insight or claim. Be specific and concrete — avoid generic phrases like "explores the" or "examines how". Use active voice. Return ONLY a JSON array of strings in index order, nothing else.

${items}`;
}

async function generateTitles(batch) {
  const prompt = buildPrompt(batch);
  const msg = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = msg.content[0].text.trim();
  // Extract JSON array from response
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`Unexpected response: ${raw.slice(0, 200)}`);
  return JSON.parse(jsonMatch[0]);
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const seedsDir = path.join(__dirname, '..', 'seeds');
  const allFiles = await collectFiles(seedsDir);

  // Filter out files that already have a title
  const pending = allFiles.filter(f => {
    const content = fs.readFileSync(f, 'utf8');
    const parsed = parseFrontmatter(content);
    return parsed && !hasTitleField(parsed.fm);
  });

  console.log(`Found ${allFiles.length} node files, ${pending.length} need titles.`);
  if (DRY_RUN) { console.log('Dry run — no files will be written.'); }

  let processed = 0;
  let errors = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pending.length / BATCH_SIZE)} — ${batch.length} files...`);

    let titles;
    try {
      titles = await generateTitles(batch);
    } catch (err) {
      console.error(`  ✗ Batch failed: ${err.message}`);
      errors += batch.length;
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const file = batch[j];
      const title = titles[j];
      if (!title || typeof title !== 'string') {
        console.error(`  ✗ [${j}] no title returned for ${path.relative(seedsDir, file)}`);
        errors++;
        continue;
      }

      const content = fs.readFileSync(file, 'utf8');
      const updated = injectTitle(content, title.trim());

      if (DRY_RUN) {
        console.log(`  [dry] ${path.relative(seedsDir, file)}\n        → "${title}"`);
      } else {
        fs.writeFileSync(file, updated, 'utf8');
        console.log(`  ✓ ${path.relative(seedsDir, file)}\n    → "${title}"`);
      }
      processed++;
    }

    // Small pause between batches to be kind to rate limits
    if (i + BATCH_SIZE < pending.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\nDone. ${processed} files updated, ${errors} errors.`);
}

main().catch(err => { console.error(err); process.exit(1); });
