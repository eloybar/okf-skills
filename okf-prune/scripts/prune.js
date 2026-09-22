const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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
  if (resourceUri.startsWith('http://') || resourceUri.startsWith('https://')) return null;
  let localPath = resourceUri.replace(/^file:\/\/\/?/, '');
  if (path.isAbsolute(localPath)) {
    return path.normalize(localPath);
  }
  return path.normalize(path.join(workspaceRoot, localPath));
}

function extractLinks(markdown) {
  const links = [];
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(markdown)) !== null) {
    links.push({ label: match[1], target: match[2] });
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
      const fm = parseFrontmatter(content);
      list.push({
        fullPath,
        relPath,
        content,
        fm: fm || {},
        links: extractLinks(content)
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
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return content;
  let fmText = match[1];

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

  return content.replace(match[0], `---\n${fmText.trim()}\n---`);
}

function updateIndexForArchived(indexPath, conceptRelPath, newRelPath, title, desc) {
  if (!fs.existsSync(indexPath)) return;
  let content = fs.readFileSync(indexPath, 'utf8');

  // Remove existing link referencing conceptRelPath
  const targetPattern1 = `/${conceptRelPath}`;
  const targetPattern2 = conceptRelPath;
  const lines = content.split(/\r?\n/);
  const remainingLines = [];

  let removedLine = null;
  for (const line of lines) {
    if (line.includes(`(${targetPattern1})`) || line.includes(`(${targetPattern2})`)) {
      removedLine = line;
    } else {
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

  fs.writeFileSync(indexPath, content, 'utf8');
}

function updateIndexForDeleted(indexPath, conceptRelPath) {
  if (!fs.existsSync(indexPath)) return;
  const content = fs.readFileSync(indexPath, 'utf8');
  const targetPattern1 = `/${conceptRelPath}`;
  const targetPattern2 = conceptRelPath;
  const lines = content.split(/\r?\n/);
  const remainingLines = lines.filter(line => {
    return !line.includes(`(${targetPattern1})`) && !line.includes(`(${targetPattern2})`);
  });
  fs.writeFileSync(indexPath, remainingLines.join('\n'), 'utf8');
}

function appendLogEntry(logPath, entries, dateStr) {
  if (!fs.existsSync(logPath)) return false;
  const content = fs.readFileSync(logPath, 'utf8');
  const dateHeading = `## ${dateStr}`;
  const newEntriesText = entries.map(e => `- ${e}`).join('\n');

  if (content.includes(dateHeading)) {
    const parts = content.split(dateHeading);
    const newContent = parts[0] + dateHeading + '\n' + newEntriesText + '\n' + parts[1].replace(/^\r?\n/, '');
    fs.writeFileSync(logPath, newContent, 'utf8');
    return true;
  }

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

function printHelp() {
  console.log(`
OKF Concept Pruner (okf-prune)
Automated lifecycle cleanup, archiving, and garbage collection for OKF bundles.

Usage:
  node okf-prune/scripts/prune.js [options]

Modes:
  --check, --dry-run     Audit bundle for prunable concepts without making modifications.
                         Exits with code 1 if prunable concepts are detected.
  --archive              Move prunable concepts to 'archive/' and mark deprecated (Default action).
  --delete               Permanently remove prunable concept files from disk.

Category Filters (default is all):
  --stale                Target concepts where 'stale_after' timestamp has passed.
  --deprecated           Target concepts with frontmatter 'status: deprecated'.
  --ghosts               Target concepts whose local 'resource' file no longer exists.
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

  const workspaceRoot = process.cwd();
  let bundleRoot = path.join(workspaceRoot, 'docs', 'okf');
  const bundleIdx = args.indexOf('--bundle');
  if (bundleIdx !== -1 && args[bundleIdx + 1]) {
    bundleRoot = path.resolve(workspaceRoot, args[bundleIdx + 1]);
  } else if (!fs.existsSync(bundleRoot)) {
    bundleRoot = path.join(workspaceRoot, 'okf');
  }

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

    // 3. Ghost / missing local resource check
    if (filterGhosts) {
      if (c.fm.resource) {
        const resolvedPath = resolveResourceLocalPath(c.fm.resource, workspaceRoot);
        if (resolvedPath && !fs.existsSync(resolvedPath)) {
          reasons.push(`missing local resource file '${path.relative(workspaceRoot, resolvedPath).replace(/\\/g, '/')}'`);
        }
      }
      if (Array.isArray(c.fm.sources)) {
        for (const src of c.fm.sources) {
          if (src && src.resource) {
            const resolvedPath = resolveResourceLocalPath(src.resource, workspaceRoot);
            if (resolvedPath && !fs.existsSync(resolvedPath)) {
              reasons.push(`missing local source file '${path.relative(workspaceRoot, resolvedPath).replace(/\\/g, '/')}'`);
            }
          }
        }
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
        console.log(`\nRun 'node okf-prune/scripts/prune.js' to archive or '--delete' to remove.`);
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

  // Regenerate visualizer if present
  const vizScript = path.join(workspaceRoot, 'okf-visualize', 'scripts', 'visualize.js');
  if (fs.existsSync(vizScript)) {
    try {
      execFileSync('node', [vizScript, '--bundle', bundleRoot], { stdio: 'ignore' });
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
