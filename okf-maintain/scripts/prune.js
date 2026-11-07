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
  // Ignore non-file:// URI schemes (https://, bigquery://, gs://, etc.)
  if (/^(?!file:\/\/)[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(trimmed)) return null;
  // Ignore non-path URI schemes without "//" (e.g. git:323eae6:path, urn:..., mailto:...)
  if (/^(?!file:)[a-zA-Z][a-zA-Z0-9+.-]+:/i.test(trimmed)) return null;
  // Ignore scope descriptors (§5.1, e.g. "all queries in BigQuery project X")
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

function extractLinks(markdown) {
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\r\n]*\]\([^`\r\n]*`/g, '');
  const links = [];
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(stripped)) !== null) {
    links.push({ label: match[1].replace(/`/g, '').trim(), target: match[2] });
  }
  return links;
}

function scanConcepts(dir, bundleRoot, list = []) {
  if (!fs.existsSync(dir)) return list;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      // Ignore archive directory
      const relToBundle = path.relative(bundleRoot, fullPath).replace(/\\/g, '/');
      if (relToBundle === 'archive' || relToBundle.startsWith('archive/')) {
        continue;
      }
      scanConcepts(fullPath, bundleRoot, list);
    } else if (stat.isFile() && file.endsWith('.md')) {
      if (file === 'index.md' || file === 'log.md') continue;
      const relPath = path.relative(bundleRoot, fullPath).replace(/\\/g, '/');
      const content = fs.readFileSync(fullPath, 'utf8');
      const fm = parseFrontmatter(content) || {};
      const links = extractLinks(content);
      if (Array.isArray(fm.sources)) {
        for (const src of fm.sources) {
          const rawResource = typeof src === 'string' ? src : (src && src.resource);
          if (rawResource && typeof rawResource === 'string' && rawResource.endsWith('.md') && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(rawResource)) {
            links.push({ label: (src && src.title) || rawResource, target: rawResource });
          }
        }
      }
      list.push({
        fullPath,
        relPath,
        content,
        fm,
        links
      });
    }
  }
  return list;
}

function buildInboundLinkCounts(concepts, bundleRoot) {
  const counts = new Map();
  concepts.forEach(c => counts.set(c.relPath, 0));

  function recordTarget(targetStr, sourceRelPath) {
    if (!targetStr || targetStr.startsWith('http://') || targetStr.startsWith('https://')) return;
    let targetRel = targetStr;
    if (targetRel.startsWith('/')) {
      targetRel = targetRel.slice(1);
    } else {
      const sourceDir = path.dirname(sourceRelPath);
      targetRel = path.normalize(path.join(sourceDir, targetRel)).replace(/\\/g, '/');
    }
    targetRel = targetRel.replace(/#.*$/, '');
    if (counts.has(targetRel)) {
      counts.set(targetRel, counts.get(targetRel) + 1);
    }
  }

  // Scan index.md for references
  const indexPath = path.join(bundleRoot, 'index.md');
  if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const indexLinks = extractLinks(indexContent);
    for (const l of indexLinks) {
      recordTarget(l.target, 'index.md');
    }
  }

  // Scan all concepts for references
  for (const c of concepts) {
    for (const l of c.links) {
      recordTarget(l.target, c.relPath);
    }
  }

  return counts;
}

function updateFrontmatterStatus(content, newStatus, archivedAtISO) {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return content;
  let fmText = match[1].replace(/\r\n/g, '\n');

  if (/status:\s*[^\r\n]+/.test(fmText)) {
    fmText = fmText.replace(/status:\s*[^\r\n]+/, `status: ${newStatus}`);
  } else {
    fmText = `status: ${newStatus}\n` + fmText;
  }

  if (archivedAtISO) {
    if (/archived_at:\s*[^\r\n]+/.test(fmText)) {
      fmText = fmText.replace(/archived_at:\s*[^\r\n]+/, `archived_at: ${archivedAtISO}`);
    } else {
      fmText = fmText.trimEnd() + `\narchived_at: ${archivedAtISO}\n`;
    }
  }

  const normalizedBlock = `---\n${fmText.trim()}\n---`;
  const finalBlock = eol === '\r\n' ? normalizedBlock.replace(/\n/g, '\r\n') : normalizedBlock;
  return content.replace(match[0], finalBlock);
}

function updateIndexForArchived(indexPath, conceptRelPath, newRelPath, title, desc) {
  if (!fs.existsSync(indexPath)) return;
  const rawContent = fs.readFileSync(indexPath, 'utf8');
  const eol = rawContent.includes('\r\n') ? '\r\n' : '\n';
  let content = rawContent.replace(/\r\n/g, '\n');

  // Remove existing link referencing conceptRelPath
  const targetPattern1 = `/${conceptRelPath}`;
  const targetPattern2 = conceptRelPath;
  const lines = content.split(/\r?\n/);
  const remainingLines = [];

  for (const line of lines) {
    if (!line.includes(`(${targetPattern1})`) && !line.includes(`(${targetPattern2})`)) {
      remainingLines.push(line);
    }
  }

  content = remainingLines.join('\n');

  // Now ensure ## Archived Concepts exists and append link
  const archiveHeading = '## Archived Concepts';
  const newLink = `- [${title || path.basename(conceptRelPath)}](/${newRelPath})${desc ? ` — ${desc}` : ''}`;

  if (content.includes(archiveHeading)) {
    const parts = content.split(archiveHeading);
    content = parts[0] + archiveHeading + '\n' + newLink + '\n' + parts[1].replace(/^\r?\n/, '');
  } else {
    content = content.trimEnd() + `\n\n${archiveHeading}\n${newLink}\n`;
  }

  fs.writeFileSync(indexPath, eol === '\r\n' ? content.replace(/\n/g, '\r\n') : content, 'utf8');
}

function updateIndexForDeleted(indexPath, conceptRelPath) {
  if (!fs.existsSync(indexPath)) return;
  const rawContent = fs.readFileSync(indexPath, 'utf8');
  const eol = rawContent.includes('\r\n') ? '\r\n' : '\n';
  const content = rawContent.replace(/\r\n/g, '\n');
  const targetPattern1 = `/${conceptRelPath}`;
  const targetPattern2 = conceptRelPath;
  const lines = content.split(/\r?\n/);
  const remainingLines = lines.filter(line => {
    return !line.includes(`(${targetPattern1})`) && !line.includes(`(${targetPattern2})`);
  });
  const out = remainingLines.join('\n');
  fs.writeFileSync(indexPath, eol === '\r\n' ? out.replace(/\n/g, '\r\n') : out, 'utf8');
}

function appendLogEntry(logPath, entries, dateStr) {
  if (!fs.existsSync(logPath)) return false;
  const rawContent = fs.readFileSync(logPath, 'utf8');
  const eol = rawContent.includes('\r\n') ? '\r\n' : '\n';
  const content = rawContent.replace(/\r\n/g, '\n');
  const dateHeading = `## ${dateStr}`;
  const newEntriesText = entries.map(e => `- ${e}`).join('\n');
  let newContent;

  if (content.includes(dateHeading)) {
    const parts = content.split(dateHeading);
    newContent = parts[0] + dateHeading + '\n' + newEntriesText + '\n' + parts[1].replace(/^\r?\n/, '');
  } else {
    const firstHeadingMatch = content.match(/\n(## \d{4}-\d{2}-\d{2})/);
    if (firstHeadingMatch) {
      const idx = firstHeadingMatch.index;
      newContent = content.slice(0, idx) + `\n\n${dateHeading}\n${newEntriesText}\n` + content.slice(idx);
    } else {
      newContent = content.trimEnd() + `\n\n${dateHeading}\n${newEntriesText}\n`;
    }
  }

  fs.writeFileSync(logPath, eol === '\r\n' ? newContent.replace(/\n/g, '\r\n') : newContent, 'utf8');
  return true;
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

function printHelp() {
  console.log(`
OKF Concept Pruner (okf-maintain --prune)
Automated lifecycle cleanup, archiving, and garbage collection for OKF bundles.

Usage:
  node okf-maintain/scripts/maintain.js --prune [options]
  node okf-maintain/scripts/prune.js [options]

Modes:
  --check, --dry-run     Audit bundle for prunable concepts without making modifications.
                         Exits with code 1 if prunable concepts are detected.
  --archive              Move prunable concepts to 'archive/' and mark deprecated (Default action).
  --delete               Permanently remove prunable concept files from disk.

Category Filters (default is all):
  --stale                Target concepts where 'stale_after' timestamp has passed.
  --deprecated           Target concepts with frontmatter 'status: deprecated'.
  --ghosts               Target concepts whose local 'resource', 'sources', or computation file no longer exists.
  --orphans              Target concepts with 0 inbound links (from index.md or other concepts).
  --all                  Target all prunable categories (Default).

Other Options:
  --bundle <path>        Custom bundle path (default: 'docs/okf' or 'okf').
  --json                 Output structured JSON.
  -h, --help             Show this help message.
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const isCheck = args.includes('--check') || args.includes('--dry-run');
  const isDelete = args.includes('--delete');
  const outputJson = args.includes('--json');
  const withViz = args.includes('--viz');

  let filterStale = args.includes('--stale');
  let filterDeprecated = args.includes('--deprecated');
  let filterGhosts = args.includes('--ghosts');
  let filterOrphans = args.includes('--orphans');

  if (!filterStale && !filterDeprecated && !filterGhosts && !filterOrphans) {
    filterStale = true;
    filterDeprecated = true;
    filterGhosts = true;
    filterOrphans = true;
  }

  const { workspaceRoot, bundleRoot } = resolveWorkspaceAndBundle(args);

  if (!fs.existsSync(bundleRoot)) {
    if (outputJson) {
      console.log(JSON.stringify({ success: false, error: `OKF bundle not found at: ${bundleRoot}` }));
    } else {
      console.error(`Error: OKF bundle not found at: ${bundleRoot}`);
    }
    process.exit(1);
  }

  const concepts = scanConcepts(bundleRoot, bundleRoot);
  const inboundCounts = buildInboundLinkCounts(concepts, bundleRoot);
  const now = Date.now();

  const candidates = [];

  for (const c of concepts) {
    const reasons = [];

    // 1. Stale check
    if (filterStale && c.fm.stale_after) {
      const staleTime = new Date(c.fm.stale_after).getTime();
      if (!isNaN(staleTime) && now >= staleTime) {
        reasons.push(`stale_after expired (${c.fm.stale_after})`);
      }
    }

    // 2. Deprecated check
    if (filterDeprecated && c.fm.status === 'deprecated') {
      reasons.push('status is deprecated');
    }

    // 3. Ghost / missing local resource check (§6.2 & §10.2)
    if (filterGhosts) {
      const checkLocalBound = (rawUri, kindLabel) => {
        const resolvedPath = resolveResourceLocalPath(rawUri, workspaceRoot, bundleRoot);
        if (resolvedPath && !fs.existsSync(resolvedPath)) {
          reasons.push(`missing local ${kindLabel} file '${path.relative(workspaceRoot, resolvedPath).replace(/\\/g, '/')}'`);
        }
      };

      if (c.fm.resource) {
        checkLocalBound(c.fm.resource, 'resource');
      }
      if (Array.isArray(c.fm.sources)) {
        for (const src of fmSources(c.fm.sources)) {
          const rawResource = typeof src === 'string' ? src : (src && src.resource);
          if (rawResource) {
            checkLocalBound(rawResource, 'source');
          }
        }
      }
      if (c.fm.computation) {
        checkLocalBound(c.fm.computation, 'computation');
      }
      if (c.fm.executor && c.fm.executor.resource) {
        checkLocalBound(c.fm.executor.resource, 'executor');
      }
      if (c.fm.attester && c.fm.attester.resource) {
        checkLocalBound(c.fm.attester.resource, 'attester');
      }
    }

    // 4. Orphan check
    if (filterOrphans) {
      const inbound = inboundCounts.get(c.relPath) || 0;
      if (inbound === 0) {
        reasons.push('orphaned (0 inbound links in bundle)');
      }
    }

    if (reasons.length > 0) {
      candidates.push({
        concept: c,
        reasons
      });
    }
  }

  // 5. Transitive orphan resolution: if pruning candidate concepts removes the only inbound links to other concepts
  if (filterOrphans) {
    const candidateSet = new Set(candidates.map(c => c.concept.relPath));
    const indexPath = path.join(bundleRoot, 'index.md');
    const indexLinkedTargets = new Set();
    if (fs.existsSync(indexPath)) {
      const indexLinks = extractLinks(fs.readFileSync(indexPath, 'utf8'));
      for (const l of indexLinks) {
        if (!l.target || l.target.startsWith('http://') || l.target.startsWith('https://')) continue;
        let t = l.target.startsWith('/') ? l.target.slice(1) : l.target;
        t = t.replace(/#.*$/, '');
        indexLinkedTargets.add(path.normalize(t).replace(/\\/g, '/'));
      }
    }

    let addedMore = true;
    while (addedMore) {
      addedMore = false;
      for (const c of concepts) {
        if (candidateSet.has(c.relPath)) continue;

        let activeInbound = indexLinkedTargets.has(c.relPath) ? 1 : 0;
        if (activeInbound === 0) {
          for (const other of concepts) {
            if (candidateSet.has(other.relPath) || other.relPath === c.relPath) continue;
            for (const l of other.links) {
              if (!l.target || l.target.startsWith('http://') || l.target.startsWith('https://')) continue;
              let targetRel = l.target.startsWith('/') ? l.target.slice(1) : path.normalize(path.join(path.dirname(other.relPath), l.target)).replace(/\\/g, '/');
              targetRel = targetRel.replace(/#.*$/, '');
              if (targetRel === c.relPath) {
                activeInbound++;
                break;
              }
            }
            if (activeInbound > 0) break;
          }
        }

        if (activeInbound === 0) {
          candidates.push({
            concept: c,
            reasons: ['orphaned (all inbound links pruned or 0 inbound links)']
          });
          candidateSet.add(c.relPath);
          addedMore = true;
        }
      }
    }
  }

  if (isCheck) {
    if (outputJson) {
      console.log(JSON.stringify({
        success: candidates.length === 0,
        bundleRoot,
        totalChecked: concepts.length,
        totalPrunable: candidates.length,
        candidates: candidates.map(item => ({
          relPath: item.concept.relPath,
          title: item.concept.fm.title || path.basename(item.concept.relPath),
          status: item.concept.fm.status || 'stable',
          reasons: item.reasons
        }))
      }, null, 2));
    } else {
      console.log(`\n=== OKF Prune Audit (${candidates.length} candidate(s) found) ===\n`);
      if (candidates.length === 0) {
        console.log('✔ Bundle is clean. No expired, deprecated, ghost, or orphaned concepts found.');
      } else {
        for (const item of candidates) {
          console.log(`- [${item.concept.fm.title || item.concept.relPath}] (${item.concept.relPath})`);
          item.reasons.forEach(r => console.log(`    ↳ Reason: ${r}`));
        }
        console.log(`\nRun 'node okf-maintain/scripts/maintain.js --prune' to archive or '--delete' to remove.`);
      }
    }
    process.exit(candidates.length === 0 ? 0 : 1);
  }

  // Execution: archive or delete
  const nowISO = new Date().toISOString();
  const dateStr = nowISO.split('T')[0];
  const logPath = path.join(bundleRoot, 'log.md');
  const indexPath = path.join(bundleRoot, 'index.md');
  const logEntries = [];
  const processed = [];

  const archiveRoot = path.join(bundleRoot, 'archive');

  for (const item of candidates) {
    const c = item.concept;
    if (isDelete) {
      fs.unlinkSync(c.fullPath);
      updateIndexForDeleted(indexPath, c.relPath);
      logEntries.push(`Pruned (deleted) concept \`${c.relPath}\` due to: ${item.reasons.join(', ')}.`);
      processed.push({ relPath: c.relPath, action: 'deleted', reasons: item.reasons });
    } else {
      // Archive mode
      const destPath = path.join(archiveRoot, c.relPath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      // Update frontmatter to status: deprecated and archived_at
      const updatedContent = updateFrontmatterStatus(c.content, 'deprecated', nowISO);
      fs.writeFileSync(destPath, updatedContent, 'utf8');
      fs.unlinkSync(c.fullPath);

      const newRelPath = path.relative(bundleRoot, destPath).replace(/\\/g, '/');
      updateIndexForArchived(indexPath, c.relPath, newRelPath, c.fm.title, c.fm.description);
      logEntries.push(`Pruned (archived) concept \`${c.relPath}\` to \`${newRelPath}\` due to: ${item.reasons.join(', ')}.`);
      processed.push({ relPath: c.relPath, action: 'archived', newRelPath, reasons: item.reasons });
    }
  }

  if (logEntries.length > 0) {
    appendLogEntry(logPath, logEntries, dateStr);
  }

  // Regenerate visualizer only when explicitly requested via --viz
  const siblingVizScript = path.resolve(__dirname, '..', '..', 'okf-visualize', 'scripts', 'visualize.js');
  const workspaceVizScript = path.join(workspaceRoot, 'okf-visualize', 'scripts', 'visualize.js');
  const vizScript = fs.existsSync(siblingVizScript) ? siblingVizScript : workspaceVizScript;
  if (withViz && fs.existsSync(vizScript)) {
    try {
      execFileSync(process.execPath, [vizScript, '--bundle', bundleRoot, '--no-open'], {
        cwd: workspaceRoot,
        stdio: 'ignore'
      });
    } catch (e) {}
  }

  if (outputJson) {
    console.log(JSON.stringify({
      success: true,
      bundleRoot,
      mode: isDelete ? 'delete' : 'archive',
      prunedCount: processed.length,
      processed
    }, null, 2));
  } else {
    console.log(`\n=== OKF Pruning Complete ===`);
    console.log(`Action: ${isDelete ? 'Permanently Deleted' : 'Archived'}`);
    console.log(`Processed: ${processed.length} concept(s)\n`);
    for (const p of processed) {
      console.log(`✔ ${p.relPath} -> ${p.action === 'archived' ? p.newRelPath : 'deleted'}`);
      p.reasons.forEach(r => console.log(`    ↳ ${r}`));
    }
    console.log(`\nUpdated index.md and recorded changes in log.md.`);
  }
}

function fmSources(sources) {
  return Array.isArray(sources) ? sources : [];
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error in okf-prune:', err);
    process.exit(1);
  });
}

module.exports = {
  scanConcepts,
  buildInboundLinkCounts,
  parseFrontmatter,
  updateFrontmatterStatus,
  updateIndexForArchived,
  updateIndexForDeleted,
  appendLogEntry
};
