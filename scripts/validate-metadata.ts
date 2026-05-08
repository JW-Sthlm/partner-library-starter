/**
 * Validates metadata on all link entries across the library.
 * Parses Markdown files, extracts link entries (H3 with metadata tables),
 * and checks that all required tags are present with valid values.
 *
 * Exit code 0 = all valid, 1 = validation errors found.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tagSchema, requiredTags, enumTags } from '../docs/.vitepress/data/tags.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DOCS_DIR = join(__dirname, '..', 'docs');

interface LinkEntry {
  file: string;
  line: number;
  title: string;
  url: string;
  tags: Record<string, string>;
}

interface ValidationError {
  file: string;
  line: number;
  title: string;
  message: string;
}

function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry.startsWith('.')) continue;
    if (statSync(full).isDirectory()) {
      files.push(...findMarkdownFiles(full));
    } else if (entry.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

function extractLinkEntries(filePath: string): LinkEntry[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const entries: LinkEntry[] = [];

  // Tag keys in the expected order for the compact format.
  // Keep in sync with docs/.vitepress/data/tags.ts.
  const tagKeys = ['track', 'contentType', 'audience', 'shareability', 'maturity', 'product', 'pattern', 'owner', 'lastReviewed'];

  for (let i = 0; i < lines.length; i++) {
    // Match H3 with a Markdown link: ### [Title](URL)
    const h3Match = lines[i].match(/^###\s+(?:\S+\s+)?\[(.+?)\]\((.+?)\)/);
    if (!h3Match) continue;

    const title = h3Match[1];
    const url = h3Match[2];
    const tags: Record<string, string> = {};

    // Look for metadata — either compact format (> **Tags:** ...) or table format (| Tag | Value |)
    let j = i + 1;
    while (j < lines.length && !lines[j].match(/^> \*\*Tags:\*\*/) && !lines[j].startsWith('| Tag') && !lines[j].startsWith('###') && !lines[j].startsWith('## ')) {
      j++;
    }

    if (j < lines.length && lines[j].match(/^> \*\*Tags:\*\*/)) {
      // Compact format: > **Tags:** `val1` · `val2` · ...
      const tagLine = lines[j].replace(/^> \*\*Tags:\*\*\s*/, '');
      const values = tagLine.split('·').map(v => v.trim().replace(/^`|`$/g, ''));
      for (let k = 0; k < Math.min(values.length, tagKeys.length); k++) {
        if (values[k]) tags[tagKeys[k]] = values[k];
      }
    } else if (j < lines.length && lines[j].startsWith('| Tag')) {
      // Table format (legacy): | Tag | Value |
      j += 2;
      while (j < lines.length && lines[j].startsWith('|')) {
        const cols = lines[j].split('|').map((c) => c.trim()).filter(Boolean);
        if (cols.length >= 2) {
          tags[cols[0]] = cols[1];
        }
        j++;
      }
    }

    entries.push({
      file: relative(DOCS_DIR, filePath),
      line: i + 1,
      title,
      url,
      tags,
    });
  }

  return entries;
}

function validate(entries: LinkEntry[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const entry of entries) {
    // Check required tags
    for (const key of requiredTags) {
      if (!entry.tags[key] || entry.tags[key] === '—' || entry.tags[key] === '-') {
        errors.push({
          file: entry.file,
          line: entry.line,
          title: entry.title,
          message: `Missing required tag: "${key}"`,
        });
      }
    }

    // Check enum tag values
    for (const key of enumTags) {
      const value = entry.tags[key];
      if (!value || value === '—' || value === '-') continue;

      const schema = (tagSchema as any)[key];
      if (!schema || !('values' in schema)) continue;

      const allowedValues: string[] = [...schema.values];
      const actualValues = value.split(',').map((v: string) => v.trim());

      for (const v of actualValues) {
        if (!allowedValues.includes(v)) {
          errors.push({
            file: entry.file,
            line: entry.line,
            title: entry.title,
            message: `Invalid value "${v}" for tag "${key}". Allowed: ${allowedValues.join(', ')}`,
          });
        }
      }
    }

    // Check lastReviewed is a valid date
    if (entry.tags.lastReviewed && entry.tags.lastReviewed !== '—') {
      const date = new Date(entry.tags.lastReviewed);
      if (isNaN(date.getTime())) {
        errors.push({
          file: entry.file,
          line: entry.line,
          title: entry.title,
          message: `Invalid date format for lastReviewed: "${entry.tags.lastReviewed}". Use ISO format (YYYY-MM-DD).`,
        });
      }
    }
  }

  return errors;
}

// Main
const mdFiles = findMarkdownFiles(DOCS_DIR);
const allEntries: LinkEntry[] = [];

for (const file of mdFiles) {
  allEntries.push(...extractLinkEntries(file));
}

console.log(`Found ${allEntries.length} link entries across ${mdFiles.length} Markdown files.`);

const errors = validate(allEntries);

if (errors.length === 0) {
  console.log('✅ All link entries have valid metadata.');
  process.exit(0);
} else {
  console.error(`\n❌ Found ${errors.length} validation error(s):\n`);
  for (const err of errors) {
    console.error(`  ${err.file}:${err.line} — "${err.title}"`);
    console.error(`    → ${err.message}\n`);
  }
  process.exit(1);
}
