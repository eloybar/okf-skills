const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const https = require('https');
const os = require('os');

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

function extractLinks(content) {
  // Strip fenced code blocks and inline backticked code
  const stripped = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\r\n]+`/g, '');

  const links = [];
  const linkRe = /\[([^\]]*)\]\(([^)\s]+\.md)(?:#[A-Za-z0-9_\-]*)?\)/g;
  let match;
  while ((match = linkRe.exec(stripped)) !== null) {
    links.push({
      label: match[1].trim(),
      target: match[2]
    });
  }
  return links;
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

function resolveResourceLocalPath(resourceUri, workspaceRoot) {
  if (!resourceUri || /^https?:\/\//i.test(resourceUri)) return null;
  // Convert file:///D:/path/to/file to local D:/path/to/file
  let localPath = resourceUri.replace(/^file:\/\/\/?/, '');
  if (path.isAbsolute(localPath)) {
    return path.normalize(localPath);
  }
  // Otherwise try resolving relative to workspaceRoot
  return path.normalize(path.join(workspaceRoot, localPath));
}

const FRONTIER_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php',
  '.sql', '.graphql', '.gql', '.proto', '.sh', '.ps1',
  '.vue', '.svelte'
]);

function scanAndLint(dir, bundleRoot, workspaceRoot, checkDrift, strictLinks = false, results = { errors: [], warnings: [], filesChecked: 0, documentedResources: new Set() }) {
  if (!results.documentedResources) {
    results.documentedResources = new Set();
  }
  if (!fs.existsSync(dir)) return results;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanAndLint(fullPath, bundleRoot, workspaceRoot, checkDrift, strictLinks, results);
    } else if (stat.isFile() && file.endsWith('.md')) {
      // Reserved files validation (§8, §9, §11)
      if (file === 'index.md') {
        const relativePath = path.relative(bundleRoot, fullPath).replace(/\\/g, '/');
        const content = fs.readFileSync(fullPath, 'utf8');
        const isRoot = path.resolve(fullPath) === path.resolve(path.join(bundleRoot, 'index.md'));
        const fm = parseFrontmatter(content);
        if (fm) {
          if (!isRoot) {
            results.errors.push(`[${relativePath}] Error: Only the bundle-root index.md may contain frontmatter (§8, §12).`);
          } else {
            const keys = Object.keys(fm);
            for (const k of keys) {
              if (k !== 'okf_version') {
                results.warnings.push(`[${relativePath}] Warning: Bundle-root index.md should only carry 'okf_version' frontmatter key (§12). Found '${k}'.`);
              }
            }
          }
        }
        continue;
      }
      if (file === 'log.md') {
        const relativePath = path.relative(bundleRoot, fullPath).replace(/\\/g, '/');
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith('## ')) {
            const dateStr = line.slice(3).trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
              results.warnings.push(`[${relativePath}:${i + 1}] Warning: Log date heading '${line}' does not use standard ISO 8601 YYYY-MM-DD form (§9). Run okf-upgrade to normalize.`);
            }
          }
        }
        continue;
      }

      results.filesChecked++;
      const relativePath = path.relative(bundleRoot, fullPath).replace(/\\/g, '/');
      const content = fs.readFileSync(fullPath, 'utf8');
      const fm = parseFrontmatter(content);

      // 1. Conformance check
      if (!fm) {
        results.errors.push(`[${relativePath}] Error: Missing or unparseable YAML frontmatter block.`);
        continue;
      }
      if (!fm.type) {
        results.errors.push(`[${relativePath}] Error: YAML frontmatter missing 'type' key.`);
      }

      // Actor format checks (§7)
      if (fm.generated && fm.generated.by && typeof fm.generated.by === 'string') {
        if (fm.generated.by.startsWith('agent:')) {
          results.warnings.push(`[${relativePath}] Warning: 'generated.by' uses non-standard '${fm.generated.by}'. OKF v0.2 actor convention (§7) uses <producer>/<version> for agents (without 'agent:' prefix), human:<id>, or process:<id>. Run okf-upgrade to normalize.`);
        }
      }
      if (fm.verified) {
        const verifiers = Array.isArray(fm.verified) ? fm.verified : [fm.verified];
        verifiers.forEach(v => {
          if (v && typeof v.by === 'string' && v.by.startsWith('agent:')) {
            results.warnings.push(`[${relativePath}] Warning: 'verified.by' uses non-standard '${v.by}'. OKF v0.2 actor convention (§7) uses <producer>/<version> for agents (without 'agent:' prefix), human:<id>, or process:<id>. Run okf-upgrade to normalize.`);
          }
        });
      }

      // 2. Link Integrity check
      const links = extractLinks(content);
      for (const link of links) {
        let targetPath;
        if (link.target.startsWith('/')) {
          targetPath = path.join(bundleRoot, link.target.slice(1));
        } else {
          targetPath = path.join(path.dirname(fullPath), link.target);
        }
        if (!fs.existsSync(targetPath)) {
          if (strictLinks) {
            results.errors.push(`[${relativePath}] Error: Broken concept link to '${link.target}'. Target does not exist.`);
          } else {
            results.warnings.push(`[${relativePath}] Warning: Broken concept link to '${link.target}'. Target does not exist. (OKF v0.2 §6.1 tolerates broken links; use --strict-links to fail build)`);
          }
        }

        // 2b. Refer by Name check: flag bare paths/URLs as warnings
        const labelLower = link.label.toLowerCase();
        const targetName = path.basename(link.target).toLowerCase();
        const isBare = !link.label ||
                       labelLower === targetName ||
                       labelLower === link.target.toLowerCase() ||
                       labelLower.endsWith('.md') ||
                       labelLower.startsWith('/') ||
                       /^https?:\/\//i.test(link.label);
        
        if (isBare) {
          results.warnings.push(`[${relativePath}] Warning: Bare or non-descriptive link label '${link.label}' used for target '${link.target}'. Prefer using a descriptive name label (e.g. [Database Ingestion](/concepts/db-ingestion.md)).`);
        }
      }

      // 3. Concept Drift check & Documented Resource tracking
      const isDeprecated = fm.status === 'deprecated' || relativePath.startsWith('archive/');
      const lastModified = fm.timestamp || (fm.generated && fm.generated.at);
      const resourcesToCheck = [];
      if (fm.resource && !/^https?:\/\//i.test(fm.resource)) {
        resourcesToCheck.push({ path: fm.resource, label: `Resource file '${path.basename(resolveResourceLocalPath(fm.resource, workspaceRoot) || fm.resource)}'` });
      }
      if (Array.isArray(fm.sources)) {
        fm.sources.forEach((src, idx) => {
          const rawResource = typeof src === 'string' ? src : (src && src.resource);
          if (rawResource && !/^https?:\/\//i.test(rawResource)) {
            const label = (src && typeof src === 'object' && src.title) ? `Source '${src.title}'` : `Source resource [${idx}]`;
            resourcesToCheck.push({ path: rawResource, label });
          }
        });
      }

      const allBoundPaths = resourcesToCheck.map(r => r.path);
      if (fm.computation) allBoundPaths.push(fm.computation);
      if (fm.executor && fm.executor.resource) allBoundPaths.push(fm.executor.resource);
      if (fm.attester && fm.attester.resource) allBoundPaths.push(fm.attester.resource);

      for (const rawBound of allBoundPaths) {
        const resolvedBound = resolveResourceLocalPath(rawBound, workspaceRoot);
        if (resolvedBound) {
          results.documentedResources.add(path.relative(workspaceRoot, resolvedBound).replace(/\\/g, '/').toLowerCase());
          results.documentedResources.add(path.resolve(resolvedBound).toLowerCase());
        }
      }

      if (checkDrift && lastModified && !isDeprecated) {
        for (const res of resourcesToCheck) {
          const resolvedPath = resolveResourceLocalPath(res.path, workspaceRoot);
          if (resolvedPath && fs.existsSync(resolvedPath)) {
            const gitTimeStr = getGitLastModifiedISO(resolvedPath, workspaceRoot);
            if (gitTimeStr) {
              const gitTime = new Date(gitTimeStr);
              const conceptTime = new Date(lastModified);
              if (gitTime > conceptTime) {
                results.warnings.push(`[${relativePath}] Warning: Concept drift detected. ${res.label} was modified on ${gitTime.toISOString()} but the concept's timestamp/generated.at is ${conceptTime.toISOString()}. Run okf-maintain to sync.`);
              }
            }
          }
        }
      }

      // 3b. Freshness / Stale After check (OKF v0.2 §5.4)
      if (fm.stale_after && !isDeprecated) {
        const staleDate = new Date(fm.stale_after);
        if (!isNaN(staleDate.getTime()) && Date.now() >= staleDate.getTime()) {
          results.warnings.push(`[${relativePath}] Warning: Concept is stale. 'stale_after' threshold (${staleDate.toISOString()}) has passed. Concept requires re-verification.`);
        }
      }

      // 4. Attested Computation checks
      if (fm.type === 'Attested Computation') {
        if (!fm.runtime) {
          results.errors.push(`[${relativePath}] Error: Attested Computation missing 'runtime' key.`);
        }
        if (fm.computation) {
          const compPath = resolveResourceLocalPath(fm.computation, workspaceRoot);
          if (compPath && !fs.existsSync(compPath)) {
            results.errors.push(`[${relativePath}] Error: Attested Computation 'computation' resource file '${fm.computation}' not found.`);
          }
        }
        if (fm.executor && fm.executor.resource) {
          const execPath = resolveResourceLocalPath(fm.executor.resource, workspaceRoot);
          if (execPath && !fs.existsSync(execPath)) {
            results.errors.push(`[${relativePath}] Error: Executor resource file '${fm.executor.resource}' not found.`);
          }
        }
        if (fm.attester && fm.attester.resource) {
          const attestPath = resolveResourceLocalPath(fm.attester.resource, workspaceRoot);
          if (attestPath && !fs.existsSync(attestPath)) {
            results.errors.push(`[${relativePath}] Error: Attester resource file '${fm.attester.resource}' not found.`);
          }
        }
      }
    }
  }

  // Root-level check for modified/added unmapped frontier code files when --drift is enabled
  if (checkDrift && path.resolve(dir) === path.resolve(bundleRoot)) {
    try {
      const statusOut = execFileSync('git', ['status', '--porcelain', '-uall'], {
        cwd: workspaceRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      const ignoredTopDirs = new Set(['.git', 'node_modules', '.agents', '.claude', 'agent', 'docs', 'tmp', 'temp', '.idea', '.vscode', '.superpowers']);
      const bundleRelNorm = path.relative(workspaceRoot, bundleRoot).replace(/\\/g, '/').toLowerCase();

      const lines = statusOut.split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        const m = line.match(/^\s*([MADRCU?!]{1,2})\s+(.*)$/);
        if (!m) continue;
        const statusCode = m[1];
        if (statusCode.includes('D') || statusCode.includes('!')) continue;

        let rawPath = m[2].trim();
        if (rawPath.includes(' -> ')) {
          rawPath = rawPath.split(' -> ').pop().trim();
        }
        rawPath = rawPath.replace(/^"|"$/g, '');
        const relDirtyPath = rawPath.replace(/\\/g, '/');
        const relDirtyLower = relDirtyPath.toLowerCase();

        const topSeg = relDirtyPath.split('/')[0];
        if (ignoredTopDirs.has(topSeg)) continue;
        if (bundleRelNorm && (relDirtyLower === bundleRelNorm || relDirtyLower.startsWith(bundleRelNorm + '/'))) continue;

        const ext = path.extname(relDirtyPath).toLowerCase();
        if (!FRONTIER_EXTENSIONS.has(ext)) continue;

        const absDirty = path.resolve(workspaceRoot, relDirtyPath);
        if (!fs.existsSync(absDirty) || !fs.statSync(absDirty).isFile()) continue;

        const absDirtyLower = absDirty.toLowerCase();
        let isBound = results.documentedResources.has(relDirtyLower) || results.documentedResources.has(absDirtyLower);
        if (!isBound) {
          for (const docEntry of results.documentedResources) {
            if (relDirtyLower.startsWith(docEntry + '/') || absDirtyLower.startsWith(docEntry + path.sep)) {
              isBound = true;
              break;
            }
          }
        }

        if (!isBound) {
          results.warnings.push(
            `[Drift Warning] Modified workspace file '${relDirtyPath}' is not bound to any OKF concept's 'resource' or 'sources' frontmatter (currently in '## Not yet specified'). Update or create a concept to document this change.`
          );
        }
      }
    } catch (e) {
      // Ignore git status errors in non-git workspaces
    }
  }

  return results;
}

const INSTALLED_VERSION = '1.7.0';

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

function printVersionWarning(latestVersion) {
  console.warn(`\n[okf-lint] ⚠️ Warning: Your installed OKF skills (v${INSTALLED_VERSION}) are out of date.`);
  console.warn(`Latest version on GitHub is v${latestVersion}.`);
  console.warn(`To update, please run the installer script:`);
  console.warn(`  Windows (PowerShell): powershell -ExecutionPolicy Bypass -File .\\install.ps1 -Agent All`);
  console.warn(`  macOS/Linux (Bash):   bash ./install.sh`);
  console.warn(`----------------------------------------\n`);
}

function checkSkillsVersion() {
  return new Promise((resolve) => {
    const cachePath = path.join(os.homedir(), '.okf-skills-version-cache.json');
    let cache = { lastChecked: 0, latestVersion: INSTALLED_VERSION };
    
    try {
      if (fs.existsSync(cachePath)) {
        cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      }
    } catch (e) {}

    const oneDayMs = 24 * 60 * 60 * 1000;
    if (Date.now() - cache.lastChecked < oneDayMs) {
      if (compareVersions(cache.latestVersion, INSTALLED_VERSION) > 0) {
        printVersionWarning(cache.latestVersion);
      }
      return resolve();
    }

    // Fetch latest version from GitHub package.json
    const url = 'https://raw.githubusercontent.com/eloybar/okf-skills/main/package.json';
    const req = https.get(url, { timeout: 1500 }, (res) => {
      if (res.statusCode !== 200) {
        return resolve();
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let latestVersion = null;
        try {
          const pkg = JSON.parse(data);
          if (pkg && pkg.version) latestVersion = pkg.version;
        } catch (e) {
          const match = data.match(/"version":\s*"([0-9.]+)"/) || data.match(/version:\s*([0-9.]+)/);
          if (match) latestVersion = match[1].trim();
        }
        cache.lastChecked = Date.now();
        if (latestVersion) {
          cache.latestVersion = latestVersion;
          if (compareVersions(latestVersion, INSTALLED_VERSION) > 0) {
            printVersionWarning(latestVersion);
          }
        }
        try {
          fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
        } catch (e) {}
        resolve();
      });
    });

    req.on('error', () => {
      resolve();
    });

    req.on('timeout', () => {
      req.destroy();
      resolve();
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const outputJson = args.includes('--json');
  if (!outputJson) {
    await checkSkillsVersion();
  }
  const checkDrift = args.includes('--drift');
  const strictLinks = args.includes('--strict-links') || args.includes('--strict');
  
  const workspaceRoot = process.cwd();
  const bundleIdx = args.indexOf('--bundle');
  let bundleRoot = (bundleIdx !== -1 && args[bundleIdx + 1])
    ? path.resolve(workspaceRoot, args[bundleIdx + 1])
    : path.join(workspaceRoot, 'docs', 'okf');
  if (!fs.existsSync(bundleRoot)) {
    bundleRoot = path.join(workspaceRoot, 'okf');
  }

  if (!fs.existsSync(bundleRoot)) {
    if (outputJson) {
      console.log(JSON.stringify({ success: false, error: `OKF bundle not found in docs/okf or okf. Checked path: ${bundleRoot}` }, null, 2));
    } else {
      console.error(`Error: OKF bundle not found in docs/okf or okf. Checked path: ${bundleRoot}`);
    }
    process.exit(1);
  }

  if (!outputJson) {
    console.log(`Starting OKF Linting in: ${bundleRoot}`);
    if (checkDrift) {
      console.log(`Git-based concept drift analysis enabled (--drift)`);
    }
    if (strictLinks) {
      console.log(`Strict link integrity enabled (--strict-links)`);
    }
    console.log(`----------------------------------------`);
  }

  const results = scanAndLint(bundleRoot, bundleRoot, workspaceRoot, checkDrift, strictLinks);

  const TARGET_STEERING_VERSION = '1.7.0';
  // Check steering notice files for outdated templates across all supported agents
  const steeringFilesToCheck = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', '.windsurfrules', '.clinerules', 'GEMINI.md'];
  for (const sName of steeringFilesToCheck) {
    const sPath = path.join(workspaceRoot, sName);
    if (fs.existsSync(sPath)) {
      try {
        const steeringContent = fs.readFileSync(sPath, 'utf8');
        if (steeringContent.includes('Knowledge Bundle') ||
            steeringContent.includes('okf-maintain') ||
            steeringContent.includes('okf-steering-version') ||
            steeringContent.includes('Open Knowledge Format') ||
            steeringContent.includes('Steering Notice')) {
          const versionMatch = steeringContent.match(/<!-- okf-steering-version:\s*([0-9.]+)\s*-->/);
          let isOutdated = false;

          if (versionMatch) {
            const steeringVersion = versionMatch[1].trim();
            if (compareVersions(steeringVersion, TARGET_STEERING_VERSION) < 0) {
              isOutdated = true;
            }
          } else {
            isOutdated = true;
          }

          if (!steeringContent.includes('Pre-Completion Verification Gate') ||
              !steeringContent.includes('Pre-Work Grounding Gate')) {
            isOutdated = true;
          }

          if (isOutdated) {
            results.warnings.push(`[${sName}] Warning: Steering notice appears to be outdated or missing the Pre-Work Gate / Pre-Completion Gate / version tag (expected version ${TARGET_STEERING_VERSION}). Run okf-maintain to sync.`);
          }
        }
      } catch (e) {}
    }
  }

  if (outputJson) {
    const jsonOutput = {
      success: results.errors.length === 0,
      bundleRoot,
      filesChecked: results.filesChecked,
      errors: results.errors,
      warnings: results.warnings,
      driftCount: results.warnings.filter(w => w.includes('Concept drift detected') || w.includes('[Drift Warning]')).length,
      staleCount: results.warnings.filter(w => w.includes('Concept is stale')).length
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
    process.exit(results.errors.length === 0 ? 0 : 1);
  }

  console.log(`Files checked: ${results.filesChecked}`);
  console.log(`Errors found:  ${results.errors.length}`);
  console.log(`Warnings:      ${results.warnings.length}`);
  console.log(`----------------------------------------`);

  if (results.warnings.length > 0) {
    console.log(`Warnings:`);
    results.warnings.forEach(w => console.log(`  ${w}`));
    console.log(`----------------------------------------`);
  }

  if (results.errors.length > 0) {
    console.log(`Errors (Build Failure):`);
    results.errors.forEach(e => console.error(`  ${e}`));
    console.log(`----------------------------------------`);
    process.exit(1);
  }

  console.log(`OKF Linting Passed Successfully! 🎉`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseFrontmatter,
  scanAndLint,
  compareVersions
};
