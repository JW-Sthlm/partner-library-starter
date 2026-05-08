/**
 * Maintenance Agent — keeps the library healthy.
 *
 * Runs weekly via GitHub Actions. Checks:
 * 1. Link health (HTTP status)
 * 2. Content freshness (lastReviewed > 90 days)
 * 3. Duplicate detection (similar URLs)
 * 4. Coverage gaps (categories with no recent updates)
 * 5. Source health (reachability, activity, coverage gaps)
 *
 * Creates one Issue with a maintenance report.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = join(__dirname, '..');
const BROWSE_DATA = join(ROOT, 'docs', '.vitepress', 'data', 'browse-data.json');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO_OWNER = process.env.REPO_OWNER || '';
const REPO_NAME = process.env.REPO_NAME || '';
const LIBRARY_NAME = process.env.LIBRARY_NAME || 'this library';

if (!REPO_OWNER || !REPO_NAME) {
  console.error('REPO_OWNER and REPO_NAME must be set (the workflow passes these via github.repository_owner and github.event.repository.name).');
  process.exit(1);
}

const SOURCES_FILE = join(ROOT, 'sources.yml');
const STATE_FILE = join(ROOT, 'state', 'last-checked.json');

const STALE_DAYS = 90;
const LOW_SIGNAL_DAYS = 30;

interface Source {
  name: string;
  type: 'rss' | 'github_releases' | 'html_whats_new';
  url: string;
  track: string;
  categories: string[];
  keywords: string[];
}

interface SourceHealthResult {
  source: Source;
  reachable: boolean;
  httpStatus: number | string;
  lastChecked: string | null;
  lastItemDate: string | null;
  lowSignal: boolean;
}

interface SourceHealthReport {
  results: SourceHealthResult[];
  coverageGaps: Array<{ category: string; count: number }>;
}

interface LinkEntry {
  title: string;
  url: string;
  description: string;
  tags: Record<string, string>;
  category: string;
  sourceFile: string;
}

// ── Link Health Check ────────────────────────────────────

async function checkLinkHealth(links: LinkEntry[]): Promise<Array<{ link: LinkEntry; status: number | string }>> {
  const broken: Array<{ link: LinkEntry; status: number | string }> = [];

  for (const link of links) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(link.url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status >= 400) {
        broken.push({ link, status: res.status });
      }
    } catch (e) {
      broken.push({ link, status: (e as Error).message.substring(0, 50) });
    }
  }

  return broken;
}

// ── Freshness Check ──────────────────────────────────────

function checkFreshness(links: LinkEntry[]): LinkEntry[] {
  const stale: LinkEntry[] = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - STALE_DAYS);

  for (const link of links) {
    const reviewed = link.tags.lastReviewed;
    if (!reviewed || reviewed === '—') {
      stale.push(link);
      continue;
    }
    const reviewDate = new Date(reviewed);
    if (reviewDate < cutoff) {
      stale.push(link);
    }
  }

  return stale;
}

// ── Duplicate Detection ──────────────────────────────────

function findDuplicates(links: LinkEntry[]): Array<[LinkEntry, LinkEntry]> {
  const dupes: Array<[LinkEntry, LinkEntry]> = [];

  for (let i = 0; i < links.length; i++) {
    for (let j = i + 1; j < links.length; j++) {
      const a = links[i].url.toLowerCase().replace(/\/$/, '').replace(/\/index\.html$/, '');
      const b = links[j].url.toLowerCase().replace(/\/$/, '').replace(/\/index\.html$/, '');
      if (a === b) {
        dupes.push([links[i], links[j]]);
      }
    }
  }

  return dupes;
}

// ── Coverage Gap Analysis ────────────────────────────────

function analyzeCoverage(links: LinkEntry[]): Array<{ category: string; count: number; lastUpdated: string }> {
  const categories = new Map<string, { count: number; lastUpdated: string }>();

  for (const link of links) {
    const cat = link.category || link.sourceFile;
    const existing = categories.get(cat) || { count: 0, lastUpdated: '1970-01-01' };
    existing.count++;
    const reviewed = link.tags.lastReviewed || '1970-01-01';
    if (reviewed > existing.lastUpdated) existing.lastUpdated = reviewed;
    categories.set(cat, existing);
  }

  return Array.from(categories.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => a.lastUpdated.localeCompare(b.lastUpdated));
}

// ── Source Health Check ───────────────────────────────────

function parseSources(): Source[] {
  const content = readFileSync(SOURCES_FILE, 'utf-8');
  const sources: Source[] = [];
  let current: Partial<Source> | null = null;

  for (const line of content.split('\n')) {
    if (line.match(/^\s+- name:/)) {
      if (current?.name) sources.push(current as Source);
      current = { name: line.split(':').slice(1).join(':').trim(), keywords: [], categories: [] };
    } else if (current) {
      const kv = line.match(/^\s+(\w+):\s*(.+)/);
      if (kv) {
        const [, key, val] = kv;
        if (key === 'type') current.type = val.trim() as Source['type'];
        else if (key === 'url') current.url = val.trim();
        else if (key === 'track') current.track = val.trim();
        else if (key === 'categories') current.categories = val.replace(/[\[\]]/g, '').split(',').map(s => s.trim());
        else if (key === 'keywords') current.keywords = val.replace(/[\[\]]/g, '').split(',').map(s => s.trim());
      }
    }
  }
  if (current?.name) sources.push(current as Source);
  return sources;
}

async function checkSourceHealth(links: LinkEntry[]): Promise<SourceHealthReport> {
  const sources = parseSources();

  // Load state — supports both current flat format and richer { lastChecked, lastItemDate } format
  let stateData: Record<string, unknown> = {};
  try {
    if (existsSync(STATE_FILE)) {
      stateData = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch { /* no state available */ }

  const results: SourceHealthResult[] = [];

  for (const source of sources) {
    // Resolve state entry (nested under "sources" key or at top level)
    const sourceState = (stateData as Record<string, unknown>).sources
      ? ((stateData as Record<string, Record<string, unknown>>).sources)[source.name]
      : stateData[source.name];

    let lastChecked: string | null = null;
    let lastItemDate: string | null = null;

    if (typeof sourceState === 'string') {
      lastChecked = sourceState;
    } else if (sourceState && typeof sourceState === 'object') {
      const s = sourceState as Record<string, string>;
      lastChecked = s.lastChecked || null;
      lastItemDate = s.lastItemDate || null;
    }

    // Reachability check
    let reachable = false;
    let httpStatus: number | string = 'Unknown';

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      let checkUrl = source.url;
      const headers: Record<string, string> = { 'User-Agent': 'partner-library-maintenance-agent' };

      if (source.type === 'github_releases') {
        checkUrl = `https://api.github.com/repos/${source.url}/releases?per_page=1`;
        headers['Accept'] = 'application/vnd.github+json';
        if (GITHUB_TOKEN) headers['Authorization'] = `token ${GITHUB_TOKEN}`;
      }

      const res = await fetch(checkUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeout);

      httpStatus = res.status;

      if (res.status === 200) {
        if (source.type === 'rss') {
          const contentType = res.headers.get('content-type') || '';
          if (/xml|rss|atom/i.test(contentType)) {
            reachable = true;
          } else {
            // Fallback: sniff body for XML feed markers
            const body = await res.text();
            reachable = /<rss|<feed|<channel/i.test(body.substring(0, 500));
            if (!reachable) httpStatus = `200 (not a feed: ${contentType.split(';')[0]})`;
          }
        } else {
          reachable = true;
        }
      } else if (source.type === 'github_releases' && (res.status === 401 || res.status === 403)) {
        httpStatus = `${res.status} (auth/token issue)`;
      } else if (res.status === 429) {
        httpStatus = `429 (rate limited)`;
      }
    } catch (e) {
      httpStatus = (e as Error).message.substring(0, 50);
    }

    // Low signal — only when lastItemDate is tracked
    let lowSignal = false;
    if (lastItemDate) {
      const daysSince = Math.floor((Date.now() - new Date(lastItemDate).getTime()) / 86400000);
      lowSignal = daysSince >= LOW_SIGNAL_DAYS;
    }

    results.push({ source, reachable, httpStatus, lastChecked, lastItemDate, lowSignal });
  }

  // Coverage gaps — categories with fewer than 5 links
  const categoryCounts = new Map<string, number>();
  for (const link of links) {
    const cat = link.category || link.sourceFile.replace(/\.md$/, '');
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
  }
  const coverageGaps = Array.from(categoryCounts.entries())
    .filter(([, count]) => count < 5)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.count - b.count);

  return { results, coverageGaps };
}

// ── Report Generation (Copilot-actionable format) ────────

async function createReport(
  broken: Array<{ link: LinkEntry; status: number | string }>,
  stale: LinkEntry[],
  dupes: Array<[LinkEntry, LinkEntry]>,
  coverage: Array<{ category: string; count: number; lastUpdated: string }>,
  sourceHealth: SourceHealthReport,
  totalLinks: number,
) {
  const today = new Date().toISOString().split('T')[0];
  const sections: string[] = [];

  sections.push(`# 📋 Library Maintenance Report — ${today}`);
  sections.push('');
  sections.push(`**Total links:** ${totalLinks}`);
  sections.push('');
  sections.push('> **How to act on this report:** Comment with instructions (e.g., "Remove the broken links and update stale dates to today") then assign this issue to **Copilot** to auto-create a PR. Or handle manually.');
  sections.push('');

  // Broken links — actionable blocks
  if (broken.length > 0) {
    sections.push(`## ❌ Broken Links (${broken.length})`);
    sections.push('');
    for (const b of broken) {
      sections.push(`### Broken: ${b.link.title}`);
      sections.push(`- **File:** \`docs/${b.link.sourceFile}\``);
      sections.push(`- **URL:** ${b.link.url}`);
      sections.push(`- **HTTP status:** ${b.status}`);
      sections.push(`- **Suggested action:** Remove this link entry from \`docs/${b.link.sourceFile}\`, or find and replace with an updated URL.`);
      sections.push('');
    }
  } else {
    sections.push(`## ✅ No broken links`);
    sections.push('');
  }

  // Stale content — actionable blocks
  if (stale.length > 0) {
    sections.push(`## ⏰ Stale Content — not reviewed in ${STALE_DAYS}+ days (${stale.length})`);
    sections.push('');
    for (const s of stale.slice(0, 15)) {
      sections.push(`### Stale: ${s.title}`);
      sections.push(`- **File:** \`docs/${s.sourceFile}\``);
      sections.push(`- **URL:** ${s.url}`);
      sections.push(`- **Last reviewed:** ${s.tags.lastReviewed || 'never'}`);
      sections.push(`- **Suggested action:** Verify the link still works and content is current. If yes, update the \`lastReviewed\` date to \`${today}\` in the Tags line. If outdated, remove the entry.`);
      sections.push('');
    }
    if (stale.length > 15) {
      sections.push(`*...and ${stale.length - 15} more stale links. Run \`npm run maintenance\` locally for the full list.*`);
      sections.push('');
    }
  } else {
    sections.push(`## ✅ All links recently reviewed`);
    sections.push('');
  }

  // Duplicates — actionable blocks
  if (dupes.length > 0) {
    sections.push(`## 🔄 Potential Duplicates (${dupes.length})`);
    sections.push('');
    for (const [a, b] of dupes) {
      sections.push(`### Duplicate: ${a.title}`);
      sections.push(`- **Copy 1:** \`docs/${a.sourceFile}\` — [${a.title}](${a.url})`);
      sections.push(`- **Copy 2:** \`docs/${b.sourceFile}\` — [${b.title}](${b.url})`);
      sections.push(`- **Suggested action:** Keep the entry in the most relevant category (\`${a.sourceFile}\` or \`${b.sourceFile}\`) and remove the other.`);
      sections.push('');
    }
  }

  // Coverage summary
  sections.push(`## 📊 Coverage Summary`);
  sections.push('');
  sections.push(`| Category | Links | Last Updated | Status |`);
  sections.push(`|----------|-------|-------------|--------|`);
  for (const c of coverage) {
    const daysSince = Math.floor((Date.now() - new Date(c.lastUpdated).getTime()) / 86400000);
    const status = daysSince > 30 ? `⚠️ ${daysSince}d ago` : `✅ ${daysSince}d ago`;
    sections.push(`| ${c.category} | ${c.count} | ${c.lastUpdated} | ${status} |`);
  }
  sections.push('');
  sections.push('*⚠️ = no updates in 30+ days — consider adding fresh content to this category.*');
  sections.push('');

  // Source Health section
  sections.push(`## 📡 Source Health (${sourceHealth.results.length} sources)`);
  sections.push('');
  sections.push(`### Source Status`);
  sections.push('');
  sections.push(`| Source | Type | Track | Status | Last Item |`);
  sections.push(`|--------|------|----------|--------|-----------|`);

  for (const r of sourceHealth.results) {
    let status: string;
    if (!r.reachable) {
      status = `❌ Unreachable (${r.httpStatus})`;
    } else if (r.lowSignal) {
      status = `⚠️ Low signal`;
    } else {
      status = `✅ Reachable`;
    }

    let lastItem: string;
    if (r.lastItemDate) {
      const daysAgo = Math.floor((Date.now() - new Date(r.lastItemDate).getTime()) / 86400000);
      lastItem = daysAgo === 0 ? 'today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;
    } else if (r.lastChecked) {
      const daysAgo = Math.floor((Date.now() - new Date(r.lastChecked).getTime()) / 86400000);
      lastItem = daysAgo === 0 ? 'checked today' : `checked ${daysAgo}d ago`;
    } else {
      lastItem = 'No data';
    }

    sections.push(`| ${r.source.name} | ${r.source.type} | ${r.source.track} | ${status} | ${lastItem} |`);
  }
  sections.push('');

  // Suggested actions
  const unreachableSources = sourceHealth.results.filter(r => !r.reachable);
  const lowSignalSources = sourceHealth.results.filter(r => r.reachable && r.lowSignal);

  if (unreachableSources.length > 0 || lowSignalSources.length > 0 || sourceHealth.coverageGaps.length > 0) {
    sections.push(`### Suggested Actions`);
    sections.push('');
    for (const r of unreachableSources) {
      sections.push(`- **Unreachable:** ${r.source.name} returned ${r.httpStatus} — verify URL or remove from sources.yml`);
    }
    for (const r of lowSignalSources) {
      const daysAgo = r.lastItemDate
        ? Math.floor((Date.now() - new Date(r.lastItemDate).getTime()) / 86400000)
        : '?';
      sections.push(`- **Low signal:** ${r.source.name} hasn't produced relevant content in ${daysAgo}+ days — consider replacing with a more active source`);
    }
    if (sourceHealth.coverageGaps.length > 0) {
      const gapList = sourceHealth.coverageGaps.map(g => `${g.category} (${g.count})`).join(', ');
      sections.push(`- **Coverage gaps:** Categories with < 5 links that could benefit from dedicated sources: ${gapList}`);
    }
    sections.push('');
  }

  const body = sections.join('\n');

  // Skip issue creation when nothing needs attention.
  const hasAttention =
    broken.length > 0 ||
    stale.length > 0 ||
    dupes.length > 0 ||
    unreachableSources.length > 0 ||
    lowSignalSources.length > 0 ||
    sourceHealth.coverageGaps.length > 0;

  if (!hasAttention) {
    console.log('✅ No maintenance attention needed — skipping issue creation.');
    if (process.env.GITHUB_STEP_SUMMARY) {
      try {
        const { appendFileSync } = await import('fs');
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, body + '\n');
      } catch {
        // ignore summary write errors
      }
    }
    // Still close any prior open maintenance issues — they're stale now.
    await closePriorMaintenanceIssues(
      null,
      `Closed automatically — no maintenance attention needed in this run (${today}). Future reports will only open an issue when action is needed.`
    );
    return;
  }

  // Create the issue
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `📋 Library Maintenance Report — ${today}`,
        body,
        labels: ['maintenance'],
      }),
    }
  );

  if (!res.ok) {
    console.log(`❌ Failed to create report: ${res.status}`);
    return;
  }

  const created = (await res.json()) as { number: number };
  console.log(`✅ Maintenance report created: #${created.number}`);

  await closePriorMaintenanceIssues(
    created.number,
    `Superseded by #${created.number}.`
  );
}

async function closePriorMaintenanceIssues(
  exceptNumber: number | null,
  comment: string
): Promise<void> {
  try {
    const listRes = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=open&labels=maintenance&per_page=100`,
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );
    if (!listRes.ok) return;
    const openIssues = (await listRes.json()) as Array<{
      number: number;
      pull_request?: unknown;
    }>;
    for (const issue of openIssues) {
      if (issue.pull_request) continue;
      if (exceptNumber !== null && issue.number === exceptNumber) continue;
      await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issue.number}/comments`,
        {
          method: 'POST',
          headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ body: comment }),
        }
      );
      await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issue.number}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            state: 'closed',
            state_reason: 'not_planned',
          }),
        }
      );
    }
  } catch (err) {
    console.log(`⚠️  Could not close prior maintenance issues: ${err}`);
  }
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  console.log('🔧 Maintenance Agent starting...\n');

  let links: LinkEntry[];
  try {
    links = JSON.parse(readFileSync(BROWSE_DATA, 'utf-8'));
  } catch {
    console.error('Could not load browse-data.json. Run npm run build first.');
    process.exit(1);
  }

  console.log(`📚 Checking ${links.length} links...\n`);

  // Run checks
  console.log('1. Checking link health...');
  const broken = await checkLinkHealth(links);
  console.log(`   ${broken.length} broken links found`);

  console.log('2. Checking freshness...');
  const stale = checkFreshness(links);
  console.log(`   ${stale.length} stale links found`);

  console.log('3. Checking for duplicates...');
  const dupes = findDuplicates(links);
  console.log(`   ${dupes.length} duplicates found`);

  console.log('4. Analyzing coverage...');
  const coverage = analyzeCoverage(links);

  console.log('5. Checking source health...');
  const sourceHealth = await checkSourceHealth(links);
  const unreachable = sourceHealth.results.filter(r => !r.reachable).length;
  const lowSig = sourceHealth.results.filter(r => r.lowSignal).length;
  console.log(`   ${sourceHealth.results.length} sources checked — ${unreachable} unreachable, ${lowSig} low signal`);

  // Create report
  console.log('\n📝 Creating maintenance report...');
  await createReport(broken, stale, dupes, coverage, sourceHealth, links.length);

  console.log('\n✅ Maintenance Agent complete.');
}

main().catch(e => {
  console.error('Maintenance Agent failed:', e);
  process.exit(1);
});
