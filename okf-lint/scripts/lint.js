const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const https = require('https');
const os = require('os');

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fmText = match[1];
  
  function parseInlineValue(val) {
    val = val.trim();
    if (val.startsWith('{') && val.endsWith('}')) {
      const obj = {};
      const pairs = val.slice(1, -1).split(',');
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
      return val.slice(1, -1).split(',').map(item => {
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
        if (colonIdx !== -1) {
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

function getGitLastModifiedISO(filePath) {
  try {
    const cleanPath = filePath.replace(/\\/g, '/');
    const stdout = execFileSync('git', ['log', '-1', '--format=%aI', '--', cleanPath], { stdio: ['pipe', 'pipe', 'ignore'] });
    return stdout.toString().trim();
  } catch (e) {
    return null;
  }
}

function resolveResourceLocalPath(resourceUri, workspaceRoot) {
  if (!resourceUri) return null;
  // Convert file:///D:/path/to/file to local D:/path/to/file
  let localPath = resourceUri.replace(/^file:\/\/\/?/, '');
  if (path.isAbsolute(localPath)) {
    return path.normalize(localPath);
  }
  // Otherwise try resolving relative to workspaceRoot
  return path.normalize(path.join(workspaceRoot, localPath));
}

function scanAndLint(dir, bundleRoot, workspaceRoot, checkDrift, results = { errors: [], warnings: [], filesChecked: 0 }) {
  if (!fs.existsSync(dir)) return results;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanAndLint(fullPath, bundleRoot, workspaceRoot, checkDrift, results);
    } else if (stat.isFile() && file.endsWith('.md')) {
      if (file === 'index.md' || file === 'log.md') continue;
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
          results.errors.push(`[${relativePath}] Error: Broken concept link to '${link.target}'. Target does not exist.`);
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

      // 3. Concept Drift check
      const lastModified = fm.timestamp || (fm.generated && fm.generated.at);
      if (checkDrift && lastModified) {
        const resourcesToCheck = [];
        if (fm.resource) {
          resourcesToCheck.push({ path: fm.resource, label: `Resource file '${path.basename(resolveResourceLocalPath(fm.resource, workspaceRoot) || fm.resource)}'` });
        }
        if (Array.isArray(fm.sources)) {
          fm.sources.forEach((src, idx) => {
            if (src && src.resource) {
              const label = src.title ? `Source '${src.title}'` : `Source resource [${idx}]`;
              resourcesToCheck.push({ path: src.resource, label });
            }
          });
        }

        for (const res of resourcesToCheck) {
          const resolvedPath = resolveResourceLocalPath(res.path, workspaceRoot);
          if (resolvedPath && fs.existsSync(resolvedPath)) {
            const gitTimeStr = getGitLastModifiedISO(resolvedPath);
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
  return results;
}

const INSTALLED_VERSION = '1.4.0';

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
  console.warn(`  macOS/Linux (Bash):   ./install.sh`);
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

    // Fetch latest version from GitHub
    const url = 'https://raw.githubusercontent.com/eloybar/okf-skills/main/okf-lint/SKILL.md';
    const req = https.get(url, { timeout: 1500 }, (res) => {
      if (res.statusCode !== 200) {
        return resolve();
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const match = data.match(/version:\s*([0-9.]+)/);
        cache.lastChecked = Date.now();
        if (match) {
          const latestVersion = match[1].trim();
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
  await checkSkillsVersion();
  const args = process.argv.slice(2);
  const checkDrift = args.includes('--drift');
  
  const workspaceRoot = process.cwd();
  let bundleRoot = path.join(workspaceRoot, 'docs', 'okf');
  if (!fs.existsSync(bundleRoot)) {
    bundleRoot = path.join(workspaceRoot, 'okf');
  }

  if (!fs.existsSync(bundleRoot)) {
    console.error(`Error: OKF bundle not found in docs/okf or okf. Checked path: ${bundleRoot}`);
    process.exit(1);
  }

  console.log(`Starting OKF Linting in: ${bundleRoot}`);
  if (checkDrift) {
    console.log(`Git-based concept drift analysis enabled (--drift)`);
  }
  console.log(`----------------------------------------`);

  const results = scanAndLint(bundleRoot, bundleRoot, workspaceRoot, checkDrift);

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
