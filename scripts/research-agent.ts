/**
 * Research Agent — discovers new content from monitored sources.
 *
 * Runs daily via GitHub Actions. For each source:
 * 1. Fetches latest content (RSS, GitHub releases, or HTML)
 * 2. Filters to items published since last check
 * 3. Assesses relevance using GitHub Models API (Claude Sonnet 4.6)
 * 4. Deduplicates against existing library
 * 5. Creates GitHub Issues for qualifying links
 *
 * Max 5 issues per run to avoid overwhelming reviewers.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = join(__dirname, '..');
const SOURCES_FILE = join(ROOT, 'sources.yml');
const STATE_FILE = join(ROOT, 'state', 'last-checked.json');
const BROWSE_DATA = join(ROOT, 'docs', '.vitepress', 'data', 'browse-data.json');

const MAX_ISSUES_PER_RUN = 3;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_MODELS_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO_OWNER = process.env.REPO_OWNER || '';
const REPO_NAME = process.env.REPO_NAME || '';
const LIBRARY_NAME = process.env.LIBRARY_NAME || 'this library';
const LIBRARY_AUDIENCE = process.env.LIBRARY_AUDIENCE
  || 'people building, architecting, and operating in the library\'s domain';

if (!REPO_OWNER || !REPO_NAME) {
  console.error('REPO_OWNER and REPO_NAME must be set (the workflow passes these via github.repository_owner and github.event.repository.name).');
  process.exit(1);
}

// ── Source Parsing ───────────────────────────────────────

interface Source {
  name: string;
  type: 'rss' | 'github_releases' | 'html_whats_new';
  url: string;
  track: string;
  categories: string[];
  keywords: string[];
}

interface DiscoveredItem {
  title: string;
  url: string;
  description: string;
  publishedAt: string;
  source: Source;
}

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

// ── State Management ─────────────────────────────────────

interface State {
  lastRun: string | null;
  sources: Record<string, string>;
}

function loadState(): State {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { lastRun: null, sources: {} };
  }
}

function saveState(state: State) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Fetchers ─────────────────────────────────────────────

async function fetchRSS(source: Source, lastChecked: string): Promise<DiscoveredItem[]> {
  try {
    const res = await fetch(source.url);
    if (!res.ok) return [];
    const text = await res.text();

    const items: DiscoveredItem[] = [];
    // Simple RSS/Atom parsing — extract <item> or <entry> blocks
    const entryPattern = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
    let match;
    while ((match = entryPattern.exec(text)) !== null) {
      const block = match[1];
      const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || '';
      const link = block.match(/<link[^>]*href="([^"]+)"/)?.[1] || block.match(/<link[^>]*>(.*?)<\/link>/)?.[1] || '';
      const desc = block.match(/<description[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/)?.[1]
        || block.match(/<summary[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/summary>/)?.[1] || '';
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]
        || block.match(/<published>(.*?)<\/published>/)?.[1]
        || block.match(/<updated>(.*?)<\/updated>/)?.[1] || '';

      if (!title || !link) continue;

      // Only include items published after last check
      if (lastChecked && pubDate) {
        const itemDate = new Date(pubDate);
        const checkDate = new Date(lastChecked);
        if (itemDate <= checkDate) continue;
      }

      // Keyword relevance check
      const text_lower = (title + ' ' + desc).toLowerCase();
      const hasKeyword = source.keywords.some(kw => text_lower.includes(kw.toLowerCase()));
      if (!hasKeyword) continue;

      items.push({
        title: title.replace(/<[^>]+>/g, '').trim(),
        url: link.trim(),
        description: desc.replace(/<[^>]+>/g, '').substring(0, 300).trim(),
        publishedAt: pubDate,
        source,
      });
    }
    return items.slice(0, 10); // Max 10 per source
  } catch (e) {
    console.log(`  ⚠️ RSS fetch failed for ${source.name}: ${(e as Error).message}`);
    return [];
  }
}

async function fetchGitHubReleases(source: Source, lastChecked: string): Promise<DiscoveredItem[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${source.url}/releases?per_page=5`, {
      headers: GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {},
    });
    if (!res.ok) return [];
    const releases = await res.json() as Array<{ tag_name: string; html_url: string; name: string; body: string; published_at: string }>;

    return releases
      .filter(r => {
        if (!lastChecked) return true;
        return new Date(r.published_at) > new Date(lastChecked);
      })
      .map(r => ({
        title: `${source.name.replace(' Releases', '')} ${r.tag_name}`,
        url: r.html_url,
        description: (r.body || r.name || '').substring(0, 300).replace(/\n/g, ' ').trim(),
        publishedAt: r.published_at,
        source,
      }))
      .slice(0, 3);
  } catch (e) {
    console.log(`  ⚠️ GitHub releases fetch failed for ${source.name}: ${(e as Error).message}`);
    return [];
  }
}

async function fetchHTMLWhatsNew(source: Source, _lastChecked: string): Promise<DiscoveredItem[]> {
  // HTML pages are harder to parse generically — for now, just flag the page
  // as "has updates" and let the LLM assess. A more sophisticated parser
  // could be added per source.
  try {
    const res = await fetch(source.url);
    if (!res.ok) return [];
    // For now, return the page itself as a potential link if not already in the library
    return [{
      title: source.name,
      url: source.url,
      description: `Check for recent updates on ${source.name}`,
      publishedAt: new Date().toISOString(),
      source,
    }];
  } catch {
    return [];
  }
}

// ── LLM Assessment ───────────────────────────────────────

async function assessRelevance(item: DiscoveredItem): Promise<{ relevant: boolean; motivation: string; category: string; contentType: string }> {
  const prompt = `You are a strict content curator for ${LIBRARY_NAME}. Your job is to maintain a VERY high quality bar. Only the most valuable, actionable content should make it into the library.

## The audience
${LIBRARY_AUDIENCE}

## What IS valuable (approve only these)
- How-to guides and tutorials that teach the audience to BUILD or DO something
- Architecture references and design patterns they can APPLY
- SDK / API docs and code samples they can USE
- Frameworks and methodologies they can ADOPT in their own work
- Major releases that open up genuinely new capabilities
- Thought leadership with concrete, applicable takeaways

## What is NOT valuable (reject these)
- Generic industry marketing
- Event announcements or conference recaps without artifacts
- Product launches without actionable technical content
- Pricing, region, or infrastructure news
- Vague thought leadership without concrete takeaways
- Minor patches or bug fixes
- Performance benchmarks without practical guidance
- Anything that is interesting but not ACTIONABLE for the audience

## Quality bar
Ask: "Would a busy person in the audience stop what they're doing to read this AND take action based on it?" If the answer is anything less than a confident YES, reject it. When in doubt, reject. The library should be small and high-signal, not comprehensive.

## Content to assess
Title: "${item.title}"
URL: ${item.url}
Description: "${item.description}"
Source: ${item.source.name} (${item.source.track})

Respond in JSON only:
{
  "relevant": true/false,
  "motivation": "1-2 sentence explanation of specifically how this helps the audience",
  "category": "best category file (slug like 'architecture-and-patterns' or 'tools-and-utilities' — match an existing page in /docs)",
  "contentType": "documentation|blog|repo|course|architecture|tool|webinar|whitepaper"
}`;

  try {
    const res = await fetch('https://models.github.ai/inference/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_MODELS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4.6',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 300,
      }),
    });

    if (!res.ok) {
      console.log(`  ⚠️ LLM assessment failed: ${res.status}`);
      return { relevant: false, motivation: '', category: '', contentType: 'documentation' };
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { relevant: false, motivation: '', category: '', contentType: 'documentation' };

    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.log(`  ⚠️ LLM error: ${(e as Error).message}`);
    return { relevant: false, motivation: '', category: '', contentType: 'documentation' };
  }
}

// ── Deduplication ────────────────────────────────────────

function loadExistingLinks(): Set<string> {
  try {
    const data = JSON.parse(readFileSync(BROWSE_DATA, 'utf-8')) as Array<{ url: string }>;
    return new Set(data.map(d => d.url.toLowerCase()));
  } catch {
    return new Set();
  }
}

async function getOpenSuggestionUrls(): Promise<Set<string>> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?labels=link-suggestion&state=open&per_page=100`,
      { headers: GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {} }
    );
    if (!res.ok) return new Set();
    const issues = await res.json() as Array<{ body: string }>;
    const urls = new Set<string>();
    for (const issue of issues) {
      const match = issue.body?.match(/https?:\/\/\S+/);
      if (match) urls.add(match[0].toLowerCase());
    }
    return urls;
  } catch {
    return new Set();
  }
}

// ── Issue Creation ───────────────────────────────────────

async function createIssue(item: DiscoveredItem, assessment: { motivation: string; category: string; contentType: string }) {
  const body = [
    `## New link suggested for ${LIBRARY_NAME}`,
    ``,
    `🔗 **Suggested link:** ${item.url}`,
    ``,
    `**Description:** ${item.description}`,
    `**Submitted by:** 🤖 Research Agent`,
    `**Source:** ${item.source.name}`,
    ``,
    `### Why this is relevant`,
    ``,
    assessment.motivation,
    ``,
    `**Suggested category:** ${assessment.category}`,
    `**Content type:** ${assessment.contentType}`,
    `**Track:** ${item.source.track}`,
    ``,
    `---`,
    `*Discovered automatically by the Research Agent on ${new Date().toISOString().split('T')[0]}.*`,
  ].join('\n');

  const title = `📋 Review content: ${item.title.substring(0, 70)}`;

  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body,
        labels: ['link-suggestion', 'research-agent'],
      }),
    }
  );

  if (res.ok) {
    console.log(`  ✅ Issue created: ${title}`);
  } else {
    console.log(`  ❌ Failed to create issue: ${res.status}`);
  }
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  console.log('🔍 Research Agent starting...\n');

  const sources = parseSources();
  const state = loadState();
  const existingLinks = loadExistingLinks();
  const openSuggestions = await getOpenSuggestionUrls();
  let issuesCreated = 0;

  console.log(`📚 Library has ${existingLinks.size} existing links`);
  console.log(`📝 ${openSuggestions.size} open suggestion issues`);
  console.log(`📡 ${sources.length} sources to check\n`);

  for (const source of sources) {
    if (issuesCreated >= MAX_ISSUES_PER_RUN) {
      console.log(`\n⏸️ Reached max ${MAX_ISSUES_PER_RUN} issues per run. Remaining sources queued for tomorrow.`);
      break;
    }

    console.log(`\n── ${source.name} (${source.type}) ──`);
    const lastChecked = state.sources[source.name] || state.lastRun || '';

    let items: DiscoveredItem[] = [];
    switch (source.type) {
      case 'rss':
        items = await fetchRSS(source, lastChecked);
        break;
      case 'github_releases':
        items = await fetchGitHubReleases(source, lastChecked);
        break;
      case 'html_whats_new':
        items = await fetchHTMLWhatsNew(source, lastChecked);
        break;
    }

    console.log(`  Found ${items.length} new items`);

    for (const item of items) {
      if (issuesCreated >= MAX_ISSUES_PER_RUN) break;

      // Deduplicate
      if (existingLinks.has(item.url.toLowerCase())) {
        console.log(`  ⏭️ Already in library: ${item.title}`);
        continue;
      }
      if (openSuggestions.has(item.url.toLowerCase())) {
        console.log(`  ⏭️ Already suggested: ${item.title}`);
        continue;
      }

      // Assess with LLM
      console.log(`  🧠 Assessing: ${item.title}`);
      const assessment = await assessRelevance(item);

      if (!assessment.relevant) {
        console.log(`  ⏭️ Not relevant: ${item.title}`);
        continue;
      }

      // Create issue
      await createIssue(item, assessment);
      issuesCreated++;
    }

    // Update state
    state.sources[source.name] = new Date().toISOString();
  }

  // Save state
  state.lastRun = new Date().toISOString();
  saveState(state);

  console.log(`\n✅ Research Agent complete. ${issuesCreated} new issues created.`);
}

main().catch(e => {
  console.error('Research Agent failed:', e);
  process.exit(1);
});
