const fs = require('fs');
const path = require('path');
const os = require('os');
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

function resolveResourceLocalPath(resourceUri, workspaceRoot, bundleRoot = null) {
  if (!resourceUri || typeof resourceUri !== 'string') return null;
  const trimmed = resourceUri.trim();
  if (/^(?!file:\/\/)[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(trimmed)) return null;
  if (!/^file:\/\//i.test(trimmed) && /\s/.test(trimmed) && !/[\/\\]/.test(trimmed)) return null;

  const isFileUri = /^file:\/\//i.test(trimmed);
  let localPath = trimmed.replace(/^file:\/\/\/?/, '');
  if (!isFileUri && trimmed.startsWith('/') && bundleRoot) {
    const bundleCandidate = path.normalize(path.join(bundleRoot, trimmed.slice(1)));
    if (fs.existsSync(bundleCandidate)) return bundleCandidate;
    const workspaceCandidate = path.normalize(path.join(workspaceRoot, trimmed.slice(1)));
    if (fs.existsSync(workspaceCandidate)) return workspaceCandidate;
  }
  if (path.isAbsolute(localPath)) {
    const absNorm = path.normalize(localPath);
    if (fs.existsSync(absNorm)) return absNorm;
    const stripped = localPath.replace(/^[\/\\]+/, '');
    const relCandidate = path.normalize(path.join(workspaceRoot, stripped));
    if (fs.existsSync(relCandidate)) return relCandidate;
    return absNorm;
  }
  if (bundleRoot) {
    const bundleRelCandidate = path.normalize(path.join(bundleRoot, localPath));
    if (fs.existsSync(bundleRelCandidate) && !fs.existsSync(path.join(workspaceRoot, localPath))) {
      return bundleRelCandidate;
    }
  }
  return path.normalize(path.join(workspaceRoot, localPath));
}

function getGitLastModifiedISO(filePath, cwd) {
  const cleanPath = filePath.replace(/\\/g, '/');
  const execCwd = cwd || path.dirname(filePath);
  let gitIso = null;
  try {
    const stdout = execFileSync('git', ['log', '-1', '--format=%aI', '--', cleanPath], {
      cwd: execCwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (stdout) gitIso = stdout;
  } catch (e) {
    // Ignore git log errors
  }

  try {
    const statusOut = execFileSync('git', ['status', '--porcelain', '--', cleanPath], {
      cwd: execCwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();

    if (statusOut && fs.existsSync(filePath)) {
      const mtimeIso = fs.statSync(filePath).mtime.toISOString();
      if (!gitIso || new Date(mtimeIso) > new Date(gitIso)) {
        return mtimeIso;
      }
    }
  } catch (e) {
    // Fallback if git status fails
  }

  return gitIso;
}

function loadGitignorePatterns(workspaceRoot) {
  const patterns = [];
  const gitignorePath = path.join(workspaceRoot, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        
        let escaped = line.replace(/[-\/\\^$*+?.()|[\]{}]/g, (match) => {
          if (match === '*' || match === '?') return match;
          return '\\' + match;
        });
        escaped = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
        if (line.endsWith('/')) {
          escaped = escaped + '?.*';
        } else {
          escaped = escaped + '$';
        }
        if (line.startsWith('/')) {
          escaped = '^' + escaped.slice(1);
        } else {
          escaped = '(^|/)' + escaped;
        }
        try {
          patterns.push(new RegExp(escaped));
        } catch (e) {}
      }
    } catch (e) {}
  }
  return patterns;
}

function scanWorkspaceFiles(dir, workspaceRoot, documentedResources, results = [], gitignorePatterns = null) {
  if (!fs.existsSync(dir)) return results;
  if (gitignorePatterns === null) {
    gitignorePatterns = loadGitignorePatterns(workspaceRoot);
  }
  const files = fs.readdirSync(dir);
  const ignores = ['.git', 'node_modules', '.agents', '.claude', 'agent', 'docs', 'tmp', 'temp', '.idea', '.vscode'];
  
  for (const file of files) {
    if (ignores.includes(file)) continue;
    const fullPath = path.join(dir, file);
    const relPath = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');
    
    let ignoredByGitignore = false;
    for (const regex of gitignorePatterns) {
      if (regex.test(relPath)) {
        ignoredByGitignore = true;
        break;
      }
    }
    if (ignoredByGitignore) continue;

    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch (e) {
      continue;
    }

    if (stat.isDirectory()) {
      if (fs.existsSync(path.join(fullPath, '.git'))) continue;
      scanWorkspaceFiles(fullPath, workspaceRoot, documentedResources, results, gitignorePatterns);
    } else if (stat.isFile()) {
      if (file !== 'skills-lock.json' && file !== '.gitignore' && file !== 'LICENSE') {
        // Normalize comparison path
        const normRel = relPath.toLowerCase();
        if (!documentedResources.has(normRel) && !documentedResources.has(path.resolve(fullPath).toLowerCase())) {
          results.push({ path: relPath, absolutePath: fullPath });
        }
      }
    }
  }
  return results;
}

function walkConceptFiles(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file.toLowerCase() === 'archive') continue;
      walkConceptFiles(fullPath, list);
    } else if (stat.isFile() && file.endsWith('.md')) {
      if (file !== 'index.md' && file !== 'log.md') {
        list.push(fullPath);
      }
    }
  }
  return list;
}

function updateConceptTimestamp(filePath, nowISO, actor) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return false;

  let fmText = fmMatch[1];
  let updatedFm = fmText;

  // Check if generated block exists
  if (/generated:\s*\r?\n/m.test(fmText)) {
    // Update at within generated
    if (/(\s+at:\s*)([^\r\n]+)/.test(fmText)) {
      updatedFm = updatedFm.replace(/(\s+at:\s*)([^\r\n]+)/, `$1${nowISO}`);
    } else {
      updatedFm = updatedFm.replace(/(generated:\s*\r?\n)/, `$1  at: ${nowISO}\n`);
    }
  } else if (/timestamp:\s*[^\r\n]+/m.test(fmText)) {
    // Update legacy timestamp
    updatedFm = updatedFm.replace(/timestamp:\s*[^\r\n]+/, `generated:\n  by: ${actor}\n  at: ${nowISO}`);
  } else {
    // Add generated block
    updatedFm = updatedFm.trimEnd() + `\ngenerated:\n  by: ${actor}\n  at: ${nowISO}\n`;
  }

  const newContent = content.replace(fmMatch[0], `---\n${updatedFm.trim()}\n---`);
  fs.writeFileSync(filePath, newContent, 'utf8');
  return true;
}

function updateIndexFrontier(indexPath, frontierList, documentedResources) {
  if (!fs.existsSync(indexPath)) return false;
  let content = fs.readFileSync(indexPath, 'utf8');

  // Find ## Not yet specified section
  const sectionIdx = content.indexOf('## Not yet specified');
  let beforeSection = content;
  let sectionContent = '';

  if (sectionIdx !== -1) {
    beforeSection = content.slice(0, sectionIdx);
    sectionContent = content.slice(sectionIdx);
  }

  // Parse existing frontier items: - `path` — description
  const existingMap = new Map();
  const lines = sectionContent.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^-\s+`([^`]+)`(?:\s*[—–-]\s*(.*))?/);
    if (match) {
      existingMap.set(match[1].replace(/\\/g, '/').toLowerCase(), {
        originalPath: match[1],
        desc: match[2] ? match[2].trim() : ''
      });
    }
  }

  let modified = false;

  // 1. Remove items that are now documented
  for (const [key, item] of existingMap.entries()) {
    if (documentedResources.has(key)) {
      existingMap.delete(key);
      modified = true;
    }
  }

  // 2. Add newly discovered frontier items
  for (const f of frontierList) {
    const norm = f.path.toLowerCase();
    if (!existingMap.has(norm) && !documentedResources.has(norm)) {
      existingMap.set(norm, {
        originalPath: f.path,
        desc: 'Undocumented codebase file.'
      });
      modified = true;
    }
  }

  if (!modified && sectionIdx !== -1) return false;

  // Rebuild ## Not yet specified
  const sortedItems = Array.from(existingMap.values()).sort((a, b) => a.originalPath.localeCompare(b.originalPath));
  let newSection = '## Not yet specified\n';
  for (const item of sortedItems) {
    newSection += `- \`${item.originalPath}\`${item.desc ? ' — ' + item.desc : ''}\n`;
  }

  const finalContent = beforeSection.trimEnd() + '\n\n' + newSection;
  fs.writeFileSync(indexPath, finalContent, 'utf8');
  return true;
}

function appendLogEntry(logPath, entries, dateStr) {
  if (!fs.existsSync(logPath)) return false;
  const content = fs.readFileSync(logPath, 'utf8');
  const dateHeading = `## ${dateStr}`;

  let newEntriesText = entries.map(e => `- ${e}`).join('\n');

  if (content.includes(dateHeading)) {
    // Append under existing date heading
    const parts = content.split(dateHeading);
    const newContent = parts[0] + dateHeading + '\n' + newEntriesText + '\n' + parts[1].replace(/^\r?\n/, '');
    fs.writeFileSync(logPath, newContent, 'utf8');
    return true;
  }

  // Insert before the first date heading or at end
  const firstHeadingMatch = content.match(/\n(## \d{4}-\d{2}-\d{2})/);
  if (firstHeadingMatch) {
    const idx = firstHeadingMatch.index;
    const newContent = content.slice(0, idx) + `\n\n${dateHeading}\n${newEntriesText}\n` + content.slice(idx);
    fs.writeFileSync(logPath, newContent, 'utf8');
    return true;
  }

  fs.writeFileSync(logPath, content.trimEnd() + `\n\n${dateHeading}\n${newEntriesText}\n`, 'utf8');
  return true;
}

const TARGET_STEERING_VERSION = '1.8.2';

function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

// Path prefix for invoking the OKF skill scripts, as seen from the workspace root:
// workspace-relative when the skills live inside the repo, `~/`-relative when under
// the user's home directory, absolute otherwise. Always ends with '/' (or is '').
function resolveSkillsBase(workspaceRoot) {
  if (
    workspaceRoot &&
    fs.existsSync(path.join(workspaceRoot, 'okf-query', 'scripts', 'query.js')) &&
    fs.existsSync(path.join(workspaceRoot, 'okf-maintain', 'scripts', 'maintain.js'))
  ) {
    return '';
  }
  const skillsRoot = path.resolve(__dirname, '..', '..');
  const isInside = (rel) => rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  const relWs = path.relative(workspaceRoot, skillsRoot);
  if (relWs === '') return '';
  if (isInside(relWs) && !relWs.startsWith('.')) return relWs.replace(/\\/g, '/') + '/';
  const relHome = path.relative(os.homedir(), skillsRoot);
  if (isInside(relHome)) return '~/' + relHome.replace(/\\/g, '/') + '/';
  if (isInside(relWs)) return relWs.replace(/\\/g, '/') + '/';
  return skillsRoot.replace(/\\/g, '/') + '/';
}

function buildSteeringDirectivesBlock(bundleRelPath, targetVersion, skillsBase = '') {
  const b = bundleRelPath;
  const s = skillsBase;
  return `## 📂 Knowledge Bundle / OKF
Architecture, contracts and procedures for this repository are documented in the OKF bundle at \`${b}/\` (start at \`${b}/index.md\`). Run OKF tools from the repo root. If nested bundles exist, use the closest parent \`okf/\` of the file you are working on. At session start, run \`node ${s}okf-lint/scripts/lint.js --drift\`; if it reports drift, run \`node ${s}okf-maintain/scripts/maintain.js\`.

## ⚡ Pre-Work Grounding Gate (MANDATORY)
Before answering questions about the system, planning, or editing:
1. **Search:** \`node ${s}okf-query/scripts/query.js --search <keywords>\` (or read \`${b}/index.md\`).
2. **Per-file context:** \`node ${s}okf-query/scripts/query.js --file <path>\` before analyzing or editing a file; if nothing matches, search by module name.
3. **Cite** the concept(s) you used, or state "OKF Check: no matching concept for <topic>".
4. **Model-Tier Routing:** use the model's **High** setting for bootstrapping, architecture discovery and planning; switch to **Medium** once the plan is approved, for implementation and upkeep.

## ⚡ Pre-Completion Verification Gate (MANDATORY)
Before reporting work complete after changing code:
1. **Semantic Concept & Source Binding Upkeep:** update affected concepts, or create one, when you change a schema, component, API, configuration or build/deploy step, or learn a durable constraint or pattern. Bind new or changed source files in the concept's \`resource:\`/\`sources:\` frontmatter, and add a dated line to \`${b}/log.md\`.
2. **Maintain:** \`node ${s}okf-maintain/scripts/maintain.js\` (refreshes timestamps, the \`## Not yet specified\` frontier, \`log.md\` and \`viz.html\`).
3. **Lint:** \`node ${s}okf-lint/scripts/lint.js --drift\`. It must report 0 errors and 0 warnings.

<!-- okf-steering-version: ${targetVersion} -->`;
}

function inspectAndSyncSteeringFile(filePath, workspaceRoot, bundleRoot, targetVersion, dryRun = false) {
  if (!fs.existsSync(filePath)) return { exists: false, outdated: false, updated: false };
  let content = fs.readFileSync(filePath, 'utf8');

  // Check if file is related to OKF
  const isOkfRelated = content.includes('Knowledge Bundle') ||
                       content.includes('okf-maintain') ||
                       content.includes('okf-steering-version') ||
                       content.includes('Open Knowledge Format');
  if (!isOkfRelated) return { exists: true, outdated: false, updated: false };

  const versionMatch = content.match(/<!-- okf-steering-version:\s*([0-9.]+)\s*-->/);
  let isOutdated = false;
  if (versionMatch) {
    const v = versionMatch[1].trim();
    if (compareVersions(v, targetVersion) < 0) {
      isOutdated = true;
    }
  } else {
    isOutdated = true;
  }

  if (!content.includes('Pre-Completion Verification Gate') ||
      !content.includes('Pre-Work Grounding Gate') ||
      !content.includes('Model-Tier Routing')) {
    isOutdated = true;
  }

  if (!isOutdated) {
    return { exists: true, outdated: false, updated: false };
  }

  if (dryRun) {
    return { exists: true, outdated: true, updated: false };
  }

  const bundleRel = path.relative(workspaceRoot, bundleRoot).replace(/\\/g, '/') || '.';
  const newBlock = buildSteeringDirectivesBlock(bundleRel, targetVersion, resolveSkillsBase(workspaceRoot));

  let newContent = content;
  const startRegex = /(## (?:⚡ )?Pre-Work Grounding Gate[\s\S]*?|## (?:⚡ )?Pre-Completion Verification Gate[\s\S]*?|## (?:📂 )?Knowledge Bundle \/ OKF[\s\S]*?)(?:<!-- okf-steering-version:\s*[0-9.]+\s*-->)/;

  if (startRegex.test(content)) {
    newContent = content.replace(startRegex, newBlock);
  } else if (content.includes('<!-- okf-steering-version:')) {
    newContent = content.replace(/(?:## (?:📂 )?Knowledge Bundle[\s\S]*?)?<!-- okf-steering-version:\s*[0-9.]+\s*-->/, newBlock);
  } else if (content.includes('## Knowledge Bundle / OKF')) {
    const idx = content.indexOf('## Knowledge Bundle / OKF');
    newContent = content.slice(0, idx).trimEnd() + '\n\n' + newBlock + '\n';
  } else {
    newContent = content.trimEnd() + '\n\n' + newBlock + '\n';
  }

  fs.writeFileSync(filePath, newContent, 'utf8');
  return { exists: true, outdated: true, updated: true };
}

async function main() {
  const args = process.argv.slice(2);
  const isCheckMode = args.includes('--check');
  const isJson = args.includes('--json');
  const withViz = args.includes('--viz');
  
  let bundleArg = null;
  const bundleIdx = args.indexOf('--bundle');
  if (bundleIdx !== -1 && args[bundleIdx + 1]) {
    bundleArg = args[bundleIdx + 1];
  }

  let actor = 'process:okf-maintain';
  const actorIdx = args.indexOf('--actor');
  if (actorIdx !== -1 && args[actorIdx + 1]) {
    actor = args[actorIdx + 1];
  }

  const workspaceRoot = process.cwd();
  let bundleRoot = bundleArg ? path.resolve(workspaceRoot, bundleArg) : path.join(workspaceRoot, 'docs', 'okf');
  if (!fs.existsSync(bundleRoot)) {
    bundleRoot = path.join(workspaceRoot, 'okf');
  }

  if (!fs.existsSync(bundleRoot)) {
    const err = `Error: OKF bundle not found at docs/okf or okf. Path checked: ${bundleRoot}`;
    if (isJson) {
      console.log(JSON.stringify({ success: false, error: err }));
    } else {
      console.error(err);
    }
    process.exit(1);
  }

  // Auto-sync index.html and skill mirrors when running inside the okf-skills repository
  const repoSyncScript = path.join(workspaceRoot, 'scripts', 'sync-skills.js');
  if (!isCheckMode && fs.existsSync(repoSyncScript) && fs.existsSync(path.join(workspaceRoot, 'index.html'))) {
    try {
      execFileSync(process.execPath, [repoSyncScript], { cwd: workspaceRoot, stdio: 'ignore' });
    } catch (e) {}
  }

  const conceptFiles = walkConceptFiles(bundleRoot);
  const documentedResources = new Set();
  const driftedConcepts = [];
  const staleConcepts = [];

  // 1. Analyze concepts for drift and documented resources
  for (const cFile of conceptFiles) {
    const content = fs.readFileSync(cFile, 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm) continue;

    const relConcept = path.relative(bundleRoot, cFile).replace(/\\/g, '/');

    // Track stale_after
    if (fm.stale_after) {
      const sDate = new Date(fm.stale_after);
      if (!isNaN(sDate.getTime()) && Date.now() >= sDate.getTime()) {
        staleConcepts.push({ file: relConcept, staleAfter: fm.stale_after });
      }
    }

    const resourcesToCheck = [];
    if (fm.resource) {
      const local = resolveResourceLocalPath(fm.resource, workspaceRoot);
      if (local) {
        documentedResources.add(path.relative(workspaceRoot, local).replace(/\\/g, '/').toLowerCase());
        documentedResources.add(path.resolve(local).toLowerCase());
        resourcesToCheck.push({ path: local, label: path.basename(local) });
      }
    }
    if (Array.isArray(fm.sources)) {
      fm.sources.forEach(src => {
        const rawResource = typeof src === 'string' ? src : (src && src.resource);
        if (rawResource && !/^https?:\/\//i.test(rawResource)) {
          const local = resolveResourceLocalPath(rawResource, workspaceRoot);
          if (local) {
            documentedResources.add(path.relative(workspaceRoot, local).replace(/\\/g, '/').toLowerCase());
            documentedResources.add(path.resolve(local).toLowerCase());
            const label = (src && typeof src === 'object' && src.title) ? src.title : path.basename(local);
            resourcesToCheck.push({ path: local, label });
          }
        }
      });
    }
    if (fm.computation) {
      const local = resolveResourceLocalPath(fm.computation, workspaceRoot, bundleRoot);
      if (local) {
        documentedResources.add(path.relative(workspaceRoot, local).replace(/\\/g, '/').toLowerCase());
        documentedResources.add(path.resolve(local).toLowerCase());
        resourcesToCheck.push({ path: local, label: path.basename(local) });
      }
    }
    if (fm.executor && fm.executor.resource) {
      const local = resolveResourceLocalPath(fm.executor.resource, workspaceRoot, bundleRoot);
      if (local) {
        documentedResources.add(path.relative(workspaceRoot, local).replace(/\\/g, '/').toLowerCase());
        documentedResources.add(path.resolve(local).toLowerCase());
        resourcesToCheck.push({ path: local, label: path.basename(local) });
      }
    }
    if (fm.attester && fm.attester.resource) {
      const local = resolveResourceLocalPath(fm.attester.resource, workspaceRoot, bundleRoot);
      if (local) {
        documentedResources.add(path.relative(workspaceRoot, local).replace(/\\/g, '/').toLowerCase());
        documentedResources.add(path.resolve(local).toLowerCase());
        resourcesToCheck.push({ path: local, label: path.basename(local) });
      }
    }

    const lastModified = fm.timestamp || (fm.generated && fm.generated.at);
    if (lastModified) {
      const conceptTime = new Date(lastModified);
      for (const res of resourcesToCheck) {
        if (fs.existsSync(res.path)) {
          const gitTimeStr = getGitLastModifiedISO(res.path, workspaceRoot);
          if (gitTimeStr) {
            const gitTime = new Date(gitTimeStr);
            if (gitTime > conceptTime) {
              driftedConcepts.push({
                file: relConcept,
                fullPath: cFile,
                resource: res.label,
                gitTime: gitTime.toISOString(),
                conceptTime: conceptTime.toISOString()
              });
              break;
            }
          }
        }
      }
    }
  }

  // 2. Scan workspace for undocumented frontier files
  const frontierList = scanWorkspaceFiles(workspaceRoot, workspaceRoot, documentedResources);

  // Check if index.md has unlisted frontier files
  const indexPath = path.join(bundleRoot, 'index.md');
  const missingFrontierInIndex = [];
  if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, 'utf8').toLowerCase();
    for (const f of frontierList) {
      if (!indexContent.includes(f.path.toLowerCase())) {
        missingFrontierInIndex.push(f.path);
      }
    }
  }

  // 3. Inspect steering notice files across all supported agents
  const steeringFilesToCheck = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', '.windsurfrules', '.clinerules', 'GEMINI.md'];
  const outdatedSteeringFiles = [];
  for (const sName of steeringFilesToCheck) {
    const sPath = path.join(workspaceRoot, sName);
    const res = inspectAndSyncSteeringFile(sPath, workspaceRoot, bundleRoot, TARGET_STEERING_VERSION, true);
    if (res.outdated) {
      outdatedSteeringFiles.push(sName);
    }
  }

  if (isCheckMode) {
    const clean = driftedConcepts.length === 0 && missingFrontierInIndex.length === 0 && outdatedSteeringFiles.length === 0;
    if (isJson) {
      console.log(JSON.stringify({
        success: clean,
        bundleRoot,
        drifted: driftedConcepts,
        stale: staleConcepts,
        unindexedFrontier: missingFrontierInIndex,
        outdatedSteering: outdatedSteeringFiles
      }, null, 2));
    } else {
      console.log(`OKF Maintenance Audit: ${bundleRoot}`);
      console.log(`----------------------------------------`);
      console.log(`Concepts checked:    ${conceptFiles.length}`);
      console.log(`Drifted concepts:    ${driftedConcepts.length}`);
      console.log(`Stale concepts:      ${staleConcepts.length}`);
      console.log(`Unindexed frontier:  ${missingFrontierInIndex.length}`);
      console.log(`Outdated steering:   ${outdatedSteeringFiles.length}`);
      console.log(`----------------------------------------`);
      if (driftedConcepts.length > 0) {
        console.log(`Drifted concepts:`);
        driftedConcepts.forEach(d => console.log(`  - ${d.file} (resource ${d.resource} updated on ${d.gitTime})`));
      }
      if (missingFrontierInIndex.length > 0) {
        console.log(`Unindexed frontier files:`);
        missingFrontierInIndex.forEach(f => console.log(`  - ${f}`));
      }
      if (outdatedSteeringFiles.length > 0) {
        console.log(`Outdated steering files:`);
        outdatedSteeringFiles.forEach(s => console.log(`  - ${s} (outdated or missing Pre-Work / Pre-Completion Gate; run okf-maintain to sync)`));
      }
    }
    process.exit(clean ? 0 : 1);
  }

  // 3. Execution / Sync Mode
  const logEntries = [];
  const updatedFiles = [];

  // 3a. Auto-sync steering notice files first so any concept binding AGENTS.md gets a newer timestamp
  const updatedSteering = [];
  for (const sName of steeringFilesToCheck) {
    const sPath = path.join(workspaceRoot, sName);
    const res = inspectAndSyncSteeringFile(sPath, workspaceRoot, bundleRoot, TARGET_STEERING_VERSION, false);
    if (res.updated) {
      updatedSteering.push(sName);
    }
  }
  if (updatedSteering.length > 0) {
    logEntries.push(`Synchronized steering notice in \`${updatedSteering.join(', ')}\` to v${TARGET_STEERING_VERSION}.`);
  }

  const nowISO = new Date().toISOString();
  const dateStr = nowISO.slice(0, 10);

  // 3b. Update timestamps for drifted concepts
  for (const drift of driftedConcepts) {
    const ok = updateConceptTimestamp(drift.fullPath, nowISO, actor);
    if (ok) {
      updatedFiles.push(drift.file);
    }
  }
  if (updatedFiles.length > 0) {
    logEntries.push(`Synchronized timestamp for ${updatedFiles.length} drifted concept(s): ${updatedFiles.join(', ')}.`);
  }

  // 3c. Update index.md frontier
  let indexUpdated = false;
  if (fs.existsSync(indexPath)) {
    indexUpdated = updateIndexFrontier(indexPath, frontierList, documentedResources);
    if (indexUpdated) {
      logEntries.push(`Synchronized workspace frontier mapping in \`index.md\` (${frontierList.length} undocumented files mapped).`);
    }
  }

  // 3d. Record in log.md
  const logPath = path.join(bundleRoot, 'log.md');
  let logUpdated = false;
  if (logEntries.length > 0 && fs.existsSync(logPath)) {
    logUpdated = appendLogEntry(logPath, logEntries, dateStr);
  }

  // 3e. Regenerate visualizer only when explicitly requested via --viz
  let vizGenerated = false;
  const siblingVizScript = path.resolve(__dirname, '..', '..', 'okf-visualize', 'scripts', 'visualize.js');
  const workspaceVizScript = path.join(workspaceRoot, 'okf-visualize', 'scripts', 'visualize.js');
  const vizScript = fs.existsSync(siblingVizScript) ? siblingVizScript : workspaceVizScript;
  if (withViz && fs.existsSync(vizScript)) {
    try {
      execFileSync(process.execPath, [vizScript, '--bundle', bundleRoot, '--no-open'], {
        cwd: workspaceRoot,
        stdio: 'ignore'
      });
      vizGenerated = true;
    } catch (e) {}
  }

  // 3f. Verify with okf-lint if available (check sibling skill dir first, then workspaceRoot)
  let lintPassed = true;
  const siblingLintScript = path.resolve(__dirname, '..', '..', 'okf-lint', 'scripts', 'lint.js');
  const workspaceLintScript = path.join(workspaceRoot, 'okf-lint', 'scripts', 'lint.js');
  const lintScript = fs.existsSync(siblingLintScript) ? siblingLintScript : workspaceLintScript;
  if (fs.existsSync(lintScript)) {
    try {
      execFileSync(process.execPath, [lintScript, '--bundle', bundleRoot, '--drift'], {
        cwd: workspaceRoot,
        stdio: 'ignore'
      });
      lintPassed = true;
    } catch (e) {
      lintPassed = false;
    }
  }

  if (isJson) {
    console.log(JSON.stringify({
      success: true,
      bundleRoot,
      updatedConcepts: updatedFiles,
      indexFrontierUpdated: indexUpdated,
      steeringUpdated: updatedSteering,
      logUpdated,
      vizGenerated,
      lintPassed
    }, null, 2));
  } else {
    console.log(`OKF Maintenance Sync Complete 🎉`);
    console.log(`----------------------------------------`);
    console.log(`Concepts synchronized: ${updatedFiles.length}`);
    console.log(`Frontier updated:       ${indexUpdated ? 'Yes' : 'Up to date'}`);
    console.log(`Steering updated:       ${updatedSteering.length > 0 ? updatedSteering.join(', ') : 'Up to date'}`);
    console.log(`Log recorded:           ${logUpdated ? 'Yes' : 'Up to date'}`);
    if (withViz) console.log(`Visualization updated:  ${vizGenerated ? 'Yes' : 'N/A'}`);
    console.log(`Lint verification:      ${lintPassed ? 'Passed' : 'Failed'}`);
    console.log(`----------------------------------------`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseFrontmatter,
  inspectAndSyncSteeringFile,
  buildSteeringDirectivesBlock,
  resolveSkillsBase
};
