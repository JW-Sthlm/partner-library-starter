/**
 * Generates browse page data by extracting all link entries from category pages.
 * Outputs a JSON file that the Browse page component consumes.
 *
 * Run as part of the build: `tsx scripts/generate-browse-data.ts`
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, relative, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DOCS_DIR = join(__dirname, '..', 'docs');
const OUTPUT_FILE = join(DOCS_DIR, '.vitepress', 'data', 'browse-data.json');

interface LinkEntry {
  title: string;
  url: string;
  description: string;
  tags: Record<string, string>;
  category: string;
  sourceFile: string;
}

function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry.startsWith('.')) continue;
    if (statSync(full).isDirectory()) {
      files.push(...findMarkdownFiles(full));
    } else if (entry.endsWith('.md') && entry !== 'index.md' && entry !== 'browse.md') {
      files.push(full);
    }
  }
  return files;
}

function extractCategory(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  const titleMatch = content.match(/^title:\s*(.+)$/m);
  return titleMatch ? titleMatch[1].trim() : basename(filePath, '.md');
}

function extractLinkEntries(filePath: string): LinkEntry[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const entries: LinkEntry[] = [];
  const category = extractCategory(filePath);
  const sourceFile = relative(DOCS_DIR, filePath);

  // Tag keys in the expected order for the compact format.
  // Keep in sync with docs/.vitepress/data/tags.ts.
  const tagKeys = ['track', 'contentType', 'audience', 'shareability', 'maturity', 'product', 'pattern', 'owner', 'lastReviewed'];

  for (let i = 0; i < lines.length; i++) {
    const h3Match = lines[i].match(/^###\s+(?:\S+\s+)?\[(.+?)\]\((.+?)\)/);
    if (!h3Match) continue;

    const title = h3Match[1];
    const url = h3Match[2];
    const descriptionLines: string[] = [];
    const tags: Record<string, string> = {};

    // Collect description text between H3 and metadata (compact or table)
    let j = i + 1;
    while (j < lines.length && !lines[j].match(/^> \*\*Tags:\*\*/) && !lines[j].startsWith('| Tag') && !lines[j].startsWith('###') && !lines[j].startsWith('## ')) {
      const line = lines[j].trim();
      if (line) descriptionLines.push(line);
      j++;
    }

    // Parse compact format: > **Tags:** `val1` · `val2` · ...
    if (j < lines.length && lines[j].match(/^> \*\*Tags:\*\*/)) {
      const tagLine = lines[j].replace(/^> \*\*Tags:\*\*\s*/, '');
      const values = tagLine.split('·').map(v => v.trim().replace(/^`|`$/g, ''));
      for (let k = 0; k < Math.min(values.length, tagKeys.length); k++) {
        if (values[k]) tags[tagKeys[k]] = values[k];
      }
    }
    // Parse table format (legacy): | Tag | Value |
    else if (j < lines.length && lines[j].startsWith('| Tag')) {
      j += 2; // skip header + separator
      while (j < lines.length && lines[j].startsWith('|')) {
        const cols = lines[j].split('|').map((c) => c.trim()).filter(Boolean);
        if (cols.length >= 2) {
          tags[cols[0]] = cols[1];
        }
        j++;
      }
    }

    entries.push({
      title,
      url,
      description: descriptionLines.join(' '),
      tags,
      category,
      sourceFile,
    });
  }

  return entries;
}

// Main
const mdFiles = findMarkdownFiles(DOCS_DIR);
const allEntries: LinkEntry[] = [];

for (const file of mdFiles) {
  allEntries.push(...extractLinkEntries(file));
}

// Ensure output directory exists
mkdirSync(join(DOCS_DIR, '.vitepress', 'data'), { recursive: true });
writeFileSync(OUTPUT_FILE, JSON.stringify(allEntries, null, 2));

console.log(`Generated browse data: ${allEntries.length} links from ${mdFiles.length} files → ${relative(process.cwd(), OUTPUT_FILE)}`);
