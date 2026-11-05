const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

function resolveTelemetryPath(args = []) {
  if (process.env.OKF_DISABLE_TELEMETRY === '1' || process.env.OKF_INTERNAL_CALL === '1') return null;
  const idx = args.indexOf('--telemetry');
  if (idx !== -1 && args[idx + 1]) return path.resolve(args[idx + 1]);
  if (process.env.OKF_TELEMETRY_PATH) return path.resolve(process.env.OKF_TELEMETRY_PATH);
  try {
    const cwdNorm = path.resolve(process.cwd()).toLowerCase();
    const tmpNorm = path.resolve(os.tmpdir()).toLowerCase();
    if (cwdNorm.startsWith(tmpNorm)) return null;
  } catch (e) {}
  return path.join(os.homedir(), '.okf', 'telemetry.jsonl');
}

function recordTelemetry(entry, args = []) {
  const telPath = resolveTelemetryPath(args);
  if (!telPath) return;
  try {
    const dir = path.dirname(telPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload = {
      timestamp: new Date().toISOString(),
      ...entry
    };
    fs.appendFileSync(telPath, JSON.stringify(payload) + '\n', 'utf8');
  } catch (e) {}
}

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

function getConceptBody(content) {
  return content.replace(/^---[\s\S]*?---\r?\n/, '');
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

function collectPrimaryResourceUris(fm) {
  const uris = [];
  if (!fm) return uris;
  if (fm.resource) uris.push(fm.resource);
  if (fm.computation) uris.push(fm.computation);
  if (fm.executor && fm.executor.resource) uris.push(fm.executor.resource);
  if (fm.attester && fm.attester.resource) uris.push(fm.attester.resource);
  return uris;
}

function collectSecondarySourceUris(fm) {
  const uris = [];
  if (!fm || !Array.isArray(fm.sources)) return uris;
  for (const src of fm.sources) {
    const rawResource = typeof src === 'string' ? src : (src && src.resource);
    if (rawResource) uris.push(rawResource);
  }
  return uris;
}

function collectConceptResourceUris(fm) {
  return [...collectPrimaryResourceUris(fm), ...collectSecondarySourceUris(fm)];
}

function scanConcepts(dir, bundleRoot, workspaceRoot, matches = []) {
  if (!fs.existsSync(dir)) return matches;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file.toLowerCase() === 'archive') continue;
      scanConcepts(fullPath, bundleRoot, workspaceRoot, matches);
    } else if (stat.isFile() && file.endsWith('.md')) {
      if (file === 'index.md' || file === 'log.md') continue;
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const fm = parseFrontmatter(content);
        const body = getConceptBody(content);
        if (fm) {
          matches.push({
            relativePath: path.relative(bundleRoot, fullPath).replace(/\\/g, '/'),
            absolutePath: fullPath,
            frontmatter: fm,
            body: body
          });
        }
      } catch (e) {}
    }
  }
  return matches;
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

function tokenizeSearchQuery(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') return [];
  const rawTokens = rawQuery
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.replace(/^[^a-z0-9_./-]+|[^a-z0-9_./-]+$/g, ''))
    .filter(Boolean);
  const stopwords = new Set(['a', 'an', 'the', 'to', 'in', 'on', 'of', 'or', 'and', 'for', 'by', 'is', 'at', 'with', 'from']);
  const meaningful = rawTokens.filter(t => t.length > 2 || !stopwords.has(t));
  return meaningful.length > 0 ? meaningful : rawTokens;
}

function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('--file');
  const searchIndex = args.indexOf('--search');

  if (fileIndex === -1 && searchIndex === -1) {
    console.error('Usage: node okf-query/scripts/query.js --file <path> OR --search <keyword>');
    process.exit(1);
  }

  const { workspaceRoot, bundleRoot } = resolveWorkspaceAndBundle(args);

  if (!fs.existsSync(bundleRoot)) {
    console.error(`Error: OKF bundle not found.`);
    process.exit(1);
  }

  const allConcepts = scanConcepts(bundleRoot, bundleRoot, workspaceRoot);
  const matchedEntries = [];
  const searchKeyword = searchIndex !== -1 && args[searchIndex + 1] ? args[searchIndex + 1].toLowerCase().trim() : null;
  const searchTokens = searchKeyword ? tokenizeSearchQuery(searchKeyword) : [];

  if (fileIndex !== -1) {
    const rawFileArgs = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--file' && args[i + 1]) {
        const parts = args[i + 1].split(',').map(s => s.trim()).filter(Boolean);
        rawFileArgs.push(...parts);
      }
    }

    function matchSingleFile(rawFileArg) {
      const fileMatches = [];
      const wsTarget = path.resolve(workspaceRoot, rawFileArg);
      const cwdTarget = path.resolve(process.cwd(), rawFileArg);
      const targetFile = fs.existsSync(wsTarget) || !fs.existsSync(cwdTarget) ? wsTarget : cwdTarget;
      const targetExists = fs.existsSync(targetFile);
      const normalizedTarget = path.normalize(targetFile).toLowerCase();

      // Tier 1A (primary resource) & Tier 1B (secondary sources): Exact file match or enclosing directory resource
      const tier1Primary = [];
      const tier1Secondary = [];
      for (const c of allConcepts) {
        let matchedPrimary = false;
        for (const uri of collectPrimaryResourceUris(c.frontmatter)) {
          const resPath = resolveResourceLocalPath(uri, workspaceRoot, bundleRoot);
          if (resPath) {
            const normalizedRes = path.normalize(resPath).toLowerCase();
            if (normalizedTarget === normalizedRes || normalizedTarget.startsWith(normalizedRes + path.sep)) {
              tier1Primary.push({ concept: c, matchTier: 'primary' });
              matchedPrimary = true;
              break;
            }
          }
        }
        if (matchedPrimary) continue;

        for (const uri of collectSecondarySourceUris(c.frontmatter)) {
          const resPath = resolveResourceLocalPath(uri, workspaceRoot, bundleRoot);
          if (resPath) {
            const normalizedRes = path.normalize(resPath).toLowerCase();
            if (normalizedTarget === normalizedRes || normalizedTarget.startsWith(normalizedRes + path.sep)) {
              tier1Secondary.push({ concept: c, matchTier: 'secondary' });
              break;
            }
          }
        }
      }
      fileMatches.push(...tier1Primary, ...tier1Secondary);

      // Tier 1C: Suffix / Basename fallback when the queried path does not exist at that exact relative location
      if (fileMatches.length === 0 && !targetExists) {
        const rawRelNorm = rawFileArg.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
        const targetBase = path.basename(normalizedTarget);
        const suffixPrimary = [];
        const suffixSecondary = [];
        const basePrimary = [];
        const baseSecondary = [];

        for (const c of allConcepts) {
          let hitPrimarySuffix = false;
          let hitPrimaryBase = false;
          for (const uri of collectPrimaryResourceUris(c.frontmatter)) {
            const resPath = resolveResourceLocalPath(uri, workspaceRoot, bundleRoot);
            if (!resPath) continue;
            const resRel = path.relative(workspaceRoot, resPath).replace(/\\/g, '/').toLowerCase();
            const resBase = path.basename(resPath).toLowerCase();
            if (rawRelNorm.includes('/') && (resRel === rawRelNorm || resRel.endsWith('/' + rawRelNorm))) {
              suffixPrimary.push({ concept: c, matchTier: 'primary', fallback: 'fallback-suffix' });
              hitPrimarySuffix = true;
              break;
            }
            if (targetBase && resBase === targetBase) {
              basePrimary.push({ concept: c, matchTier: 'primary', fallback: 'fallback-basename' });
              hitPrimaryBase = true;
            }
          }
          if (hitPrimarySuffix) continue;

          for (const uri of collectSecondarySourceUris(c.frontmatter)) {
            const resPath = resolveResourceLocalPath(uri, workspaceRoot, bundleRoot);
            if (!resPath) continue;
            const resRel = path.relative(workspaceRoot, resPath).replace(/\\/g, '/').toLowerCase();
            const resBase = path.basename(resPath).toLowerCase();
            if (rawRelNorm.includes('/') && (resRel === rawRelNorm || resRel.endsWith('/' + rawRelNorm))) {
              suffixSecondary.push({ concept: c, matchTier: 'secondary', fallback: 'fallback-suffix' });
              break;
            }
            if (!hitPrimaryBase && targetBase && resBase === targetBase) {
              baseSecondary.push({ concept: c, matchTier: 'secondary', fallback: 'fallback-basename' });
              break;
            }
          }
        }

        if (suffixPrimary.length > 0 || suffixSecondary.length > 0) {
          fileMatches.push(...suffixPrimary, ...suffixSecondary);
        } else if (basePrimary.length > 0 || baseSecondary.length > 0) {
          fileMatches.push(...basePrimary, ...baseSecondary);
        }
      }

      // Tier 2: Directory / Subsystem match (target resides in the same directory as a documented resource)
      if (fileMatches.length === 0) {
        const wsNorm = path.normalize(workspaceRoot).toLowerCase();
        const tier2Primary = [];
        const tier2Secondary = [];
        for (const c of allConcepts) {
          let matchedDirPrimary = false;
          for (const uri of collectPrimaryResourceUris(c.frontmatter)) {
            const resPath = resolveResourceLocalPath(uri, workspaceRoot, bundleRoot);
            if (resPath) {
              const resDir = path.dirname(path.normalize(resPath)).toLowerCase();
              if (resDir !== wsNorm && (normalizedTarget === resDir || normalizedTarget.startsWith(resDir + path.sep))) {
                tier2Primary.push({ concept: c, matchTier: 'directory' });
                matchedDirPrimary = true;
                break;
              }
            }
          }
          if (matchedDirPrimary) continue;

          for (const uri of collectSecondarySourceUris(c.frontmatter)) {
            const resPath = resolveResourceLocalPath(uri, workspaceRoot, bundleRoot);
            if (resPath) {
              const resDir = path.dirname(path.normalize(resPath)).toLowerCase();
              if (resDir !== wsNorm && (normalizedTarget === resDir || normalizedTarget.startsWith(resDir + path.sep))) {
                tier2Secondary.push({ concept: c, matchTier: 'directory' });
                break;
              }
            }
          }
        }
        fileMatches.push(...tier2Primary, ...tier2Secondary);
      }

      return fileMatches;
    }

    const byRelPath = new Map();
    const tierPriority = { primary: 3, secondary: 2, directory: 1 };
    for (const rawFileArg of rawFileArgs) {
      for (const entry of matchSingleFile(rawFileArg)) {
        const key = entry.concept.relativePath;
        if (!byRelPath.has(key)) {
          byRelPath.set(key, { ...entry });
        } else {
          const existing = byRelPath.get(key);
          if ((tierPriority[entry.matchTier] || 0) > (tierPriority[existing.matchTier] || 0)) {
            existing.matchTier = entry.matchTier;
          }
          if (!existing.fallback && entry.fallback) {
            existing.fallback = entry.fallback;
          }
        }
      }
    }
    const deduped = Array.from(byRelPath.values());
    const primaries = deduped.filter(e => e.matchTier === 'primary');
    const others = deduped.filter(e => e.matchTier !== 'primary');
    matchedEntries.push(...primaries, ...others);
  } else if (searchIndex !== -1 && searchKeyword) {
    const exactAndFullMatches = [];
    const partialMatches = [];

    for (const c of allConcepts) {
      const title = (c.frontmatter.title || '').toLowerCase();
      const desc = (c.frontmatter.description || '').toLowerCase();
      const type = (c.frontmatter.type || '').toLowerCase();
      const runtime = (c.frontmatter.runtime || '').toLowerCase();
      const tags = (c.frontmatter.tags || []).map(t => String(t).toLowerCase());
      const relPath = (c.relativePath || '').toLowerCase();
      const body = c.body.toLowerCase();
      let sourcesText = '';
      for (const uri of collectConceptResourceUris(c.frontmatter)) {
        sourcesText += ' ' + String(uri).toLowerCase();
      }
      if (Array.isArray(c.frontmatter.sources)) {
        for (const src of c.frontmatter.sources) {
          if (src && typeof src === 'object') {
            if (src.title) sourcesText += ' ' + String(src.title).toLowerCase();
            if (src.description) sourcesText += ' ' + String(src.description).toLowerCase();
            if (src.author) sourcesText += ' ' + String(src.author).toLowerCase();
            if (src.id) sourcesText += ' ' + String(src.id).toLowerCase();
          }
        }
      }

      const headerBlob = [title, desc, type, runtime, tags.join(' '), relPath, sourcesText].join(' ');
      const fullBlob = headerBlob + '\n' + body;

      const isHeaderExactPhrase =
        title.includes(searchKeyword) ||
        desc.includes(searchKeyword) ||
        type.includes(searchKeyword) ||
        runtime.includes(searchKeyword) ||
        tags.some(t => t.includes(searchKeyword)) ||
        sourcesText.includes(searchKeyword);
      const isExactPhrase = isHeaderExactPhrase || body.includes(searchKeyword);

      let tokenHitCount = 0;
      let headerTokenHits = 0;
      let weightedScore = (isExactPhrase ? 100 : 0) + (isHeaderExactPhrase ? 50 : 0);
      for (const tok of searchTokens) {
        if (fullBlob.includes(tok)) {
          tokenHitCount++;
          let inHeader = false;
          if (title.includes(tok)) {
            weightedScore += 10;
            inHeader = true;
          }
          if (tags.some(t => t.includes(tok)) || relPath.includes(tok)) {
            weightedScore += 8;
            inHeader = true;
          }
          if (desc.includes(tok)) {
            weightedScore += 6;
            inHeader = true;
          }
          if (sourcesText.includes(tok)) {
            weightedScore += 4;
            inHeader = true;
          }
          if (inHeader) {
            headerTokenHits++;
          } else {
            weightedScore += 1;
          }
        }
      }
      weightedScore += headerTokenHits * 5;

      if (isExactPhrase || (searchTokens.length > 1 && tokenHitCount === searchTokens.length)) {
        exactAndFullMatches.push({ concept: c, tokenHitCount, weightedScore });
      } else if (searchTokens.length >= 2 && tokenHitCount >= Math.max(2, Math.ceil(searchTokens.length * 0.5))) {
        partialMatches.push({ concept: c, tokenHitCount, weightedScore });
      }
    }

    const chosen = exactAndFullMatches.length > 0 ? exactAndFullMatches : partialMatches;
    chosen.sort((a, b) => (b.tokenHitCount - a.tokenHitCount) || (b.weightedScore - a.weightedScore));
    for (const item of chosen) {
      matchedEntries.push({ concept: item.concept, matchTier: 'search' });
    }
  }

  if (matchedEntries.length === 0) {
    if (fileIndex !== -1) {
      const relTarget = path.relative(workspaceRoot, path.resolve(workspaceRoot, args[fileIndex + 1]));
      console.log(`No matching OKF concepts found for file: ${relTarget}`);
      console.log(`Tip: Try searching by keyword: node okf-query/scripts/query.js --search <module-or-topic>`);
      console.log(`Or inspect the catalog index at: ${fs.existsSync(path.join(bundleRoot, 'index.md')) ? path.relative(workspaceRoot, path.join(bundleRoot, 'index.md')).replace(/\\/g, '/') : 'docs/okf/index.md'}`);
    } else {
      console.log('No matching OKF concepts found.');
    }
    const durationMs = Date.now() - startTime;
    const anomalies = ['query_miss'];
    if (durationMs > 2000) anomalies.push('slow_exec');
    recordTelemetry({
      skill: 'okf-query',
      workspaceRoot,
      mode: fileIndex !== -1 ? 'file' : 'search',
      query: fileIndex !== -1 ? args[fileIndex + 1] : args[searchIndex + 1],
      matchCount: 0,
      matchTiers: [],
      outputBytes: 0,
      durationMs,
      anomalies
    }, args);
    return;
  }

  const forceFull = args.includes('--full');
  const MAX_CONCEPT_CHARS = 12000;
  const MAX_TOTAL_BODY_CHARS = 24000;
  const MAX_FILE_FULL_CONCEPTS = 3;
  const MAX_SEARCH_FULL_CONCEPTS = 5;
  let totalBodyCharsPrinted = 0;

  function formatConceptBody(concept, maxChars = MAX_CONCEPT_CHARS) {
    const trimmed = concept.body.trim();
    if (forceFull || trimmed.length <= maxChars) {
      return trimmed;
    }

    const lines = trimmed.split(/\r?\n/);
    const sections = [];
    let current = { heading: '(Introduction)', lines: [] };
    for (const line of lines) {
      if (/^#{1,3}\s+/.test(line)) {
        if (current.lines.length > 0 || current.heading !== '(Introduction)') {
          sections.push(current);
        }
        current = { heading: line.trim(), lines: [line] };
      } else {
        current.lines.push(line);
      }
    }
    if (current.lines.length > 0) sections.push(current);

    const toc = sections
      .filter(s => s.heading !== '(Introduction)')
      .map(s => '  ' + s.heading)
      .join('\n');

    if (searchKeyword) {
      let matchingSections = sections.filter(s =>
        s.heading.toLowerCase().includes(searchKeyword) ||
        s.lines.join('\n').toLowerCase().includes(searchKeyword)
      );
      if (matchingSections.length === 0 && searchTokens.length > 1) {
        matchingSections = sections.filter(s => {
          const secText = (s.heading + '\n' + s.lines.join('\n')).toLowerCase();
          return searchTokens.some(tok => secText.includes(tok));
        });
      }
      if (matchingSections.length > 0) {
        const excerpt = matchingSections.map(s => s.lines.join('\n').trim()).join('\n\n---\n\n');
        if (excerpt.length <= maxChars) {
          return `[Concept Outline (${concept.relativePath})]\n${toc}\n\n[Matching Sections for "${args[searchIndex + 1]}"]\n${excerpt}\n\n(Note: Showing matching sections from ${concept.relativePath} [${trimmed.length} chars total]. Pass --full to print entire concept.)`;
        }
      }
    }

    return `${trimmed.slice(0, maxChars)}\n\n... [Truncated at ${maxChars} of ${trimmed.length} chars from ${concept.relativePath}. Pass --full or read ${concept.relativePath} directly for remaining sections]\nSection Outline:\n${toc}`;
  }

  // Format and output matched concepts
  let outputBytes = 0;
  const origConsoleLog = console.log;
  console.log = (...logArgs) => {
    outputBytes += Buffer.byteLength(logArgs.map(String).join(' ') + '\n', 'utf8');
    origConsoleLog(...logArgs);
  };
  console.log(`=== OKF CONTEXT BLOCK (${matchedEntries.length} concept(s) found) ===\n`);
  for (let idx = 0; idx < matchedEntries.length; idx++) {
    const entry = matchedEntries[idx];
    const c = entry.concept;
    console.log(`[Concept: ${c.frontmatter.title || c.relativePath}]`);
    console.log(`File:        ${c.relativePath}`);
    console.log(`Type:        ${c.frontmatter.type}`);
    if (c.frontmatter.description) console.log(`Description: ${c.frontmatter.description}`);
    if (c.frontmatter.resource)    console.log(`Resource:    ${c.frontmatter.resource}`);
    if (c.frontmatter.runtime)     console.log(`Runtime:     ${c.frontmatter.runtime}`);
    if (c.frontmatter.computation) console.log(`Computation: ${c.frontmatter.computation}`);
    if (c.frontmatter.tags)        console.log(`Tags:        ${c.frontmatter.tags.join(', ')}`);
    if (c.frontmatter.status)      console.log(`Status:      ${c.frontmatter.status}`);
    if (c.frontmatter.stale_after) console.log(`Stale After: ${c.frontmatter.stale_after}`);
    
    let trustTier = 'unverified';
    if (c.frontmatter.verified) {
      const verifications = Array.isArray(c.frontmatter.verified) ? c.frontmatter.verified : [c.frontmatter.verified];
      const hasHuman = verifications.some(v => v && v.by && String(v.by).startsWith('human:'));
      trustTier = hasHuman ? 'human-reviewed' : 'machine-confirmed';
    }
    console.log(`Trust Tier:  ${trustTier}`);
    
    console.log(`----------------------------------------`);
    const remainingBudget = MAX_TOTAL_BODY_CHARS - totalBodyCharsPrinted;
    const withinCountBudget =
      entry.matchTier === 'search'
        ? idx < MAX_SEARCH_FULL_CONCEPTS
        : (entry.matchTier === 'primary' || idx < MAX_FILE_FULL_CONCEPTS);
    const shouldPrintFull =
      forceFull || (withinCountBudget && (idx === 0 || remainingBudget >= 1500));

    if (shouldPrintFull) {
      const perConceptBudget = forceFull
        ? MAX_CONCEPT_CHARS
        : (idx === 0 ? MAX_CONCEPT_CHARS : Math.min(MAX_CONCEPT_CHARS, Math.max(2000, remainingBudget)));
      const renderedBody = formatConceptBody(c, perConceptBudget);
      totalBodyCharsPrinted += renderedBody.length;
      console.log(renderedBody);
    } else if (!withinCountBudget && entry.matchTier === 'search') {
      console.log(`(Additional search match [${idx + 1} of ${matchedEntries.length}]. Read ${c.relativePath} or pass --full for full concept body.)`);
    } else if (!withinCountBudget) {
      console.log(`(Matched via secondary sources: binding [${idx + 1} of ${matchedEntries.length}]. Read ${c.relativePath} or pass --full for full concept body.)`);
    } else {
      console.log(`(Omitted full body to stay within cumulative context budget [${idx + 1} of ${matchedEntries.length}]. Read ${c.relativePath} or pass --full for full concept body.)`);
    }
    console.log(`\n========================================\n`);
  }
  console.log = origConsoleLog;

  const durationMs = Date.now() - startTime;
  const matchTiers = Array.from(new Set(matchedEntries.map(e => e.fallback || e.matchTier)));
  const anomalies = [];
  if (matchTiers.some(t => t === 'fallback-suffix' || t === 'fallback-basename' || t === 'directory')) {
    anomalies.push('fallback_used');
  }
  if (outputBytes > 40000) anomalies.push('context_bloat');
  if (durationMs > 2000) anomalies.push('slow_exec');
  recordTelemetry({
    skill: 'okf-query',
    workspaceRoot,
    mode: fileIndex !== -1 ? 'file' : 'search',
    query: fileIndex !== -1 ? args[fileIndex + 1] : args[searchIndex + 1],
    matchCount: matchedEntries.length,
    matchTiers,
    outputBytes,
    durationMs,
    anomalies
  }, args);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseFrontmatter,
  scanConcepts,
  collectConceptResourceUris,
  collectPrimaryResourceUris,
  collectSecondarySourceUris,
  recordTelemetry
};
