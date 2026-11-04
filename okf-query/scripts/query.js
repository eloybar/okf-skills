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

function getConceptBody(content) {
  return content.replace(/^---[\s\S]*?---\r?\n/, '');
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

function collectConceptResourceUris(fm) {
  const uris = [];
  if (!fm) return uris;
  if (fm.resource) uris.push(fm.resource);
  if (Array.isArray(fm.sources)) {
    for (const src of fm.sources) {
      const rawResource = typeof src === 'string' ? src : (src && src.resource);
      if (rawResource) uris.push(rawResource);
    }
  }
  if (fm.computation) uris.push(fm.computation);
  if (fm.executor && fm.executor.resource) uris.push(fm.executor.resource);
  if (fm.attester && fm.attester.resource) uris.push(fm.attester.resource);
  return uris;
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
  const matched = [];
  const searchKeyword = searchIndex !== -1 && args[searchIndex + 1] ? args[searchIndex + 1].toLowerCase().trim() : null;
  const searchTokens = searchKeyword ? tokenizeSearchQuery(searchKeyword) : [];

  if (fileIndex !== -1) {
    const rawFileArg = args[fileIndex + 1];
    const wsTarget = path.resolve(workspaceRoot, rawFileArg);
    const cwdTarget = path.resolve(process.cwd(), rawFileArg);
    const targetFile = fs.existsSync(wsTarget) || !fs.existsSync(cwdTarget) ? wsTarget : cwdTarget;
    const normalizedTarget = path.normalize(targetFile).toLowerCase();

    // Tier 1: Exact file match or resource is a directory enclosing target
    for (const c of allConcepts) {
      const resourceUris = collectConceptResourceUris(c.frontmatter);

      for (const uri of resourceUris) {
        const resPath = resolveResourceLocalPath(uri, workspaceRoot, bundleRoot);
        if (resPath) {
          const normalizedRes = path.normalize(resPath).toLowerCase();
          if (normalizedTarget === normalizedRes || normalizedTarget.startsWith(normalizedRes + path.sep)) {
            matched.push(c);
            break;
          }
        }
      }
    }

    // Tier 2: Directory / Subsystem match (target resides in the same directory as a documented resource)
    if (matched.length === 0) {
      for (const c of allConcepts) {
        const resourceUris = collectConceptResourceUris(c.frontmatter);

        for (const uri of resourceUris) {
          const resPath = resolveResourceLocalPath(uri, workspaceRoot, bundleRoot);
          if (resPath) {
            const resDir = path.dirname(path.normalize(resPath)).toLowerCase();
            const wsNorm = path.normalize(workspaceRoot).toLowerCase();
            if (resDir !== wsNorm && (normalizedTarget === resDir || normalizedTarget.startsWith(resDir + path.sep))) {
              matched.push(c);
              break;
            }
          }
        }
      }
    }
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

      const isExactPhrase =
        title.includes(searchKeyword) ||
        desc.includes(searchKeyword) ||
        type.includes(searchKeyword) ||
        runtime.includes(searchKeyword) ||
        tags.some(t => t.includes(searchKeyword)) ||
        sourcesText.includes(searchKeyword) ||
        body.includes(searchKeyword);

      let tokenHitCount = 0;
      let weightedScore = isExactPhrase ? 100 : 0;
      for (const tok of searchTokens) {
        if (fullBlob.includes(tok)) {
          tokenHitCount++;
          if (title.includes(tok)) weightedScore += 5;
          else if (tags.some(t => t.includes(tok)) || relPath.includes(tok)) weightedScore += 4;
          else if (desc.includes(tok) || sourcesText.includes(tok)) weightedScore += 3;
          else weightedScore += 1;
        }
      }

      if (isExactPhrase || (searchTokens.length > 1 && tokenHitCount === searchTokens.length)) {
        exactAndFullMatches.push({ concept: c, tokenHitCount, weightedScore });
      } else if (searchTokens.length >= 2 && tokenHitCount >= Math.max(2, Math.ceil(searchTokens.length * 0.5))) {
        partialMatches.push({ concept: c, tokenHitCount, weightedScore });
      }
    }

    const chosen = exactAndFullMatches.length > 0 ? exactAndFullMatches : partialMatches;
    chosen.sort((a, b) => (b.tokenHitCount - a.tokenHitCount) || (b.weightedScore - a.weightedScore));
    for (const item of chosen) {
      matched.push(item.concept);
    }
  }

  if (matched.length === 0) {
    if (fileIndex !== -1) {
      const relTarget = path.relative(workspaceRoot, path.resolve(workspaceRoot, args[fileIndex + 1]));
      console.log(`No matching OKF concepts found for file: ${relTarget}`);
      console.log(`Tip: Try searching by keyword: node okf-query/scripts/query.js --search <module-or-topic>`);
      console.log(`Or inspect the catalog index at: ${fs.existsSync(path.join(bundleRoot, 'index.md')) ? path.relative(workspaceRoot, path.join(bundleRoot, 'index.md')).replace(/\\/g, '/') : 'docs/okf/index.md'}`);
    } else {
      console.log('No matching OKF concepts found.');
    }
    return;
  }

  const forceFull = args.includes('--full');
  const MAX_CONCEPT_CHARS = 12000;

  function formatConceptBody(concept) {
    const trimmed = concept.body.trim();
    if (forceFull || trimmed.length <= MAX_CONCEPT_CHARS) {
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
        if (excerpt.length <= MAX_CONCEPT_CHARS) {
          return `[Concept Outline (${concept.relativePath})]\n${toc}\n\n[Matching Sections for "${args[searchIndex + 1]}"]\n${excerpt}\n\n(Note: Showing matching sections from ${concept.relativePath} [${trimmed.length} chars total]. Pass --full to print entire concept.)`;
        }
      }
    }

    return `${trimmed.slice(0, MAX_CONCEPT_CHARS)}\n\n... [Truncated at ${MAX_CONCEPT_CHARS} of ${trimmed.length} chars from ${concept.relativePath}. Pass --full or read ${concept.relativePath} directly for remaining sections]\nSection Outline:\n${toc}`;
  }

  // Format and output matched concepts
  console.log(`=== OKF CONTEXT BLOCK (${matched.length} concept(s) found) ===\n`);
  for (const c of matched) {
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
    console.log(formatConceptBody(c));
    console.log(`\n========================================\n`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseFrontmatter,
  scanConcepts,
  collectConceptResourceUris
};
