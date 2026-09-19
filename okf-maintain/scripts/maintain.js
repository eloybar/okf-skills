const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

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

function resolveResourceLocalPath(resourceUri, workspaceRoot) {
  if (!resourceUri) return null;
  let localPath = resourceUri.replace(/^file:\/\/\/?/, '');
  if (path.isAbsolute(localPath)) {
    return path.normalize(localPath);
  }
  return path.normalize(path.join(workspaceRoot, localPath));
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

async function main() {
  const args = process.argv.slice(2);
  const isCheckMode = args.includes('--check');
  const isJson = args.includes('--json');
  
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
        if (src && src.resource) {
          const local = resolveResourceLocalPath(src.resource, workspaceRoot);
          if (local) {
            documentedResources.add(path.relative(workspaceRoot, local).replace(/\\/g, '/').toLowerCase());
            documentedResources.add(path.resolve(local).toLowerCase());
            resourcesToCheck.push({ path: local, label: src.title || path.basename(local) });
          }
        }
      });
    }

    const lastModified = fm.timestamp || (fm.generated && fm.generated.at);
    if (lastModified) {
      const conceptTime = new Date(lastModified);
      for (const res of resourcesToCheck) {
        if (fs.existsSync(res.path)) {
          const gitTimeStr = getGitLastModifiedISO(res.path);
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

  if (isCheckMode) {
    const clean = driftedConcepts.length === 0 && missingFrontierInIndex.length === 0;
    if (isJson) {
      console.log(JSON.stringify({
        success: clean,
        bundleRoot,
        drifted: driftedConcepts,
        stale: staleConcepts,
        unindexedFrontier: missingFrontierInIndex
      }, null, 2));
    } else {
      console.log(`OKF Maintenance Audit: ${bundleRoot}`);
      console.log(`----------------------------------------`);
      console.log(`Concepts checked:    ${conceptFiles.length}`);
      console.log(`Drifted concepts:    ${driftedConcepts.length}`);
      console.log(`Stale concepts:      ${staleConcepts.length}`);
      console.log(`Unindexed frontier:  ${missingFrontierInIndex.length}`);
      console.log(`----------------------------------------`);
      if (driftedConcepts.length > 0) {
        console.log(`Drifted concepts:`);
        driftedConcepts.forEach(d => console.log(`  - ${d.file} (resource ${d.resource} updated on ${d.gitTime})`));
      }
      if (missingFrontierInIndex.length > 0) {
        console.log(`Unindexed frontier files:`);
        missingFrontierInIndex.forEach(f => console.log(`  - ${f}`));
      }
    }
    process.exit(clean ? 0 : 1);
  }

  // 3. Execution / Sync Mode
  const nowISO = new Date().toISOString();
  const dateStr = nowISO.slice(0, 10);
  const logEntries = [];
  const updatedFiles = [];

  // 3a. Update timestamps for drifted concepts
  for (const drift of driftedConcepts) {
    const ok = updateConceptTimestamp(drift.fullPath, nowISO, actor);
    if (ok) {
      updatedFiles.push(drift.file);
    }
  }
  if (updatedFiles.length > 0) {
    logEntries.push(`Synchronized timestamp for ${updatedFiles.length} drifted concept(s): ${updatedFiles.join(', ')}.`);
  }

  // 3b. Update index.md frontier
  let indexUpdated = false;
  if (fs.existsSync(indexPath)) {
    indexUpdated = updateIndexFrontier(indexPath, frontierList, documentedResources);
    if (indexUpdated) {
      logEntries.push(`Synchronized workspace frontier mapping in \`index.md\` (${frontierList.length} undocumented files mapped).`);
    }
  }

  // 3c. Record in log.md
  const logPath = path.join(bundleRoot, 'log.md');
  let logUpdated = false;
  if (logEntries.length > 0 && fs.existsSync(logPath)) {
    logUpdated = appendLogEntry(logPath, logEntries, dateStr);
  }

  // 3d. Regenerate visualizer if available
  let vizGenerated = false;
  const vizScript = path.join(workspaceRoot, 'okf-visualize', 'scripts', 'visualize.js');
  if (fs.existsSync(vizScript)) {
    try {
      execFileSync('node', [vizScript, '--bundle', bundleRoot], { stdio: 'ignore' });
      vizGenerated = true;
    } catch (e) {}
  }

  // 3e. Verify with okf-lint if available
  let lintPassed = true;
  const lintScript = path.join(workspaceRoot, 'okf-lint', 'scripts', 'lint.js');
  if (fs.existsSync(lintScript)) {
    try {
      execFileSync('node', [lintScript, '--drift'], { stdio: 'ignore' });
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
      logUpdated,
      vizGenerated,
      lintPassed
    }, null, 2));
  } else {
    console.log(`OKF Maintenance Sync Complete 🎉`);
    console.log(`----------------------------------------`);
    console.log(`Concepts synchronized: ${updatedFiles.length}`);
    console.log(`Frontier updated:       ${indexUpdated ? 'Yes' : 'Up to date'}`);
    console.log(`Log recorded:           ${logUpdated ? 'Yes' : 'Up to date'}`);
    console.log(`Visualization updated:  ${vizGenerated ? 'Yes' : 'N/A'}`);
    console.log(`Lint verification:      ${lintPassed ? 'Passed' : 'Failed'}`);
    console.log(`----------------------------------------`);
  }
}

if (require.main === module) {
  main();
}
