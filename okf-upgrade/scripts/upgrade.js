const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

function splitRespectingQuotes(str, delimiter = ',') {
  const result = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      current += char;
    } else if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      current += char;
    } else if (char === delimiter && !inDouble && !inSingle) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fmText = match[1];
  
  function parseInlineValue(val) {
    val = val.trim();
    if (val.startsWith('{') && val.endsWith('}')) {
      const obj = {};
      const pairs = splitRespectingQuotes(val.slice(1, -1), ',');
      for (const pair of pairs) {
        const colonIdx = pair.indexOf(':');
        if (colonIdx === -1) continue;
        const k = pair.slice(0, colonIdx).trim();
        let v = pair.slice(colonIdx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        obj[k] = v;
      }
      return obj;
    }
    if (val.startsWith('[') && val.endsWith(']')) {
      return splitRespectingQuotes(val.slice(1, -1), ',').map(item => {
        item = item.trim();
        if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) {
          item = item.slice(1, -1);
        }
        return item;
      });
    }
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      return val.slice(1, -1);
    }
    return val;
  }

  const fm = {};
  const lines = fmText.split(/\r?\n/);
  let currentKey = null;
  let inArray = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const matchIndent = line.match(/^(\s*)/);
    const indent = matchIndent ? matchIndent[1].length : 0;
    const trimmed = line.trim();

    if (trimmed.startsWith('-')) {
      const rest = trimmed.slice(1).trim();
      if (!currentKey) continue;
      if (!Array.isArray(fm[currentKey])) {
        fm[currentKey] = [];
      }
      
      if (rest.startsWith('{') && rest.endsWith('}')) {
        fm[currentKey].push(parseInlineValue(rest));
      } else {
        const colonIdx = rest.indexOf(':');
        if (colonIdx !== -1 && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rest)) {
          const k = rest.slice(0, colonIdx).trim();
          const v = parseInlineValue(rest.slice(colonIdx + 1).trim());
          const obj = {};
          obj[k] = v;
          fm[currentKey].push(obj);
        } else {
          fm[currentKey].push(parseInlineValue(rest));
        }
      }
      inArray = true;
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const val = parseInlineValue(trimmed.slice(colonIdx + 1).trim());

    if (indent === 0) {
      currentKey = key;
      inArray = false;
      if (val === '') {
        fm[key] = {};
      } else {
        fm[key] = val;
      }
    } else {
      if (inArray && currentKey && Array.isArray(fm[currentKey])) {
        const lastItem = fm[currentKey][fm[currentKey].length - 1];
        if (lastItem && typeof lastItem === 'object') {
          lastItem[key] = val;
        }
      } else if (currentKey && fm[currentKey] && typeof fm[currentKey] === 'object') {
        fm[currentKey][key] = val;
      }
    }
  }
  return fm;
}

function serializeFrontmatter(fm) {
  let lines = ['---'];
  for (const [key, value] of Object.entries(fm)) {
    if (key === 'generated' && typeof value === 'object' && value !== null) {
      lines.push('generated:');
      lines.push(`  by: ${value.by || 'human:unknown'}`);
      lines.push(`  at: ${value.at || new Date().toISOString()}`);
    } else if (key === 'verified') {
      if (Array.isArray(value)) {
        lines.push('verified:');
        value.forEach(v => {
          lines.push(`  - by: ${v.by}`);
          lines.push(`    at: ${v.at}`);
        });
      } else if (typeof value === 'object' && value !== null) {
        lines.push('verified:');
        lines.push(`  by: ${value.by}`);
        lines.push(`  at: ${value.at}`);
      }
    } else if (key === 'sources' && Array.isArray(value)) {
      lines.push('sources:');
      value.forEach(src => {
        if (typeof src === 'string') {
          lines.push(`  - ${src}`);
        } else if (src && typeof src === 'object') {
          const orderedKeys = [];
          if (src.id !== undefined) orderedKeys.push(['id', src.id]);
          if (src.resource !== undefined) orderedKeys.push(['resource', src.resource]);
          if (src.title !== undefined) orderedKeys.push(['title', `"${String(src.title).replace(/"/g, '\\"')}"`]);
          if (src.author !== undefined) orderedKeys.push(['author', src.author]);
          if (src.usage_count !== undefined) orderedKeys.push(['usage_count', src.usage_count]);
          if (src.last_modified !== undefined) orderedKeys.push(['last_modified', src.last_modified]);
          for (const [k, v] of Object.entries(src)) {
            if (!['id', 'resource', 'title', 'author', 'usage_count', 'last_modified'].includes(k) && v !== undefined) {
              orderedKeys.push([k, v]);
            }
          }
          if (orderedKeys.length > 0) {
            lines.push(`  - ${orderedKeys[0][0]}: ${orderedKeys[0][1]}`);
            for (let i = 1; i < orderedKeys.length; i++) {
              lines.push(`    ${orderedKeys[i][0]}: ${orderedKeys[i][1]}`);
            }
          }
        }
      });
    } else if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
        lines.push(`${key}:`);
        value.forEach(item => {
          const entries = Object.entries(item);
          if (entries.length > 0) {
            const [firstK, firstV] = entries[0];
            lines.push(`  - ${firstK}: ${firstV}`);
            for (let idx = 1; idx < entries.length; idx++) {
              lines.push(`    ${entries[idx][0]}: ${entries[idx][1]}`);
            }
          }
        });
      } else {
        lines.push(`${key}: [${value.join(', ')}]`);
      }
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value)) {
        if (Array.isArray(v)) {
          lines.push(`  ${k}: [${v.join(', ')}]`);
        } else {
          lines.push(`  ${k}: ${v}`);
        }
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function findLogFiles(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file.toLowerCase() === 'archive') continue;
      findLogFiles(fullPath, list);
    } else if (stat.isFile() && file.toLowerCase() === 'log.md') {
      list.push(fullPath);
    }
  }
  return list;
}

function normalizeLogFile(logPath) {
  if (!fs.existsSync(logPath)) return false;
  const content = fs.readFileSync(logPath, 'utf8');
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  let modified = false;

  const headerLines = [];
  const dateSections = [];
  let currentDate = null;
  let currentItems = [];
  let inDateSections = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (/`agent:([^`\s]+)`/.test(line)) {
      line = line.replace(/`agent:([^`\s]+)`/g, '`$1`');
      modified = true;
    }

    const headingMatch = line.match(/^##\s*(\d{4}-\d{2}-\d{2})(?:T[0-9:Z\+\.\-]+)?(.*)$/);
    const bulletDateMatch = line.match(/^[\-\*]\s*(?:\*\*|\[)?(\d{4}-\d{2}-\d{2})(?:T[0-9:Z\+\.\-]+)?(?:\*\*|\])?\s*(?:—|--|-|:)\s*(.+)$/);

    if (headingMatch) {
      inDateSections = true;
      if (line !== `## ${headingMatch[1]}`) {
        modified = true;
      }
      if (currentDate) {
        dateSections.push({ date: currentDate, items: currentItems });
      }
      currentDate = headingMatch[1];
      currentItems = [];
    } else if (bulletDateMatch) {
      inDateSections = true;
      modified = true;
      const bDate = bulletDateMatch[1];
      const bBody = bulletDateMatch[2].trim();
      if (currentDate === bDate) {
        currentItems.push(`- ${bBody}`);
      } else {
        if (currentDate) {
          dateSections.push({ date: currentDate, items: currentItems });
        }
        currentDate = bDate;
        currentItems = [`- ${bBody}`];
      }
    } else if (inDateSections) {
      currentItems.push(line);
    } else {
      headerLines.push(line);
    }
  }
  if (currentDate) {
    dateSections.push({ date: currentDate, items: currentItems });
  }

  // Check if any consecutive sections share the same date
  const hasDuplicateConsecutiveDates = dateSections.some((sec, idx) => idx > 0 && sec.date === dateSections[idx - 1].date);
  if (!modified && !hasDuplicateConsecutiveDates) {
    return false;
  }

  // Merge consecutive sections with identical dates
  const mergedSections = [];
  for (const sec of dateSections) {
    const last = mergedSections[mergedSections.length - 1];
    const cleanSecItems = sec.items.join('\n').trim();
    if (last && last.date === sec.date) {
      if (cleanSecItems) {
        last.items = (last.items + '\n\n' + cleanSecItems).trim();
      }
      modified = true;
    } else {
      mergedSections.push({ date: sec.date, items: cleanSecItems });
    }
  }

  let out = headerLines.join('\n').trim() + '\n\n';
  for (let i = 0; i < mergedSections.length; i++) {
    const sec = mergedSections[i];
    out += `## ${sec.date}\n`;
    if (sec.items) {
      out += sec.items + '\n\n';
    } else {
      out += '\n';
    }
  }

  const finalOut = out.trimEnd() + '\n';
  fs.writeFileSync(logPath, eol === '\r\n' ? finalOut.replace(/\n/g, '\r\n') : finalOut, 'utf8');
  return true;
}

function walkConcepts(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file.toLowerCase() === 'archive') continue;
      walkConcepts(fullPath, list);
    } else if (stat.isFile() && file.endsWith('.md')) {
      const lower = file.toLowerCase();
      if (lower === 'log.md') continue;
      list.push(fullPath);
    }
  }
  return list;
}

function getConceptBody(content) {
  return content.replace(/^---[\s\S]*?---\r?\n/, '');
}

function autoFixBareLinks(body, bundleRoot, currentFilePath) {
  // Split body by code blocks (```...```) to avoid modifying code blocks
  const parts = body.split(/(```[\s\S]*?```)/g);
  let modified = false;

  for (let i = 0; i < parts.length; i++) {
    // If the part is a code block, skip it
    if (parts[i].startsWith('```')) {
      continue;
    }

    // Replace links in non-code parts
    parts[i] = parts[i].replace(/\[([^\]]*)\]\(([^)\s]+\.md)(#[A-Za-z0-9_\-]*)?\)/g, (match, label, target, hash) => {
      const cleanLabel = label.replace(/`/g, '').trim();
      const labelLower = cleanLabel.toLowerCase();
      const targetName = path.basename(target).toLowerCase();
      const isBare = !cleanLabel ||
                     labelLower === targetName ||
                     labelLower === target.toLowerCase() ||
                     labelLower.endsWith('.md') ||
                     labelLower.startsWith('/') ||
                     /^https?:\/\//i.test(cleanLabel);
      
      if (isBare) {
        let targetPath;
        if (target.startsWith('/')) {
          targetPath = path.join(bundleRoot, target.slice(1));
        } else {
          targetPath = path.join(path.dirname(currentFilePath), target);
        }

        if (fs.existsSync(targetPath)) {
          try {
            const targetContent = fs.readFileSync(targetPath, 'utf8');
            const targetFm = parseFrontmatter(targetContent);
            if (targetFm && targetFm.title) {
              modified = true;
              const cleanHash = hash || '';
              console.log(`[+] ${path.basename(currentFilePath)}: Auto-fixed bare link [${label}](${target}${cleanHash}) -> [${targetFm.title}](${target}${cleanHash})`);
              return `[${targetFm.title}](${target}${cleanHash})`;
            }
          } catch (e) {
            // Ignore errors reading target file
          }
        }
      }
      return match;
    });
  }

  return { newBody: parts.join(''), modified };
}

const OKF_SKILLS = [
  'okf',
  'okf-maintain',
  'okf-visualize',
  'okf-wayfinder',
  'okf-lint',
  'okf-query',
  'okf-upgrade',
  'okf-prune',
  'okf-learn'
];

const DEFAULT_SKILLS_REPO_URL = 'https://github.com/eloybar/okf-skills.git';

function hasAllOkfSkills(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return false;
  return OKF_SKILLS.every(s => fs.existsSync(path.join(dirPath, s, 'SKILL.md')));
}

function discoverPrefixedProfileSkillDirs(homeDir, prefix, defaultPath, envDir) {
  const dirs = [defaultPath];
  if (envDir) {
    const envSkills = path.join(envDir, 'skills');
    if (!dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(envSkills).toLowerCase())) {
      dirs.push(envSkills);
    }
  }
  if (fs.existsSync(homeDir)) {
    try {
      for (const entry of fs.readdirSync(homeDir, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith(prefix)) {
          const profSkills = path.join(homeDir, entry.name, 'skills');
          if (!dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(profSkills).toLowerCase())) {
            dirs.push(profSkills);
          }
        }
      }
    } catch (e) {}
  }
  return dirs;
}

function discoverAgentSkillDirs(homeDir, agentFilter = 'All') {
  const antigravityDir = path.join(homeDir, '.gemini', 'config', 'skills');
  const claudeDirs = discoverPrefixedProfileSkillDirs(
    homeDir,
    '.claude-',
    path.join(homeDir, '.claude', 'skills'),
    process.env.CLAUDE_CONFIG_DIR
  );
  const codexDirs = discoverPrefixedProfileSkillDirs(
    homeDir,
    '.codex-',
    path.join(homeDir, '.codex', 'skills'),
    process.env.CODEX_HOME
  );
  const universalDir = path.join(homeDir, '.agents', 'skills');

  const normAgent = (agentFilter || 'All').toLowerCase();
  let candidates = [];
  if (normAgent === 'antigravity' || normAgent === 'gemini') {
    candidates = [antigravityDir];
  } else if (normAgent === 'claude') {
    candidates = claudeDirs;
  } else if (normAgent === 'codex') {
    candidates = codexDirs;
  } else if (normAgent === 'universal' || normAgent === 'agents') {
    candidates = [universalDir];
  } else {
    candidates = [antigravityDir, ...claudeDirs, ...codexDirs, universalDir];
  }

  const seen = new Set();
  const unique = [];
  for (const dir of candidates) {
    const key = path.resolve(dir).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(dir);
    }
  }
  return unique;
}

function tryGitFastForward(repoDir) {
  if (!repoDir || !fs.existsSync(path.join(repoDir, '.git'))) return false;
  try {
    const dirty = execFileSync('git', ['status', '--porcelain'], {
      cwd: repoDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (dirty) return false;
    try {
      execFileSync('git', ['pull', '--ff-only'], {
        cwd: repoDir,
        stdio: ['ignore', 'pipe', 'ignore']
      });
    } catch {
      execFileSync('git', ['fetch', 'origin', 'main'], {
        cwd: repoDir,
        stdio: ['ignore', 'pipe', 'ignore']
      });
      execFileSync('git', ['reset', '--hard', 'origin/main'], {
        cwd: repoDir,
        stdio: ['ignore', 'pipe', 'ignore']
      });
    }
    return true;
  } catch (e) {
    return false;
  }
}

function copyDirContentsSync(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcEntry = path.join(srcDir, entry.name);
    const destEntry = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirContentsSync(srcEntry, destEntry);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcEntry, destEntry);
    }
  }
}

function upgradeInstalledSkills(options = {}) {
  const homeDir = options.homeDir || process.env.OKF_SKILLS_HOME || os.homedir();
  const agentFilter = options.agent || 'All';
  const explicitSource = options.source || process.env.OKF_SKILLS_SOURCE || null;

  let sourceDir = null;
  let tempCloneDir = null;

  try {
    if (explicitSource && fs.existsSync(explicitSource) && hasAllOkfSkills(explicitSource)) {
      sourceDir = path.resolve(explicitSource);
    } else {
      const homeCloneDir = path.join(homeDir, 'okf-skills');
      if (fs.existsSync(path.join(homeCloneDir, '.git'))) {
        console.log(`[i] Pulling latest OKF skills in ${homeCloneDir}...`);
        tryGitFastForward(homeCloneDir);
      }

      const scriptRepoRoot = path.resolve(__dirname, '..', '..');
      if (
        fs.existsSync(path.join(scriptRepoRoot, '.git')) &&
        hasAllOkfSkills(scriptRepoRoot) &&
        path.resolve(scriptRepoRoot).toLowerCase() !== path.resolve(homeCloneDir).toLowerCase()
      ) {
        tryGitFastForward(scriptRepoRoot);
      }

      if (hasAllOkfSkills(scriptRepoRoot) && fs.existsSync(path.join(scriptRepoRoot, '.git'))) {
        sourceDir = scriptRepoRoot;
      } else if (hasAllOkfSkills(homeCloneDir)) {
        sourceDir = homeCloneDir;
      } else {
        const repoUrl = explicitSource || DEFAULT_SKILLS_REPO_URL;
        tempCloneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-skills-update-'));
        console.log(`[i] Fetching latest OKF skills from ${repoUrl}...`);
        execFileSync('git', ['clone', '--depth', '1', repoUrl, tempCloneDir], {
          stdio: ['ignore', 'pipe', 'pipe']
        });
        sourceDir = tempCloneDir;
      }
    }

    const targetDirs = discoverAgentSkillDirs(homeDir, agentFilter);
    console.log(`==========================================`);
    console.log(`     OKF Skills Multi-Agent Updater       `);
    console.log(`==========================================`);
    console.log(`Source: ${sourceDir}`);

    for (const targetDir of targetDirs) {
      console.log(`Installing/Updating OKF skills in ${targetDir}...`);
      fs.mkdirSync(targetDir, { recursive: true });
      for (const skill of OKF_SKILLS) {
        const srcPath = path.join(sourceDir, skill);
        const destPath = path.join(targetDir, skill);
        let effectiveDest = destPath;
        try {
          const lstat = fs.lstatSync(destPath);
          if (lstat.isSymbolicLink()) {
            if (fs.existsSync(destPath) && fs.statSync(destPath).isDirectory()) {
              effectiveDest = fs.realpathSync(destPath);
            } else {
              fs.rmSync(destPath, { recursive: true, force: true });
            }
          }
        } catch (e) {}
        if (path.resolve(srcPath).toLowerCase() === path.resolve(effectiveDest).toLowerCase()) {
          continue;
        }
        copyDirContentsSync(srcPath, effectiveDest);
        console.log(`[+] Copied ${skill}`);
      }
    }

    console.log(`Operation complete!`);
    return { success: true, sourceDir, targetDirs };
  } finally {
    if (tempCloneDir && fs.existsSync(tempCloneDir)) {
      try {
        fs.rmSync(tempCloneDir, { recursive: true, force: true });
      } catch (e) {}
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const isSkillsUpdate = args.includes('--skills') || args.includes('--self');
  const isAllUpgrade = args.includes('--all');

  if (isSkillsUpdate || isAllUpgrade) {
    const homeIdx = args.indexOf('--home');
    const sourceIdx = args.indexOf('--source');
    const agentIdx = args.indexOf('--agent');
    upgradeInstalledSkills({
      homeDir: (homeIdx !== -1 && args[homeIdx + 1]) ? path.resolve(args[homeIdx + 1]) : undefined,
      source: (sourceIdx !== -1 && args[sourceIdx + 1]) ? args[sourceIdx + 1] : undefined,
      agent: (agentIdx !== -1 && args[agentIdx + 1]) ? args[agentIdx + 1] : 'All'
    });
    if (!isAllUpgrade && !args.includes('--bundle')) {
      return;
    }
  }

  let user = process.env.USER || process.env.USERNAME || 'unknown';
  const userIdx = args.indexOf('--user');
  if (userIdx !== -1 && args[userIdx + 1]) {
    user = args[userIdx + 1];
  }

  const cwd = process.cwd();
  const bundleIdx = args.indexOf('--bundle');
  let bundleRoot = (bundleIdx !== -1 && args[bundleIdx + 1])
    ? path.resolve(cwd, args[bundleIdx + 1])
    : path.join(cwd, 'docs', 'okf');
  if (!fs.existsSync(bundleRoot)) {
    bundleRoot = path.join(cwd, 'okf');
  }

  if (!fs.existsSync(bundleRoot)) {
    if (isAllUpgrade) {
      return;
    }
    console.error(`Error: OKF bundle root not found. (To update installed OKF skills across all agents, pass --skills)`);
    process.exit(1);
  }

  const parentDir = path.dirname(bundleRoot);
  const workspaceRoot = (bundleIdx !== -1 && args[bundleIdx + 1])
    ? (path.basename(parentDir).toLowerCase() === 'docs' ? path.dirname(parentDir) : parentDir)
    : cwd;

  console.log(`Starting OKF upgrade to Version 0.2 in: ${bundleRoot}`);
  console.log(`Target User Actor: human:${user}`);
  console.log(`----------------------------------------`);

  const mdFiles = walkConcepts(bundleRoot);
  let conceptsUpgraded = 0;
  let indexUpgraded = false;

  for (const mdPath of mdFiles) {
    const relativePath = path.relative(bundleRoot, mdPath).replace(/\\/g, '/');
    const content = fs.readFileSync(mdPath, 'utf8');
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const fm = parseFrontmatter(content);
    let body = getConceptBody(content);

    // Special Case: Root index.md (or index.md files)
    if (path.basename(mdPath).toLowerCase() === 'index.md') {
      const isRootIndex = path.resolve(mdPath) === path.resolve(path.join(bundleRoot, 'index.md'));
      if (isRootIndex) {
        const rootFm = fm || {};
        const extraKeys = Object.keys(rootFm).filter(k => k !== 'okf_version');
        if (rootFm.okf_version !== '0.2' || extraKeys.length > 0) {
          const cleanRootFm = { okf_version: '0.2' };
          const newFmText = serializeFrontmatter(cleanRootFm);
          const outText = newFmText + '\n\n' + body.trim() + '\n';
          fs.writeFileSync(mdPath, eol === '\r\n' ? outText.replace(/\r?\n/g, '\r\n') : outText, 'utf8');
          console.log(`[+] Upgraded root index.md with okf_version: "0.2" (§12)`);
          indexUpgraded = true;
        }
      }
      continue;
    }

    if (!fm) {
      console.warn(`[!] Skipping ${relativePath}: no frontmatter found.`);
      continue;
    }

    let modified = false;

    // 1. Upgrade timestamp -> generated
    if (fm.timestamp && !fm.generated) {
      fm.generated = {
        by: `human:${user}`,
        at: fm.timestamp
      };
      delete fm.timestamp;
      modified = true;
      console.log(`[+] ${relativePath}: Converted timestamp to generated.at`);
    }

    // 2. Upgrade body Citations -> frontmatter sources
    const citationsRegex = /(?:^|\r?\n)(#+\s*Citations\s*\r?\n)([\s\S]*?)(?=\r?\n#+|$)/i;
    const citationsMatch = body.match(citationsRegex);
    if (citationsMatch) {
      const citationsText = citationsMatch[2];
      const lines = citationsText.split(/\r?\n/);
      let sources = fm.sources || [];
      if (!Array.isArray(sources)) {
        sources = sources ? [sources] : [];
      }

      let sourceCount = sources.length;
      let matchedAnyCitations = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Match markdown link: - [Title](URL) or * [Title](URL)
        const linkMatch = trimmed.match(/^[\-\*]\s*\[([^\]]+)\]\(([^)]+)\)/);
        // Match raw URL/text: - URL or * URL
        const rawMatch = trimmed.match(/^[\-\*]\s*([^\s]+)/);

        if (linkMatch) {
          sourceCount++;
          sources.push({
            id: `src-${sourceCount}`,
            resource: linkMatch[2].trim(),
            title: linkMatch[1].trim()
          });
          matchedAnyCitations = true;
        } else if (rawMatch) {
          sourceCount++;
          sources.push({
            id: `src-${sourceCount}`,
            resource: rawMatch[1].trim(),
            title: undefined
          });
          matchedAnyCitations = true;
        }
      }

      if (matchedAnyCitations) {
        fm.sources = sources;
        // Strip the Citations section from the body
        body = body.replace(citationsRegex, '').trim();
        modified = true;
        console.log(`[+] ${relativePath}: Migrated citations list to frontmatter sources`);
      }
    }

    // 3. Auto-fix bare links in body
    const fixResult = autoFixBareLinks(body, bundleRoot, mdPath);
    if (fixResult.modified) {
      body = fixResult.newBody;
      modified = true;
    }

    // 4. Normalize actor convention: strip legacy 'agent:' prefix (§7)
    if (fm.generated && typeof fm.generated === 'object') {
      if (typeof fm.generated.by === 'string' && fm.generated.by.startsWith('agent:')) {
        fm.generated.by = fm.generated.by.slice(6);
        modified = true;
        console.log(`[+] ${relativePath}: Normalized generated.by actor format (${fm.generated.by})`);
      }
    }
    if (fm.verified) {
      if (Array.isArray(fm.verified)) {
        fm.verified.forEach(v => {
          if (v && typeof v.by === 'string' && v.by.startsWith('agent:')) {
            v.by = v.by.slice(6);
            modified = true;
            console.log(`[+] ${relativePath}: Normalized verified.by actor format (${v.by})`);
          }
        });
      } else if (typeof fm.verified === 'object' && fm.verified !== null) {
        if (typeof fm.verified.by === 'string' && fm.verified.by.startsWith('agent:')) {
          fm.verified.by = fm.verified.by.slice(6);
          modified = true;
          console.log(`[+] ${relativePath}: Normalized verified.by actor format (${fm.verified.by})`);
        }
      }
    }
    if (Array.isArray(fm.sources)) {
      fm.sources.forEach(src => {
        if (src && typeof src === 'object' && typeof src.author === 'string' && src.author.startsWith('agent:')) {
          src.author = src.author.slice(6);
          modified = true;
          console.log(`[+] ${relativePath}: Normalized sources[].author actor format (${src.author})`);
        }
      });
    }

    // 5. Split comma-separated local resource paths into resource + sources
    if (
      typeof fm.resource === 'string' &&
      fm.resource.includes(',') &&
      !/^(?!file:\/\/)[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(fm.resource.trim())
    ) {
      const rawRes = fm.resource.trim();
      const unsplitCandidate = path.join(workspaceRoot, rawRes.replace(/^file:\/\/\/?/, ''));
      const parts = rawRes.split(',').map(s => s.trim()).filter(Boolean);
      const existingParts = parts.filter(p => fs.existsSync(path.join(workspaceRoot, p.replace(/^file:\/\/\/?/, ''))));
      if (parts.length > 1 && !fs.existsSync(unsplitCandidate) && existingParts.length > 0) {
        fm.resource = existingParts[0];
        let sources = Array.isArray(fm.sources) ? fm.sources : (fm.sources ? [fm.sources] : []);
        const existingResources = new Set(
          sources.map(s => (typeof s === 'string' ? s : (s && s.resource))).filter(Boolean)
        );
        existingResources.add(fm.resource);
        for (const p of existingParts.slice(1)) {
          if (!existingResources.has(p)) {
            sources.push(p);
            existingResources.add(p);
          }
        }
        if (sources.length > 0 || fm.sources) {
          fm.sources = sources;
        }
        modified = true;
        console.log(`[+] ${relativePath}: Split comma-separated resource into resource + sources`);
      }
    }

    if (modified) {
      const newFmText = serializeFrontmatter(fm);
      const outText = newFmText + '\n\n' + body.trim() + '\n';
      fs.writeFileSync(mdPath, eol === '\r\n' ? outText.replace(/\r?\n/g, '\r\n') : outText, 'utf8');
      conceptsUpgraded++;
    }
  }

  // Normalize all log.md files to ISO 8601 YYYY-MM-DD headings (§9)
  const logFiles = findLogFiles(bundleRoot);
  let logsUpgraded = 0;
  for (const logPath of logFiles) {
    const relLog = path.relative(bundleRoot, logPath).replace(/\\/g, '/');
    if (normalizeLogFile(logPath)) {
      console.log(`[+] ${relLog}: Normalized date headings to YYYY-MM-DD`);
      logsUpgraded++;
    }
  }

  console.log(`----------------------------------------`);
  console.log(`Upgrade complete!`);
  console.log(`Concepts modified: ${conceptsUpgraded}`);
  console.log(`Logs normalized:   ${logsUpgraded}`);
  console.log(`Root index updated: ${indexUpgraded ? 'Yes' : 'No'}`);
  console.log(`----------------------------------------`);

  // Run lint check post-upgrade
  const siblingLinter = path.join(__dirname, '../../okf-lint/scripts/lint.js');
  const workspaceLinter = path.join(workspaceRoot, 'okf-lint', 'scripts', 'lint.js');
  const linterScript = fs.existsSync(siblingLinter) ? siblingLinter : workspaceLinter;
  if (fs.existsSync(linterScript)) {
    console.log(`Running lint verification post-upgrade...`);
    try {
      execFileSync(process.execPath, [linterScript, '--bundle', bundleRoot], { stdio: 'inherit' });
    } catch (e) {
      console.error(`Post-upgrade lint check failed. Please resolve errors manually.`);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseFrontmatter,
  serializeFrontmatter,
  discoverAgentSkillDirs,
  upgradeInstalledSkills
};
