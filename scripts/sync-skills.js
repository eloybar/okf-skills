const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { buildSteeringDirectivesBlock } = require('../okf-maintain/scripts/maintain.js');

const workspaceRoot = path.resolve(__dirname, '..');
const isCheck = process.argv.includes('--check');

const SKILLS = [
  'okf',
  'okf-wayfinder',
  'okf-query',
  'okf-lint',
  'okf-maintain',
  'okf-visualize',
  'okf-learn'
];

const PANEL_MAPPINGS = [
  { panelId: 'details-panel-2', header: '# ~/.agent/skills/okf/SKILL.md', relFile: 'okf/SKILL.md' },
  { panelId: 's3-panel-1', header: '# okf-wayfinder/SKILL.md', relFile: 'okf-wayfinder/SKILL.md' },
  { panelId: 'details-panel-4', header: '# AGENTS.md / CLAUDE.md Content', rawContent: buildSteeringDirectivesBlock('docs/okf', '1.8.2', '') },
  { panelId: 's5q-panel-1', header: '# okf-query/SKILL.md', relFile: 'okf-query/SKILL.md' },
  { panelId: 's5q-panel-2', header: null, relFile: 'okf-query/scripts/query.js' },
  { panelId: 'details-panel-6', header: '# ~/.agent/skills/okf-maintain/SKILL.md', relFile: 'okf-maintain/SKILL.md' },
  { panelId: 's7l-panel-1', header: '# okf-lint/SKILL.md', relFile: 'okf-lint/SKILL.md' },
  { panelId: 's5-panel-1', header: '# ~/.agent/skills/okf-visualize/SKILL.md', relFile: 'okf-visualize/SKILL.md' },
  { panelId: 's5-panel-2', header: null, relFile: 'okf-visualize/scripts/visualize.js' },
  { panelId: 's5-panel-3', header: null, relFile: 'okf-visualize/templates/viz.html' },
  { panelId: 's5-panel-4', header: null, relFile: 'okf-visualize/static/viz.js' },
  { panelId: 's5-panel-5', header: null, relFile: 'okf-visualize/static/viz.css' },
  { panelId: 's9u-panel-1', header: '# okf-maintain/SKILL.md (--upgrade)', relFile: 'okf-maintain/SKILL.md' },
  { panelId: 's10p-panel-1', header: '# okf-maintain/SKILL.md (--prune)', relFile: 'okf-maintain/SKILL.md' },
  { panelId: 's11l-panel-1', header: '# okf-learn/SKILL.md', relFile: 'okf-learn/SKILL.md' }
];

function escapeHtml(str) {
  return str
    .replace(/\r\n/g, '\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function replacePreInPanel(html, panelId, commentHeader, rawContent) {
  const marker = `id="${panelId}"`;
  const idx = html.indexOf(marker);
  if (idx === -1) throw new Error(`Panel marker not found in index.html: ${panelId}`);
  const preStart = html.indexOf('<pre><code>', idx);
  const preEnd = html.indexOf('</code></pre>', preStart);
  if (preStart === -1 || preEnd === -1) throw new Error(`<pre><code> not found in ${panelId}`);
  const prefix = commentHeader ? `<span class="code-comment">${escapeHtml(commentHeader)}</span>\n` : '';
  const body = prefix + escapeHtml(rawContent);
  return html.slice(0, preStart + '<pre><code>'.length) + body + html.slice(preEnd);
}

function buildSyncedIndexHtml(originalHtml) {
  const eol = originalHtml.includes('\r\n') ? '\r\n' : '\n';
  let html = originalHtml.replace(/\r\n/g, '\n');

  for (const m of PANEL_MAPPINGS) {
    const fileContent = m.rawContent !== undefined
      ? m.rawContent
      : fs.readFileSync(path.join(workspaceRoot, m.relFile), 'utf8');
    html = replacePreInPanel(html, m.panelId, m.header, fileContent);
  }

  return eol === '\r\n' ? html.replace(/\n/g, '\r\n') : html;
}

function buildSyncedReadmeMd(originalReadme) {
  const eol = originalReadme.includes('\r\n') ? '\r\n' : '\n';
  let md = originalReadme.replace(/\r\n/g, '\n');
  const skillListStr = SKILLS.join(' ');
  md = md.replace(
    /^(\s*npx skills@latest update\s+).*$/m,
    `$1${skillListStr}`
  );
  md = md.replace(
    /^(\s*npx skills@latest remove\s+).*$/m,
    `$1${skillListStr}`
  );
  return eol === '\r\n' ? md.replace(/\n/g, '\r\n') : md;
}

function verifyCatalogInvariants() {
  const errors = [];

  // 1. Discover all skill directories on disk at workspaceRoot (okf or okf-*)
  const diskSkills = fs.readdirSync(workspaceRoot, { withFileTypes: true })
    .filter(d => d.isDirectory() && (d.name === 'okf' || d.name.startsWith('okf-')) && fs.existsSync(path.join(workspaceRoot, d.name, 'SKILL.md')))
    .map(d => d.name);

  for (const ds of diskSkills) {
    if (!SKILLS.includes(ds)) {
      errors.push(`Skill directory '${ds}' exists on disk with SKILL.md but is not registered in SKILLS array in scripts/sync-skills.js.`);
    }
  }
  for (const s of SKILLS) {
    if (!diskSkills.includes(s)) {
      errors.push(`Skill '${s}' is registered in SKILLS array in scripts/sync-skills.js but '${s}/SKILL.md' does not exist on disk.`);
    }
  }

  // 2. Verify every skill in SKILLS has a SKILL.md panel mapping in index.html
  for (const s of SKILLS) {
    const relTarget = `${s}/SKILL.md`;
    if (!PANEL_MAPPINGS.some(m => m.relFile === relTarget)) {
      errors.push(`Skill '${s}' is missing a SKILL.md panel mapping in PANEL_MAPPINGS (scripts/sync-skills.js & index.html).`);
    }
  }

  // 3. Verify README.md documents every skill in Lifecycle Steps and Repository Contents
  const readmePath = path.join(workspaceRoot, 'README.md');
  if (fs.existsSync(readmePath)) {
    const readme = fs.readFileSync(readmePath, 'utf8');
    for (const s of SKILLS) {
      if (!readme.includes(`[${s}/SKILL.md](${s}/SKILL.md)`)) {
        errors.push(`README.md is missing component link '[${s}/SKILL.md](${s}/SKILL.md)' in The Knowledge Loop Lifecycle section.`);
      }
      if (!readme.includes(`**[${s}/](${s}/)**`)) {
        errors.push(`README.md is missing bullet '**[${s}/](${s}/)**' in the Repository Contents section.`);
      }
    }
  }

  // 4. Verify installers & upgrader include every skill in SKILLS
  const installerChecks = [
    { rel: 'okf-maintain/scripts/upgrade.js', token: s => `'${s}'` },
    { rel: 'install.ps1', token: s => `"${s}"` },
    { rel: 'install.sh', token: s => `"${s}"` },
    { rel: 'docs/okf/index.md', token: s => `concepts/${s}-skill.md` },
    { rel: 'okf-maintain/SKILL.md', token: s => `\`${s}\`` }
  ];
  for (const check of installerChecks) {
    const abs = path.join(workspaceRoot, check.rel);
    if (fs.existsSync(abs)) {
      const content = fs.readFileSync(abs, 'utf8');
      for (const s of SKILLS) {
        const expected = check.token(s);
        if (!content.includes(expected)) {
          errors.push(`${check.rel} is missing expected registration '${expected}' for skill '${s}'.`);
        }
      }
    }
  }

  return errors;
}

function discoverDynamicLocalTokens(rootDir = workspaceRoot) {
  const ignoreTokens = new Set([
    'okf-skills', 'knowledge-catalog', 'projects', 'documents', 'downloads',
    'desktop', 'pictures', 'videos', 'music', 'appdata', 'program', 'windows',
    'system', 'backup', 'archive', 'sandbox', 'courses', 'scripts', 'concepts',
    'source', 'sources', 'workspace', 'workspaces', 'packages', 'examples', 'recovery',
    'runner', 'ubuntu', 'admin', 'user', 'root', 'node', 'eloybar', 'github'
  ]);
  const tokens = new Set();

  try {
    const username = os.userInfo().username;
    if (username && username.length >= 4 && !ignoreTokens.has(username.toLowerCase())) {
      tokens.add(username);
    }
  } catch {}

  const parentDir = path.resolve(rootDir, '..');
  const grandParentDir = path.resolve(parentDir, '..');
  for (const dir of [parentDir, grandParentDir]) {
    try {
      for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
        if (
          d.isDirectory() &&
          d.name.length >= 6 &&
          !d.name.startsWith('$') &&
          !d.name.startsWith('.') &&
          !ignoreTokens.has(d.name.toLowerCase())
        ) {
          tokens.add(d.name);
        }
      }
    } catch {}
  }

  try {
    const homeDir = os.homedir();
    for (const d of fs.readdirSync(homeDir, { withFileTypes: true })) {
      if (
        d.isDirectory() &&
        d.name.startsWith('.claude-') &&
        d.name !== '.claude-work' &&
        d.name !== '.claude-enterprise'
      ) {
        tokens.add(d.name);
      }
    }
  } catch {}

  return [...tokens];
}

function verifyPublicRepoSanitization(options = {}) {
  const errors = [];
  const rootDir = options.rootDir || workspaceRoot;
  const dynamicTokens = options.dynamicTokens || discoverDynamicLocalTokens(rootDir);

  let filesToScan = [];
  if (Array.isArray(options.mockFiles)) {
    filesToScan = options.mockFiles;
  } else {
    try {
      const tracked = execSync('git ls-files', { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim()
        .split(/\r?\n/)
        .filter(Boolean);
      filesToScan = tracked
        .filter(rel => fs.existsSync(path.join(rootDir, rel)))
        .map(rel => ({ rel, content: fs.readFileSync(path.join(rootDir, rel), 'utf8') }));
    } catch {}
  }

  const escapedDynamic = dynamicTokens
    .filter(t => t && t.length >= 4)
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const dynamicRegex = escapedDynamic.length > 0 ? new RegExp(`\\b(${escapedDynamic.join('|')})\\b`, 'i') : null;
  const driveUriRegex = /file:\/\/\/[A-Za-z]:\//;
  const lanIpRegex = /\b192\.168\.\d{1,3}\.\d{1,3}\b/;
  const realUuidRegex = /\b(?!00000000-)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

  for (const fileObj of filesToScan) {
    const { rel, content } = fileObj;
    const isSelfOrParserTest = rel === 'scripts/sync-skills.js' || rel === 'scripts/test-parser.js';
    const lines = content.split(/\r?\n/);

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      if (dynamicRegex) {
        const m = line.match(dynamicRegex);
        if (m) {
          errors.push(`Unsanitized local project/user identifier '${m[0]}' found in ${rel}:${lineNum}. Use generic test fixtures instead.`);
        }
      }
      if (!isSelfOrParserTest) {
        if (driveUriRegex.test(line)) {
          errors.push(`Machine-specific drive URI (file:///<Drive>:/) found in ${rel}:${lineNum}. Use repo-relative paths or file:///workspace/... instead.`);
        }
        if (lanIpRegex.test(line)) {
          errors.push(`Private LAN IPv4 (192.168.x.x) found in ${rel}:${lineNum}. Use RFC 5737 documentation IP (e.g. 192.0.2.10) instead.`);
        }
        if (realUuidRegex.test(line)) {
          errors.push(`Non-synthetic UUID found in ${rel}:${lineNum}. Use a zero-prefixed synthetic UUID (e.g. 00000000-0000-4000-8000-000000000001) instead.`);
        }
      }
    });
  }

  const authorEmail = options.authorEmail !== undefined
    ? options.authorEmail
    : (() => {
        try {
          return execSync('git log -1 --format=%ae', { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        } catch {
          return '';
        }
      })();

  if (
    authorEmail &&
    !authorEmail.endsWith('@users.noreply.github.com') &&
    authorEmail !== 'noreply@github.com' &&
    authorEmail !== 'bot@test.com'
  ) {
    errors.push(`Latest git commit author email '${authorEmail}' is not a GitHub noreply address. Set 'git config user.email "<handle>@users.noreply.github.com"'.`);
  }

  return errors;
}

function copyRecursive(srcDir, destDir, driftItems) {
  if (!fs.existsSync(srcDir)) return;
  if (!isCheck) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath, driftItems);
    } else if (entry.isFile()) {
      const srcContent = fs.readFileSync(srcPath);
      const destExists = fs.existsSync(destPath);
      const destContent = destExists ? fs.readFileSync(destPath) : null;
      if (!destExists || !srcContent.equals(destContent)) {
        driftItems.push(path.relative(workspaceRoot, destPath).replace(/\\/g, '/'));
        if (!isCheck) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
  }
}

function main() {
  const driftItems = [];

  // 1. Sync index.html panels with live skill definitions & scripts
  const indexHtmlPath = path.join(workspaceRoot, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    const currentHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    const syncedHtml = buildSyncedIndexHtml(currentHtml);
    if (currentHtml !== syncedHtml) {
      driftItems.push('index.html');
      if (!isCheck) {
        fs.writeFileSync(indexHtmlPath, syncedHtml, 'utf8');
      }
    }
  }

  // 2. Sync README.md npx skills@latest update/remove lists
  const readmePath = path.join(workspaceRoot, 'README.md');
  if (fs.existsSync(readmePath)) {
    const currentReadme = fs.readFileSync(readmePath, 'utf8');
    const syncedReadme = buildSyncedReadmeMd(currentReadme);
    if (currentReadme !== syncedReadme) {
      driftItems.push('README.md');
      if (!isCheck) {
        fs.writeFileSync(readmePath, syncedReadme, 'utf8');
      }
    }
  }

  // 3. Sync .agents/skills/* and agent/skills/* mirrors if present
  const mirrorRoots = [
    path.join(workspaceRoot, '.agents', 'skills'),
    path.join(workspaceRoot, 'agent', 'skills')
  ];
  for (const mirrorDir of mirrorRoots) {
    if (fs.existsSync(mirrorDir)) {
      for (const skill of SKILLS) {
        copyRecursive(
          path.join(workspaceRoot, skill),
          path.join(mirrorDir, skill),
          driftItems
        );
      }
    }
  }

  // 4. Verify cross-repo documentation, installer catalog invariants, and public-repo sanitization
  const invariantErrors = [
    ...verifyCatalogInvariants(),
    ...verifyPublicRepoSanitization()
  ];
  if (invariantErrors.length > 0) {
    console.error(`OKF Skill Catalog & Sanitization Check Failed (${invariantErrors.length} error(s)):`);
    invariantErrors.forEach(err => console.error(`  ✗ ${err}`));
    process.exit(1);
  }

  if (isCheck) {
    if (driftItems.length > 0) {
      console.error(`OKF Skill Sync Check Failed: ${driftItems.length} item(s) out of sync:`);
      driftItems.forEach(item => console.error(`  - ${item}`));
      console.error('Run "npm run okf:sync" (or "node scripts/sync-skills.js") to synchronize.');
      process.exit(1);
    }
    console.log('✓ OKF Skill Sync Check Passed (index.html, README.md, installers, and skill mirrors are 100% synchronized).');
    return;
  }

  console.log(`✓ OKF Skill Sync Complete (${driftItems.length} file(s) updated; all catalog invariants verified).`);
}

if (require.main === module) {
  main();
}

module.exports = {
  SKILLS,
  PANEL_MAPPINGS,
  buildSyncedIndexHtml,
  buildSyncedReadmeMd,
  verifyCatalogInvariants,
  verifyPublicRepoSanitization
};
