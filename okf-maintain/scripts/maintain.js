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
  if (/^(?!file:)[a-zA-Z][a-zA-Z0-9+.-]+:/i.test(trimmed)) return null;
  if (!/^file:\/\//i.test(trimmed) && /\s/.test(trimmed) && !/[\/\\]/.test(trimmed)) return null;

  const isFileUri = /^file:\/\//i.test(trimmed);
  let localPath = trimmed.replace(/^file:\/\/\/?/, '').replace(/[?#].*$/, '');
  if (/%[0-9A-Fa-f]{2}/.test(localPath)) {
    try {
      localPath = decodeURIComponent(localPath);
    } catch (e) {}
  }
  if (!isFileUri && localPath.startsWith('/') && bundleRoot) {
    const bundleCandidate = path.normalize(path.join(bundleRoot, localPath.slice(1)));
    if (fs.existsSync(bundleCandidate)) return bundleCandidate;
    const workspaceCandidate = path.normalize(path.join(workspaceRoot, localPath.slice(1)));
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

function isReservedBundleFile(filePath, bundleRoot) {
  if (!filePath || !bundleRoot) return false;
  const absFile = path.resolve(filePath).toLowerCase();
  const absBundle = path.resolve(bundleRoot).toLowerCase();
  if (!absFile.startsWith(absBundle + path.sep)) return false;
  const base = path.basename(absFile);
  return base === 'log.md' || base === 'index.md' || base === 'viz.html';
}

const gitModifiedCache = new Map();
const gitDirtySetByCwd = new Map();
const gitTopLevelByCwd = new Map();
const gitRepoCommitMapByTop = new Map();
const gitCommitOnlyCache = new Map();

function getGitTopLevel(execCwd) {
  const normCwd = path.resolve(execCwd).toLowerCase();
  if (gitTopLevelByCwd.has(normCwd)) {
    return gitTopLevelByCwd.get(normCwd);
  }
  let topLevel = null;
  try {
    topLevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: execCwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (e) {
    topLevel = null;
  }
  gitTopLevelByCwd.set(normCwd, topLevel);
  return topLevel;
}

function getRepoCommitTimeMap(execCwd, forceRefresh = false) {
  const topLevel = getGitTopLevel(execCwd);
  if (!topLevel) return new Map();
  const topKey = path.resolve(topLevel).toLowerCase();
  if (!forceRefresh && gitRepoCommitMapByTop.has(topKey)) {
    return gitRepoCommitMapByTop.get(topKey);
  }
  const commitMap = new Map();
  try {
    const out = execFileSync(
      'git',
      ['-c', 'core.quotepath=false', 'log', '-m', '--format=__OKF_COMMIT__%aI', '--name-only'],
      {
        cwd: topLevel,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 64 * 1024 * 1024
      }
    );
    let currentIso = null;
    for (const rawLine of out.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('__OKF_COMMIT__')) {
        currentIso = line.slice('__OKF_COMMIT__'.length).trim();
      } else if (currentIso) {
        const cleaned = line.replace(/^"|"$/g, '');
        const absPath = path.resolve(topLevel, cleaned).toLowerCase();
        if (!commitMap.has(absPath)) {
          commitMap.set(absPath, currentIso);
        }
      }
    }
  } catch (e) {
    // Ignore git log errors
  }
  gitRepoCommitMapByTop.set(topKey, commitMap);
  return commitMap;
}

function getRepoDirtySet(execCwd) {
  const normCwd = path.resolve(execCwd).toLowerCase();
  if (gitDirtySetByCwd.has(normCwd)) {
    return gitDirtySetByCwd.get(normCwd);
  }
  const dirtySet = new Set();
  try {
    const topLevel = getGitTopLevel(execCwd);
    if (!topLevel) {
      gitDirtySetByCwd.set(normCwd, dirtySet);
      return dirtySet;
    }
    const statusOut = execFileSync('git', ['-c', 'core.quotepath=false', 'status', '--porcelain', '-uall'], {
      cwd: topLevel,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    for (const line of statusOut.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const m = line.match(/^\s*[MADRCU?!]{1,2}\s+(.*)$/);
      if (!m) continue;
      let rawPath = m[1].trim();
      if (rawPath.includes(' -> ')) rawPath = rawPath.split(' -> ').pop().trim();
      rawPath = rawPath.replace(/^"|"$/g, '');
      dirtySet.add(path.resolve(topLevel, rawPath).toLowerCase());
    }
  } catch (e) {
    // Ignore git status errors
  }
  gitDirtySetByCwd.set(normCwd, dirtySet);
  return dirtySet;
}

function getGitCommitISO(filePath, cwd) {
  const absFile = path.resolve(filePath);
  const cacheKey = absFile.toLowerCase();
  if (gitCommitOnlyCache.has(cacheKey)) {
    return gitCommitOnlyCache.get(cacheKey);
  }
  const execCwd = cwd || path.dirname(absFile);
  const commitMap = getRepoCommitTimeMap(execCwd);
  let gitIso = commitMap.get(cacheKey) || null;
  if (!gitIso && fs.existsSync(absFile)) {
    try {
      const stat = fs.statSync(absFile);
      if (stat.isDirectory()) {
        const prefix = cacheKey.endsWith(path.sep) ? cacheKey : cacheKey + path.sep;
        for (const [trackedPath, iso] of commitMap.entries()) {
          if (trackedPath.startsWith(prefix)) {
            if (!gitIso || new Date(iso) > new Date(gitIso)) {
              gitIso = iso;
            }
          }
        }
      }
    } catch (e) {}
  }
  gitCommitOnlyCache.set(cacheKey, gitIso);
  return gitIso;
}

function getGitLastModifiedISO(filePath, cwd) {
  const absFile = path.resolve(filePath);
  const cacheKey = absFile.toLowerCase();
  if (gitModifiedCache.has(cacheKey)) {
    return gitModifiedCache.get(cacheKey);
  }

  const execCwd = cwd || path.dirname(absFile);
  let gitIso = getGitCommitISO(absFile, execCwd);

  try {
    const dirtySet = getRepoDirtySet(execCwd);
    const stat = fs.existsSync(absFile) ? fs.statSync(absFile) : null;
    if (stat) {
      let latestDirtyMtime = null;
      if (stat.isDirectory()) {
        const prefix = cacheKey.endsWith(path.sep) ? cacheKey : cacheKey + path.sep;
        for (const dirtyPath of dirtySet) {
          if (dirtyPath.startsWith(prefix) && fs.existsSync(dirtyPath)) {
            const mtime = fs.statSync(dirtyPath).mtime;
            if (!latestDirtyMtime || mtime > latestDirtyMtime) {
              latestDirtyMtime = mtime;
            }
          }
        }
      } else if (dirtySet.has(cacheKey)) {
        latestDirtyMtime = stat.mtime;
      }
      if (latestDirtyMtime) {
        const mtimeIso = latestDirtyMtime.toISOString();
        if (!gitIso || new Date(mtimeIso) > new Date(gitIso)) {
          gitModifiedCache.set(cacheKey, mtimeIso);
          return mtimeIso;
        }
      }
    }
  } catch (e) {
    // Fallback if git status fails
  }

  gitModifiedCache.set(cacheKey, gitIso);
  return gitIso;
}

function getEffectiveConceptTime(conceptFilePath, rawLastModified, workspaceRoot) {
  if (!rawLastModified) return null;
  const fmDate = new Date(rawLastModified);
  if (isNaN(fmDate.getTime())) return null;

  const absConcept = path.resolve(conceptFilePath);
  const dirtySet = getRepoDirtySet(workspaceRoot || path.dirname(absConcept));
  if (!dirtySet.has(absConcept.toLowerCase())) {
    const commitIso = getGitCommitISO(absConcept, workspaceRoot);
    if (commitIso) {
      const commitDate = new Date(commitIso);
      if (!isNaN(commitDate.getTime()) && commitDate > fmDate) {
        return commitDate;
      }
    }
  }
  return fmDate;
}

function resolveWorkspaceAndBundle(args) {
  const cwd = process.cwd();
  const bundleIdx = args.indexOf('--bundle');
  if (bundleIdx !== -1 && args[bundleIdx + 1]) {
    const bundleRoot = path.resolve(cwd, args[bundleIdx + 1]);
    if (fs.existsSync(bundleRoot)) {
      const parentDir = path.dirname(bundleRoot);
      const derivedRoot = path.basename(parentDir).toLowerCase() === 'docs'
        ? path.dirname(parentDir)
        : parentDir;
      return { workspaceRoot: derivedRoot, bundleRoot };
    }
    return { workspaceRoot: cwd, bundleRoot };
  }

  let bundleRoot = path.join(cwd, 'docs', 'okf');
  if (!fs.existsSync(bundleRoot)) {
    bundleRoot = path.join(cwd, 'okf');
  }
  return { workspaceRoot: cwd, bundleRoot };
}

function findBundlesOnOtherBranches(workspaceRoot) {
  const hints = [];
  try {
    const branchesOut = execFileSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (!branchesOut) return hints;
    for (const branch of branchesOut.split(/\r?\n/)) {
      const b = branch.trim();
      if (!b) continue;
      for (const candidate of ['docs/okf/index.md', 'okf/index.md']) {
        try {
          execFileSync('git', ['cat-file', '-e', `${b}:${candidate}`], {
            cwd: workspaceRoot,
            stdio: ['ignore', 'ignore', 'ignore']
          });
          const bundleDir = candidate.replace(/\/index\.md$/, '');
          hints.push({ branch: b, bundlePath: bundleDir });
        } catch (e) {}
      }
    }
  } catch (e) {}
  return hints;
}

const IGNORED_FRONTIER_EXTENSIONS = new Set([
  '.pyc', '.pyo', '.pyd', '.dll', '.exe', '.so', '.dylib',
  '.class', '.o', '.obj', '.a', '.lib', '.pdb',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp', '.tiff', '.avif',
  '.mp4', '.webm', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.ogg',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.tar', '.gz', '.tgz', '.7z', '.rar', '.pkpass'
]);

const IGNORED_FRONTIER_FILES = new Set([
  'skills-lock.json', '.gitignore', 'license', 'readme.md',
  'agents.md', 'claude.md', 'gemini.md',
  '.cursorrules', '.windsurfrules', '.clinerules'
]);

function loadGitignorePatterns(workspaceRoot) {
  const patterns = [];
  const dirsToCheck = [];
  let curr = path.resolve(workspaceRoot);
  while (curr) {
    dirsToCheck.push(curr);
    if (fs.existsSync(path.join(curr, '.git'))) break;
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }

  for (const dir of dirsToCheck) {
    const gitignorePath = path.join(dir, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      try {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        const lines = content.split(/\r?\n/);
        for (let line of lines) {
          line = line.trim();
          if (!line || line.startsWith('#') || line.startsWith('!')) continue;
          
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
  }
  return patterns;
}

function isOkfBundleDir(dirPath) {
  const idx = path.join(dirPath, 'index.md');
  if (!fs.existsSync(idx)) return false;
  try {
    const head = fs.readFileSync(idx, 'utf8').slice(0, 2000);
    const m = head.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    return !!(m && /^okf_version\s*:/m.test(m[1]));
  } catch (e) {
    return false;
  }
}

// A file is covered when it, or any ancestor directory, is bound as a resource.
// This lets a concept bind a whole module directory (e.g. `file:///.../sql-fixes/`).
function isCoveredByResource(relPath, fullPath, documentedResources) {
  const normRel = relPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  if (documentedResources.has(normRel) || documentedResources.has(path.resolve(fullPath).toLowerCase())) return true;
  const parts = normRel.split('/');
  for (let i = 1; i < parts.length; i++) {
    if (documentedResources.has(parts.slice(0, i).join('/'))) return true;
  }
  return false;
}

function scanWorkspaceFiles(dir, workspaceRoot, documentedResources, results = [], gitignorePatterns = null, bundleRoot = null) {
  if (!fs.existsSync(dir)) return results;
  if (gitignorePatterns === null) {
    gitignorePatterns = loadGitignorePatterns(workspaceRoot);
  }
  const files = fs.readdirSync(dir);
  const ignores = [
    '.git', 'node_modules', '.agents', '.claude', '.gemini', 'agent', 'docs',
    'tmp', 'temp', '.idea', '.vscode', '.superpowers', '__pycache__',
    '.pytest_cache', '.mypy_cache', '.ruff_cache', '.venv', 'venv',
    'dist', 'build', 'coverage', '.next', 'target', 'bin', 'obj'
  ];
  const normBundleRoot = bundleRoot ? path.resolve(bundleRoot).toLowerCase() : null;
  
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
      // An OKF bundle's own files (concepts, index.md, log.md, viz.html) are the
      // documentation, not undocumented workspace files. Skip the active bundle,
      // any nested bundle directory, and any child sub-package that hosts its own
      // nested OKF bundle (okf/ or docs/okf/).
      if (normBundleRoot && path.resolve(fullPath).toLowerCase() === normBundleRoot) continue;
      if (isOkfBundleDir(fullPath)) continue;
      const childOkf = path.join(fullPath, 'okf');
      const childDocsOkf = path.join(fullPath, 'docs', 'okf');
      if (
        (isOkfBundleDir(childOkf) && path.resolve(childOkf).toLowerCase() !== normBundleRoot) ||
        (isOkfBundleDir(childDocsOkf) && path.resolve(childDocsOkf).toLowerCase() !== normBundleRoot)
      ) {
        continue;
      }
      scanWorkspaceFiles(fullPath, workspaceRoot, documentedResources, results, gitignorePatterns, bundleRoot);
    } else if (stat.isFile()) {
      const ext = path.extname(file).toLowerCase();
      if (IGNORED_FRONTIER_EXTENSIONS.has(ext)) continue;
      if (!IGNORED_FRONTIER_FILES.has(file.toLowerCase())) {
        if (!isCoveredByResource(relPath, fullPath, documentedResources)) {
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

function updateConceptTimestamp(filePath, nowISO, actor, syncDate = null) {
  const content = fs.readFileSync(filePath, 'utf8');
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return false;

  let fmText = fmMatch[1].replace(/\r\n/g, '\n');
  let updatedFm = fmText;

  // Check if generated block exists
  if (/generated:\s*\n/m.test(fmText)) {
    // Update at within generated
    if (/(\s+at:\s*)([^\n]+)/.test(fmText)) {
      updatedFm = updatedFm.replace(/(\s+at:\s*)([^\n]+)/, `$1${nowISO}`);
    } else {
      updatedFm = updatedFm.replace(/(generated:\s*\n)/, `$1  at: ${nowISO}\n`);
    }
  } else if (/timestamp:\s*[^\n]+/m.test(fmText)) {
    // Update legacy timestamp
    updatedFm = updatedFm.replace(/timestamp:\s*[^\n]+/, `generated:\n  by: ${actor}\n  at: ${nowISO}`);
  } else {
    // Add generated block
    updatedFm = updatedFm.trimEnd() + `\ngenerated:\n  by: ${actor}\n  at: ${nowISO}\n`;
  }

  const normalizedBlock = `---\n${updatedFm.trim()}\n---`;
  const finalBlock = eol === '\r\n' ? normalizedBlock.replace(/\n/g, '\r\n') : normalizedBlock;
  const newContent = content.replace(fmMatch[0], finalBlock);
  fs.writeFileSync(filePath, newContent, 'utf8');
  if (syncDate instanceof Date && !isNaN(syncDate.getTime())) {
    try {
      fs.utimesSync(filePath, syncDate, syncDate);
    } catch (e) {}
  }
  return true;
}

function collectBundleMarkdownLower(bundleRoot) {
  if (!bundleRoot || !fs.existsSync(bundleRoot)) return '';
  const chunks = [];
  for (const name of ['index.md', 'log.md']) {
    const p = path.join(bundleRoot, name);
    if (fs.existsSync(p)) chunks.push(fs.readFileSync(p, 'utf8').toLowerCase());
  }
  for (const cFile of walkConceptFiles(bundleRoot)) {
    try {
      chunks.push(fs.readFileSync(cFile, 'utf8').toLowerCase());
    } catch (e) {}
  }
  return chunks.join('\n');
}

function isAcknowledgedInBundle(relPath, bundleMarkdownLower) {
  const norm = relPath.replace(/\\/g, '/').toLowerCase();
  const base = path.basename(norm);
  if (bundleMarkdownLower.includes(norm) || bundleMarkdownLower.includes('`' + base + '`')) {
    return true;
  }
  const ellipsisRe = /`(?:\u2026|\.{3})([^`\r\n]{8,})`/g;
  let m;
  while ((m = ellipsisRe.exec(bundleMarkdownLower)) !== null) {
    if (base.endsWith(m[1])) return true;
  }
  return false;
}

function updateIndexFrontier(indexPath, frontierList, documentedResources, workspaceRoot = null) {
  if (!fs.existsSync(indexPath)) return false;
  let content = fs.readFileSync(indexPath, 'utf8');

  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const itemRe = /^-\s+`([^`]+)`(?:\s*[—–-]\s*(.*))?$/;

  // Locate the section, bounded by its heading and the next `## ` heading (or EOF).
  // Only the bullet items inside it are managed. Hand-written prose in the section
  // and every section after it are preserved byte-for-byte.
  const headingMatch = content.match(/^## Not yet specified[^\r\n]*$/m);
  let before, section, after;
  if (headingMatch) {
    const start = headingMatch.index;
    const bodyStart = start + headingMatch[0].length;
    const nextIdx = content.slice(bodyStart).search(/^## /m);
    const end = nextIdx === -1 ? content.length : bodyStart + nextIdx;
    before = content.slice(0, start);
    section = content.slice(start, end);
    after = content.slice(end);
  } else {
    if (frontierList.length === 0) return false;
    before = content.trimEnd() + eol + eol;
    section = '## Not yet specified' + eol;
    after = '';
  }

  const lines = section.split(/\r?\n/);
  let modified = !headingMatch;
  const bundleRel = workspaceRoot
    ? path.relative(workspaceRoot, path.dirname(indexPath)).replace(/\\/g, '/').toLowerCase()
    : '';
  const frontierSet = new Set(frontierList.map(f => f.path.replace(/\\/g, '/').toLowerCase()));

  // 1. Drop managed bullet items whose file is now documented, deleted, or excluded.
  //    Hand-written notes (custom prose after `—` or multi-line indented continuations)
  //    are never deleted by maintain.
  const kept = [];
  const listed = new Set();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(itemRe);
    if (m) {
      const key = m[1].replace(/\\/g, '/').toLowerCase();
      const hasContinuation = (i + 1 < lines.length) && /^\s+\S/.test(lines[i + 1]);
      const isAutoGeneratedBullet = !hasContinuation && (!m[2] || m[2].trim() === 'Undocumented codebase file.');
      if (isAutoGeneratedBullet) {
        // Also self-heal auto-generated entries that point inside this bundle;
        // earlier versions listed the bundle's own files as frontier.
        const inBundle = bundleRel !== '' && key.startsWith(bundleRel + '/');
        const existsOnDisk = !workspaceRoot || fs.existsSync(path.join(workspaceRoot, m[1]));
        if (
          inBundle ||
          isCoveredByResource(key, key, documentedResources) ||
          !existsOnDisk ||
          !frontierSet.has(key)
        ) {
          modified = true;
          continue;
        }
      }
      listed.add(key);
    }
    kept.push(line);
  }

  // 2. Add frontier files not already acknowledged anywhere in the bundle. A path
  //    or backtick-quoted filename the author already explains in prose counts as
  //    listed, which matches how `--check` decides what is unindexed.
  const bundleMarkdownLower = content.toLowerCase() + '\n' + collectBundleMarkdownLower(path.dirname(indexPath));
  const additions = frontierList
    .filter(f => {
      const norm = f.path.toLowerCase();
      return !listed.has(norm) && !isCoveredByResource(norm, f.absolutePath || norm, documentedResources) && !isAcknowledgedInBundle(norm, bundleMarkdownLower);
    })
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(f => `- \`${f.path}\` — Undocumented codebase file.`);

  if (!headingMatch && additions.length === 0) return false;

  if (additions.length > 0) {
    modified = true;
    // Insert after the last existing bullet (and any indented continuation lines),
    // or directly under the heading.
    let insertAt = 1;
    for (let i = 0; i < kept.length; i++) {
      if (itemRe.test(kept[i])) {
        insertAt = i + 1;
        while (insertAt < kept.length && /^\s+\S/.test(kept[insertAt])) {
          insertAt++;
        }
      }
    }
    kept.splice(insertAt, 0, ...additions);
  }

  if (!modified) return false;

  let newSection = kept.join(eol);
  if (after && !/(\r?\n){2}$/.test(newSection)) newSection = newSection.trimEnd() + eol + eol;
  if (!after) newSection = newSection.trimEnd() + eol;
  fs.writeFileSync(indexPath, before + newSection + after, 'utf8');
  return true;
}

function appendLogEntry(logPath, entries, dateStr) {
  if (!fs.existsSync(logPath)) return false;
  const rawContent = fs.readFileSync(logPath, 'utf8');
  const eol = rawContent.includes('\r\n') ? '\r\n' : '\n';
  const content = rawContent.replace(/\r\n/g, '\n');
  const dateHeading = `## ${dateStr}`;

  let newEntriesText = entries.map(e => `- ${e}`).join('\n');
  let newContent;

  if (content.includes(dateHeading)) {
    const parts = content.split(dateHeading);
    newContent = parts[0] + dateHeading + '\n' + newEntriesText + '\n' + parts[1].replace(/^\n/, '');
  } else {
    const firstHeadingMatch = content.match(/\n(## \d{4}-\d{2}-\d{2}|[-\*]\s+(?:\*\*|\[)?\d{4}-\d{2}-\d{2})/);
    if (firstHeadingMatch) {
      const idx = firstHeadingMatch.index;
      const isBullet = firstHeadingMatch[1].startsWith('-') || firstHeadingMatch[1].startsWith('*');
      if (isBullet) {
        newContent = content.slice(0, idx).trimEnd() + `\n\n${dateHeading}\n${newEntriesText}\n\n` + content.slice(idx + 1);
      } else {
        newContent = content.slice(0, idx) + `\n\n${dateHeading}\n${newEntriesText}\n` + content.slice(idx);
      }
    } else {
      newContent = content.trimEnd() + `\n\n${dateHeading}\n${newEntriesText}\n`;
    }
  }

  fs.writeFileSync(logPath, eol === '\r\n' ? newContent.replace(/\n/g, '\r\n') : newContent, 'utf8');
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

function extractIndexedConceptPaths(indexContent) {
  const indexedSet = new Set();
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = linkRe.exec(indexContent)) !== null) {
    let raw = m[1].replace(/[?#].*$/, '').trim();
    if (!raw || /^(?:https?:|mailto:|file:|git:)/i.test(raw)) continue;
    try {
      raw = decodeURIComponent(raw);
    } catch (e) {}
    const norm = raw.replace(/\\/g, '/').replace(/^(?:\.\/|\/)+/, '').toLowerCase();
    if (norm) indexedSet.add(norm);
  }
  return indexedSet;
}

function findUnindexedConcepts(indexPath, allConceptRecords) {
  if (!fs.existsSync(indexPath) || !Array.isArray(allConceptRecords)) return [];
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  const indexedSet = extractIndexedConceptPaths(indexContent);
  return allConceptRecords.filter(rec => {
    if (String(rec.status || '').toLowerCase() === 'deprecated') return false;
    return !indexedSet.has(rec.file.toLowerCase());
  });
}

function updateIndexConcepts(indexPath, unindexedRecords) {
  if (!fs.existsSync(indexPath) || !Array.isArray(unindexedRecords) || unindexedRecords.length === 0) {
    return false;
  }
  const rawContent = fs.readFileSync(indexPath, 'utf8');
  const eol = rawContent.includes('\r\n') ? '\r\n' : '\n';
  const content = rawContent.replace(/\r\n/g, '\n');

  const newBullets = unindexedRecords
    .slice()
    .sort((a, b) => a.file.localeCompare(b.file))
    .map(rec => `- [${rec.title}](/${rec.file})`)
    .join('\n');

  let newContent;
  const conceptHeadingMatch = content.match(/^##\s+(?!Archived\s+Concepts\b).*concepts.*$/im);
  if (conceptHeadingMatch) {
    const headingEnd = conceptHeadingMatch.index + conceptHeadingMatch[0].length;
    const rest = content.slice(headingEnd);
    const nextHeadingMatch = rest.match(/\n##\s+/);
    const sectionEnd = nextHeadingMatch ? headingEnd + nextHeadingMatch.index : content.length;
    const beforeSectionEnd = content.slice(0, sectionEnd).trimEnd();
    const afterSectionEnd = content.slice(sectionEnd);
    newContent =
      beforeSectionEnd +
      '\n' +
      newBullets +
      '\n' +
      (afterSectionEnd ? '\n' + afterSectionEnd.replace(/^\n+/, '') : '');
  } else {
    const specialHeadingMatch = content.match(/^##\s+(?:Not yet specified|Archived Concepts|Provenance)\b/im);
    if (specialHeadingMatch) {
      const insertIdx = specialHeadingMatch.index;
      const before = content.slice(0, insertIdx).trimEnd();
      const after = content.slice(insertIdx);
      newContent = before + '\n\n## Concepts\n' + newBullets + '\n\n' + after;
    } else {
      newContent = content.trimEnd() + '\n\n## Concepts\n' + newBullets + '\n';
    }
  }

  fs.writeFileSync(indexPath, eol === '\r\n' ? newContent.replace(/\n/g, '\r\n') : newContent, 'utf8');
  return true;
}

// Path prefix for invoking the OKF skill scripts, as seen from the workspace root:
// workspace-relative when the skills live inside the repo, `~/`-relative on POSIX when
// under the user's home directory, forward-slash absolute on Windows (PowerShell does not
// expand `~/` when passed as an argument to `node`). Always ends with '/' (or is '').
function resolveSkillsBase(workspaceRoot, options = {}) {
  const skillsRoot = options.skillsRoot || path.resolve(__dirname, '..', '..');
  const homeDir = options.homeDir || os.homedir();
  const platform = options.platform || process.platform;
  if (
    workspaceRoot &&
    !options.skillsRoot &&
    fs.existsSync(path.join(workspaceRoot, 'okf-query', 'scripts', 'query.js')) &&
    fs.existsSync(path.join(workspaceRoot, 'okf-maintain', 'scripts', 'maintain.js'))
  ) {
    return '';
  }
  const isInside = (rel) => rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  const relWs = workspaceRoot ? path.relative(workspaceRoot, skillsRoot) : skillsRoot;
  if (relWs === '') return '';
  if (isInside(relWs) && (!relWs.startsWith('.') || path.resolve(workspaceRoot) !== path.resolve(homeDir))) {
    return relWs.replace(/\\/g, '/') + '/';
  }
  if (platform !== 'win32') {
    const relHome = path.relative(homeDir, skillsRoot);
    if (isInside(relHome)) return '~/' + relHome.replace(/\\/g, '/') + '/';
  }
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

function inspectAndSyncSteeringFile(filePath, workspaceRoot, bundleRoot, targetVersion, dryRun = false, options = {}) {
  if (!fs.existsSync(filePath)) return { exists: false, outdated: false, updated: false };
  const rawContent = fs.readFileSync(filePath, 'utf8');
  const eol = rawContent.includes('\r\n') ? '\r\n' : '\n';
  let content = rawContent.replace(/\r\n/g, '\n');

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

  const platform = options.platform || process.platform;
  if (platform === 'win32' && /\bnode\s+~\//.test(content)) {
    isOutdated = true;
  }

  if (!isOutdated) {
    return { exists: true, outdated: false, updated: false };
  }

  if (dryRun) {
    return { exists: true, outdated: true, updated: false };
  }

  const bundleRel = path.relative(workspaceRoot, bundleRoot).replace(/\\/g, '/') || '.';
  const newBlock = buildSteeringDirectivesBlock(bundleRel, targetVersion, resolveSkillsBase(workspaceRoot, options));

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

  fs.writeFileSync(filePath, eol === '\r\n' ? newContent.replace(/\n/g, '\r\n') : newContent, 'utf8');
  return { exists: true, outdated: true, updated: true };
}

async function main() {
  const args = process.argv.slice(2);
  const isCheckMode = args.includes('--check');
  const isJson = args.includes('--json');
  const withViz = args.includes('--viz');

  let actor = 'process:okf-maintain';
  const actorIdx = args.indexOf('--actor');
  if (actorIdx !== -1 && args[actorIdx + 1]) {
    actor = args[actorIdx + 1];
  }

  const { workspaceRoot, bundleRoot } = resolveWorkspaceAndBundle(args);

  if (!fs.existsSync(bundleRoot)) {
    const otherBranches = findBundlesOnOtherBranches(workspaceRoot);
    let err = `Error: OKF bundle not found at docs/okf or okf. Path checked: ${bundleRoot}`;
    if (otherBranches.length > 0) {
      const first = otherBranches[0];
      err += `\nHint: An OKF bundle exists on branch '${first.branch}' at '${first.bundlePath}/'. To bring it onto this branch, run: git checkout ${first.branch} -- ${first.bundlePath}`;
    }
    if (isJson) {
      console.log(JSON.stringify({ success: false, error: err, otherBranches }));
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
  const allConceptRecords = [];

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
      const local = resolveResourceLocalPath(fm.resource, workspaceRoot, bundleRoot);
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
          const local = resolveResourceLocalPath(rawResource, workspaceRoot, bundleRoot);
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
    const conceptTime = lastModified ? new Date(lastModified) : null;
    const effectiveConceptTime = getEffectiveConceptTime(cFile, lastModified, workspaceRoot);
    allConceptRecords.push({
      file: relConcept,
      fullPath: cFile,
      title: fm.title || path.basename(cFile, '.md'),
      status: fm.status || 'stable',
      absKey: path.resolve(cFile).toLowerCase(),
      conceptTimeIso: (conceptTime && !isNaN(conceptTime.getTime())) ? conceptTime.toISOString() : null,
      resourcesToCheck
    });

    if (effectiveConceptTime && !isNaN(effectiveConceptTime.getTime())) {
      for (const res of resourcesToCheck) {
        if (fs.existsSync(res.path) && !isReservedBundleFile(res.path, bundleRoot)) {
          const gitTimeStr = getGitLastModifiedISO(res.path, workspaceRoot);
          if (gitTimeStr) {
            const gitTime = new Date(gitTimeStr);
            if (gitTime > effectiveConceptTime) {
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

  // Propagate drift transitively when Concept B references Concept A in resource/sources and Concept A is drifted
  const driftedByAbsKey = new Map(driftedConcepts.map(d => [path.resolve(d.fullPath).toLowerCase(), d]));
  let addedTransitive = true;
  while (addedTransitive) {
    addedTransitive = false;
    for (const rec of allConceptRecords) {
      if (driftedByAbsKey.has(rec.absKey)) continue;
      for (const res of rec.resourcesToCheck) {
        const resKey = path.resolve(res.path).toLowerCase();
        if (driftedByAbsKey.has(resKey)) {
          const upstream = driftedByAbsKey.get(resKey);
          const transDrift = {
            file: rec.file,
            fullPath: rec.fullPath,
            resource: res.label,
            gitTime: upstream.gitTime,
            conceptTime: rec.conceptTimeIso || upstream.conceptTime
          };
          driftedConcepts.push(transDrift);
          driftedByAbsKey.set(rec.absKey, transDrift);
          addedTransitive = true;
          break;
        }
      }
    }
  }

  // 2. Scan workspace for undocumented frontier files
  const frontierList = scanWorkspaceFiles(workspaceRoot, workspaceRoot, documentedResources, [], null, bundleRoot);

  // Check if index.md has unlisted frontier files or unindexed active concepts
  const indexPath = path.join(bundleRoot, 'index.md');
  const missingFrontierInIndex = [];
  if (fs.existsSync(indexPath)) {
    const bundleMarkdownLower = collectBundleMarkdownLower(bundleRoot);
    for (const f of frontierList) {
      if (!isAcknowledgedInBundle(f.path, bundleMarkdownLower)) {
        missingFrontierInIndex.push(f.path);
      }
    }
  }
  const unindexedRecords = findUnindexedConcepts(indexPath, allConceptRecords);
  const unindexedConcepts = unindexedRecords.map(r => r.file);

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
    const clean =
      driftedConcepts.length === 0 &&
      missingFrontierInIndex.length === 0 &&
      unindexedConcepts.length === 0 &&
      outdatedSteeringFiles.length === 0;
    if (isJson) {
      console.log(JSON.stringify({
        success: clean,
        inSync: clean,
        bundleRoot,
        drifted: driftedConcepts,
        stale: staleConcepts,
        unindexedFrontier: missingFrontierInIndex,
        unindexedConcepts,
        outdatedSteering: outdatedSteeringFiles
      }, null, 2));
    } else {
      console.log(`OKF Maintenance Audit: ${bundleRoot}`);
      console.log(`----------------------------------------`);
      console.log(`Concepts checked:    ${conceptFiles.length}`);
      console.log(`Drifted concepts:    ${driftedConcepts.length}`);
      console.log(`Stale concepts:      ${staleConcepts.length}`);
      console.log(`Unindexed concepts:  ${unindexedConcepts.length}`);
      console.log(`Unindexed frontier:  ${missingFrontierInIndex.length}`);
      console.log(`Outdated steering:   ${outdatedSteeringFiles.length}`);
      console.log(`----------------------------------------`);
      if (driftedConcepts.length > 0) {
        console.log(`Drifted concepts:`);
        driftedConcepts.forEach(d => console.log(`  - ${d.file} (resource ${d.resource} updated on ${d.gitTime})`));
      }
      if (unindexedConcepts.length > 0) {
        console.log(`Unindexed active concepts:`);
        unindexedConcepts.forEach(c => console.log(`  - ${c}`));
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

  const syncDate = new Date();
  const nowISO = syncDate.toISOString();
  const dateStr = nowISO.slice(0, 10);

  // 3b. Update timestamps for drifted concepts (and align mtime to syncDate so transitive concept checks never see mtime > generated.at)
  for (const drift of driftedConcepts) {
    const ok = updateConceptTimestamp(drift.fullPath, nowISO, actor, syncDate);
    if (ok) {
      updatedFiles.push(drift.file);
    }
  }
  if (updatedFiles.length > 0) {
    logEntries.push(`Synchronized timestamp for ${updatedFiles.length} drifted concept(s): ${updatedFiles.join(', ')}.`);
  }

  // 3c. Auto-index unindexed active concepts and update index.md frontier
  let conceptsIndexed = false;
  let indexUpdated = false;
  if (fs.existsSync(indexPath)) {
    conceptsIndexed = updateIndexConcepts(indexPath, unindexedRecords);
    if (conceptsIndexed) {
      logEntries.push(`Indexed ${unindexedRecords.length} active concept(s) in \`index.md\`: ${unindexedConcepts.join(', ')}.`);
    }
    indexUpdated = updateIndexFrontier(indexPath, frontierList, documentedResources, workspaceRoot);
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
      indexedConcepts: conceptsIndexed ? unindexedConcepts : [],
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
    console.log(`Concepts indexed:      ${conceptsIndexed ? unindexedConcepts.length : 'Up to date'}`);
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
  resolveSkillsBase,
  findUnindexedConcepts,
  updateIndexConcepts,
  getRepoCommitTimeMap
};
