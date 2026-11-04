const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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

/**
 * Parses frontmatter YAML block to extract key-value pairs.
 */
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
  try {
    localPath = decodeURIComponent(localPath);
  } catch (e) {}
  if (!isFileUri && trimmed.startsWith('/') && bundleRoot) {
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

function addDocumentedResource(rawUri, workspaceRoot, resourceSet, conceptResources) {
  const resolved = resolveResourceLocalPath(rawUri, workspaceRoot);
  if (!resolved) return;
  const relNorm = path.relative(workspaceRoot, resolved).replace(/\\/g, '/');
  resourceSet.add(relNorm.toLowerCase());
  resourceSet.add(path.resolve(resolved).toLowerCase());
  resourceSet.add(path.normalize(resolved));
  if (conceptResources) {
    conceptResources.push(relNorm);
  }
}

/**
 * Recursively scans files in directory to collect OKF metadata, existing concepts, and subdirectories.
 */
function scanBundleTaxonomy(
  dir,
  bundleRoot,
  workspaceRoot,
  taxonomy = {
    types: new Set(),
    tags: new Set(),
    resources: new Set(),
    concepts: [],
    subdirectories: new Set()
  }
) {
  if (!fs.existsSync(dir)) return taxonomy;
  if (!taxonomy.concepts) taxonomy.concepts = [];
  if (!taxonomy.subdirectories) taxonomy.subdirectories = new Set();

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch (e) {
      continue;
    }

    if (stat.isDirectory()) {
      if (file.toLowerCase() === 'archive') continue;
      scanBundleTaxonomy(fullPath, bundleRoot, workspaceRoot, taxonomy);
    } else if (stat.isFile() && file.endsWith('.md')) {
      const lower = file.toLowerCase();
      if (lower === 'index.md' || lower === 'log.md') continue;

      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const fm = parseFrontmatter(content);
        if (fm) {
          if (fm.type) {
            taxonomy.types.add(fm.type);
          }
          if (Array.isArray(fm.tags)) {
            fm.tags.forEach(t => taxonomy.tags.add(t));
          }

          const conceptResources = [];
          if (fm.resource) {
            addDocumentedResource(fm.resource, workspaceRoot, taxonomy.resources, conceptResources);
          }
          if (Array.isArray(fm.sources)) {
            fm.sources.forEach(src => {
              const rawResource = typeof src === 'string' ? src : (src && src.resource);
              if (rawResource && !/^https?:\/\//i.test(rawResource)) {
                addDocumentedResource(rawResource, workspaceRoot, taxonomy.resources, conceptResources);
              }
            });
          }
          if (fm.computation) {
            addDocumentedResource(fm.computation, workspaceRoot, taxonomy.resources, conceptResources);
          }
          if (fm.executor && fm.executor.resource) {
            addDocumentedResource(fm.executor.resource, workspaceRoot, taxonomy.resources, conceptResources);
          }
          if (fm.attester && fm.attester.resource) {
            addDocumentedResource(fm.attester.resource, workspaceRoot, taxonomy.resources, conceptResources);
          }

          const relToBundle = '/' + path.relative(bundleRoot, fullPath).replace(/\\/g, '/');
          const relDir = path.dirname(relToBundle).replace(/\\/g, '/');
          if (relDir && relDir !== '/' && relDir !== '.') {
            taxonomy.subdirectories.add(relDir);
          }

          const title = fm.title || path.basename(file, '.md');
          taxonomy.concepts.push({
            title,
            type: fm.type || 'Concept',
            status: fm.status || 'stable',
            bundlePath: relToBundle,
            markdownLink: `[${title}](${relToBundle})`,
            resources: conceptResources
          });
        }
      } catch (err) {
        // Fail silently for individual read errors
      }
    }
  }
  return taxonomy;
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
  'skills-lock.json',
  '.gitignore',
  'license',
  'readme.md',
  'agents.md',
  'claude.md',
  'gemini.md',
  '.cursorrules',
  '.windsurfrules',
  '.clinerules'
]);

/**
 * Reads .gitignore files up to the enclosing Git root and compiles patterns to RegExp rules.
 */
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
          
          // Escape regex special chars except * and ?
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

function isCoveredByResource(relPath, fullPath, documentedResources) {
  const normRel = relPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  if (
    documentedResources.has(path.normalize(fullPath)) ||
    documentedResources.has(normRel) ||
    documentedResources.has(path.resolve(fullPath).toLowerCase())
  ) {
    return true;
  }
  const parts = normRel.split('/');
  for (let i = 1; i < parts.length; i++) {
    if (documentedResources.has(parts.slice(0, i).join('/'))) return true;
  }
  return false;
}

/**
 * Recursively scans the workspace to find files that do not have associated concepts.
 */
function scanWorkspace(dir, workspaceRoot, documentedResources, results = [], gitignorePatterns = null, bundleRoot = null) {
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
      // Skip nested git repositories / submodules / worktrees
      if (fs.existsSync(path.join(fullPath, '.git'))) continue;
      // Skip active or nested OKF bundles and child sub-packages that host their own OKF bundle
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
      scanWorkspace(fullPath, workspaceRoot, documentedResources, results, gitignorePatterns, bundleRoot);
    } else if (stat.isFile()) {
      const ext = path.extname(file).toLowerCase();
      if (IGNORED_FRONTIER_EXTENSIONS.has(ext)) continue;
      const normalized = path.normalize(fullPath);
      if (!isCoveredByResource(relPath, fullPath, documentedResources)) {
        // Skip common auxiliary and agent-steering files that do not warrant dedicated concept maps
        if (!IGNORED_FRONTIER_FILES.has(file.toLowerCase())) {
          results.push({
            path: relPath,
            absolutePath: normalized
          });
        }
      }
    }
  }
  return results;
}

/**
 * Clusters flat frontier files into logical module/directory candidates with a primary resource and companion sources.
 */
function clusterFrontier(frontierList) {
  const groups = new Map();

  for (const item of frontierList) {
    const parts = item.path.split('/');
    const groupKey = parts.length > 1 ? parts[0] : '.';
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey).push(item.path);
  }

  const clustered = [];
  for (const [directory, files] of groups.entries()) {
    const sorted = [...files].sort((a, b) => {
      const score = (p) => {
        const base = path.basename(p).toLowerCase();
        if (base === 'skill.md') return 0;
        if (base.startsWith('index.') || base.startsWith('main.')) return 1;
        if (base === 'readme.md') return 2;
        if (p.endsWith('.sql')) return 3;
        if (p.endsWith('.js') || p.endsWith('.ts') || p.endsWith('.py')) return 4;
        return 5;
      };
      return score(a) - score(b) || a.localeCompare(b);
    });

    const primaryCandidate = sorted[0];
    const companionFiles = sorted.slice(1);
    let suggestedType = 'Concept';
    if (sorted.some(f => path.basename(f) === 'SKILL.md')) {
      suggestedType = 'Skill';
    } else if (sorted.some(f => f.endsWith('.sql'))) {
      suggestedType = 'Attested Computation';
    } else if (directory === '.github' || directory === 'scripts' || sorted.some(f => f.endsWith('.sh') || f.endsWith('.ps1') || f.endsWith('.yml'))) {
      suggestedType = 'Utility';
    }

    clustered.push({
      directory,
      suggestedType,
      primaryCandidate,
      companionFiles,
      fileCount: sorted.length
    });
  }

  return clustered.sort((a, b) => b.fileCount - a.fileCount || a.directory.localeCompare(b.directory));
}

/**
 * Extracts code telemetry, exports, local imports, git history, and matching OKF concept cross-links for a target file.
 */
function inspectFileTelemetry(targetFile, workspaceRoot, taxonomy) {
  const resolvedPath = path.resolve(workspaceRoot, targetFile);
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    return {
      success: false,
      error: `Target file not found: ${targetFile}`
    };
  }

  const relPath = path.relative(workspaceRoot, resolvedPath).replace(/\\/g, '/');
  const fileUri = `file:///${resolvedPath.replace(/\\/g, '/')}`;
  const content = fs.readFileSync(resolvedPath, 'utf8');

  // 1. Extract exported symbols / functions / tables
  const exportedSymbols = new Set();
  const cjsMatch = content.match(/module\.exports\s*=\s*\{([^}]+)\}/);
  if (cjsMatch) {
    cjsMatch[1].split(',').forEach(part => {
      const sym = part.split(':')[0].trim();
      if (sym && /^[a-zA-Z0-9_$]+$/.test(sym)) exportedSymbols.add(sym);
    });
  }
  const namedExports = content.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([a-zA-Z0-9_$]+)/g);
  for (const m of namedExports) {
    exportedSymbols.add(m[1]);
  }
  const fnDecls = content.matchAll(/function\s+([a-zA-Z0-9_$]+)\s*\(/g);
  for (const m of fnDecls) {
    if (exportedSymbols.size < 15) exportedSymbols.add(m[1]);
  }
  const sqlTables = content.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|FUNCTION)\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_.`"-]+)/gi);
  for (const m of sqlTables) {
    exportedSymbols.add(m[1]);
  }

  // 2. Extract local relative imports / requires
  const localImports = new Set();
  const requireMatches = content.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g);
  for (const m of requireMatches) {
    localImports.add(m[1]);
  }
  const importMatches = content.matchAll(/from\s+['"](\.[^'"]+)['"]/g);
  for (const m of importMatches) {
    localImports.add(m[1]);
  }

  const resolvedImportPaths = [];
  const fileDir = path.dirname(resolvedPath);
  for (const imp of localImports) {
    const candidates = [
      path.resolve(fileDir, imp),
      path.resolve(fileDir, imp + '.js'),
      path.resolve(fileDir, imp + '.ts'),
      path.resolve(fileDir, imp, 'index.js')
    ];
    const found = candidates.find(c => fs.existsSync(c));
    const normImp = path.relative(workspaceRoot, found || candidates[0]).replace(/\\/g, '/');
    resolvedImportPaths.push(normImp);
  }

  // 3. Match related concepts by imported files or shared subsystem directory
  const relatedConcepts = [];
  const seenConcepts = new Set();
  const targetTopDir = relPath.split('/')[0].toLowerCase();

  for (const concept of (taxonomy.concepts || [])) {
    const cResources = (concept.resources || []).map(r => r.toLowerCase());
    let reason = null;

    for (const impPath of resolvedImportPaths) {
      if (cResources.includes(impPath.toLowerCase())) {
        reason = `Documents imported dependency (${impPath})`;
        break;
      }
    }
    if (!reason && targetTopDir && targetTopDir !== relPath.toLowerCase()) {
      if (cResources.some(r => r.startsWith(targetTopDir + '/'))) {
        reason = `Shares enclosing module (${targetTopDir}/)`;
      }
    }

    if (reason && !seenConcepts.has(concept.bundlePath)) {
      seenConcepts.add(concept.bundlePath);
      relatedConcepts.push({
        title: concept.title,
        type: concept.type,
        bundlePath: concept.bundlePath,
        markdownLink: concept.markdownLink,
        reason
      });
    }
  }

  // 4. Git telemetry (lastModified & primary contributors)
  let lastModified = null;
  const primaryAuthors = [];
  try {
    const iso = execFileSync('git', ['log', '-1', '--format=%aI', '--', relPath], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (iso) lastModified = iso;
  } catch (e) {}

  if (!lastModified) {
    try {
      lastModified = fs.statSync(resolvedPath).mtime.toISOString();
    } catch (e) {}
  }

  try {
    const shortlog = execFileSync('git', ['shortlog', '-sn', '--no-merges', 'HEAD', '--', relPath], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (shortlog) {
      for (const line of shortlog.split(/\r?\n/)) {
        const m = line.trim().match(/^(\d+)\s+(.+)$/);
        if (m) {
          primaryAuthors.push({ commits: Number(m[1]), author: m[2].trim() });
        }
      }
    }
  } catch (e) {}

  const topAuthor = primaryAuthors.length > 0
    ? `human:${primaryAuthors[0].author.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`
    : null;

  return {
    success: true,
    path: relPath,
    absolutePath: resolvedPath,
    fileUri,
    exportedSymbols: Array.from(exportedSymbols),
    localImports: resolvedImportPaths,
    relatedConcepts,
    git: {
      lastModified,
      primaryAuthors,
      suggestedVerifierActor: topAuthor
    }
  };
}

function main() {
  const args = process.argv.slice(2);
  const cwd = process.cwd();

  let bundleArg = null;
  const bundleIdx = args.indexOf('--bundle');
  if (bundleIdx !== -1 && args[bundleIdx + 1]) {
    bundleArg = args[bundleIdx + 1];
  }

  let inspectArg = null;
  const inspectIdx = args.indexOf('--inspect');
  if (inspectIdx !== -1 && args[inspectIdx + 1]) {
    inspectArg = args[inspectIdx + 1];
  }

  let bundlePath = bundleArg
    ? path.resolve(cwd, bundleArg)
    : path.resolve(cwd, 'docs/okf');
  if (!bundleArg && !fs.existsSync(bundlePath)) {
    bundlePath = path.resolve(cwd, 'okf');
  }

  let workspaceRoot = cwd;
  if (bundleArg && fs.existsSync(bundlePath)) {
    const parentDir = path.dirname(bundlePath);
    workspaceRoot = path.basename(parentDir).toLowerCase() === 'docs'
      ? path.dirname(parentDir)
      : parentDir;
  }

  if (!fs.existsSync(bundlePath)) {
    console.error(JSON.stringify({ error: `OKF bundle root not found in ${workspaceRoot}` }));
    process.exit(1);
  }

  const taxonomy = {
    types: new Set(),
    tags: new Set(),
    resources: new Set(),
    concepts: [],
    subdirectories: new Set()
  };
  scanBundleTaxonomy(bundlePath, bundlePath, workspaceRoot, taxonomy);

  if (inspectArg) {
    const telemetry = inspectFileTelemetry(inspectArg, workspaceRoot, taxonomy);
    if (!telemetry.success) {
      console.error(JSON.stringify(telemetry, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify(telemetry, null, 2));
    return;
  }

  // Scan for undocumented files (the frontier)
  const frontier = scanWorkspace(workspaceRoot, workspaceRoot, taxonomy.resources, [], null, bundlePath);
  const frontierGroups = clusterFrontier(frontier);
  const subdirectories = Array.from(taxonomy.subdirectories).sort();
  const conceptCount = taxonomy.concepts.length;
  const layoutMode = conceptCount >= 10 || subdirectories.length > 0 ? 'nested' : 'flat';

  console.log(JSON.stringify({
    success: true,
    bundlePath,
    conceptCount,
    layoutMode,
    subdirectories,
    types: Array.from(taxonomy.types),
    tags: Array.from(taxonomy.tags),
    concepts: taxonomy.concepts,
    frontier,
    frontierGroups
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  scanBundleTaxonomy,
  scanWorkspace,
  clusterFrontier,
  inspectFileTelemetry,
  parseFrontmatter
};
