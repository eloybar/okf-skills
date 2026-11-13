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
  const dirIdx = args.indexOf('--dir');
  const optIdx = bundleIdx !== -1 ? bundleIdx : dirIdx;
  if (optIdx !== -1 && args[optIdx + 1]) {
    const candidate = path.resolve(cwd, args[optIdx + 1]);
    let bundleRoot = candidate;
    if (!fs.existsSync(path.join(candidate, 'index.md')) && fs.existsSync(path.join(candidate, 'docs', 'okf'))) {
      bundleRoot = path.join(candidate, 'docs', 'okf');
    } else if (!fs.existsSync(path.join(candidate, 'index.md')) && fs.existsSync(path.join(candidate, 'okf'))) {
      bundleRoot = path.join(candidate, 'okf');
    }
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

const SEARCH_STOPWORDS = new Set(['a', 'an', 'the', 'to', 'in', 'on', 'of', 'or', 'and', 'for', 'by', 'is', 'at', 'with', 'from']);
const ROOT_HYGIENE_FILES = new Set([
  '.gitignore', '.gitattributes', '.gitmodules', '.editorconfig',
  '.nvmrc', '.node-version', '.npmrc', '.yarnrc', '.yarnrc.yml',
  '.prettierignore', '.eslintignore', '.dockerignore', '.stylelintignore',
  'license', 'license.md', 'license.txt', 'skills-lock.json'
]);
const GIT_HYGIENE_FILES = new Set(['.gitignore', '.gitattributes', '.gitmodules']);

function isRootHygieneFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const cleaned = filePath.trim().replace(/\\/g, '/').replace(/^\.?\//, '');
  if (!cleaned) return false;
  const base = path.basename(cleaned).toLowerCase();
  return ROOT_HYGIENE_FILES.has(base);
}
const GENERIC_SUBTOKEN_STOPWORDS = new Set([
  'api', 'src', 'lib', 'app', 'pkg', 'bin', 'cmd', 'cli', 'get', 'set', 'use', 'has', 'can',
  'new', 'old', 'all', 'one', 'two', 'ids', 'idx', 'val', 'res', 'req', 'err', 'msg', 'str',
  'num', 'obj', 'arr', 'cfg', 'opt', 'btn', 'handler'
]);
const GENERIC_HEADER_RESCUE_STOPWORDS = new Set([
  'concept', 'concepts', 'skill', 'skills', 'playbook', 'playbooks', 'subsystem', 'subsystems',
  'decision', 'decisions', 'utility', 'system', 'service', 'services', 'module', 'specification',
  'architecture', 'guide', 'overview', 'config', 'configuration'
]);

function extractCasePreservedTerms(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') return [];
  const rawTerms = rawQuery
    // Agents often mirror --file syntax and pass comma/semicolon-separated keywords.
    .split(/[\s,;]+/)
    .map(t => t.replace(/^[^a-zA-Z0-9_./-]+|[^a-zA-Z0-9_./-]+$/g, ''))
    .filter(Boolean);
  const meaningful = rawTerms.filter(t => t.length > 2 || !SEARCH_STOPWORDS.has(t.toLowerCase()));
  return meaningful.length > 0 ? meaningful : rawTerms;
}

function tokenizeSearchQuery(rawQuery) {
  return extractCasePreservedTerms(rawQuery).map(t => t.toLowerCase());
}

function expandCompoundSubTokens(rawTerm) {
  if (!rawTerm || typeof rawTerm !== 'string') return [];
  const tokLower = rawTerm.toLowerCase();
  const splitCamel = rawTerm
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  const parts = splitCamel
    .split(/[\s/\\._:-]+/)
    .map(p => p.toLowerCase().trim())
    .filter(p => p.length >= 3 && p !== tokLower && !SEARCH_STOPWORDS.has(p) && !GENERIC_SUBTOKEN_STOPWORDS.has(p));
  return Array.from(new Set(parts));
}

function rankSearchMatches(allConcepts, rawSearchString) {
  if (!rawSearchString || typeof rawSearchString !== 'string' || !Array.isArray(allConcepts) || allConcepts.length === 0) {
    return [];
  }
  const searchKeyword = rawSearchString.toLowerCase().trim();
  if (!searchKeyword) return [];

  const caseTerms = extractCasePreservedTerms(rawSearchString);
  const termGroups = caseTerms.map(rawTerm => {
    const tok = rawTerm.toLowerCase();
    const strippedSlash = tok.replace(/^\/+|\/+$/g, '');
    return {
      rawTerm,
      tok,
      strippedSlash: strippedSlash && strippedSlash !== tok ? strippedSlash : null,
      subTokens: expandCompoundSubTokens(rawTerm)
    };
  });
  const searchTokens = termGroups.map(g => g.tok);
  const hasAnySubTokens = termGroups.some(g => g.subTokens.length > 0);

  const exactAndFullMatches = [];
  const partialMatches = [];
  const preparedConcepts = [];

  for (const c of allConcepts) {
    const fm = c.frontmatter || {};
    const title = (fm.title || '').toLowerCase();
    const desc = (fm.description || '').toLowerCase();
    const type = (fm.type || '').toLowerCase();
    const runtime = (fm.runtime || '').toLowerCase();
    const tags = (fm.tags || []).map(t => String(t).toLowerCase());
    const relPath = (c.relativePath || c.file || '').toLowerCase();
    const body = (c.body || '').toLowerCase();
    let sourcesText = '';
    for (const uri of collectConceptResourceUris(fm)) {
      sourcesText += ' ' + String(uri).toLowerCase();
    }
    if (Array.isArray(fm.sources)) {
      for (const src of fm.sources) {
        if (src && typeof src === 'object') {
          if (src.title) sourcesText += ' ' + String(src.title).toLowerCase();
          if (src.description) sourcesText += ' ' + String(src.description).toLowerCase();
          if (src.author) sourcesText += ' ' + String(src.author).toLowerCase();
          if (src.id) sourcesText += ' ' + String(src.id).toLowerCase();
        }
      }
    }

    const identityHeaderBlob = [title, tags.join(' '), relPath, sourcesText].join(' ');
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
    for (const group of termGroups) {
      const tok = group.tok;
      const alt = group.strippedSlash;
      const matchedFull = fullBlob.includes(tok) || (alt && fullBlob.includes(alt));
      if (matchedFull) {
        tokenHitCount++;
        let inHeader = false;
        if (title.includes(tok) || (alt && title.includes(alt))) {
          weightedScore += 10;
          inHeader = true;
        }
        if (tags.some(t => t.includes(tok) || (alt && t.includes(alt))) || relPath.includes(tok) || (alt && relPath.includes(alt))) {
          weightedScore += 8;
          inHeader = true;
        }
        if (desc.includes(tok) || (alt && desc.includes(alt))) {
          weightedScore += 6;
          inHeader = true;
        }
        if (sourcesText.includes(tok) || (alt && sourcesText.includes(alt))) {
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

    preparedConcepts.push({
      concept: c,
      title,
      desc,
      tags,
      relPath,
      sourcesText,
      identityHeaderBlob,
      headerBlob,
      fullBlob,
      tokenHitCount,
      headerTokenHits,
      weightedScore
    });
  }

  let chosen = exactAndFullMatches.length > 0 ? exactAndFullMatches : partialMatches;

  // Fallback rescues when multi-keyword queries have 0 raw-token matches (e.g. camelCase identifiers or /api/... routes)
  if (chosen.length === 0 && termGroups.length >= 2) {
    if (hasAnySubTokens) {
      const compoundRescue = [];
      const minCovered = Math.max(2, Math.ceil(termGroups.length * 0.5));
      for (const item of preparedConcepts) {
        let coveredTerms = 0;
        let compoundHeaderHits = 0;
        let subScore = item.weightedScore;
        for (const group of termGroups) {
          const fullMatched =
            item.fullBlob.includes(group.tok) ||
            (group.strippedSlash && item.fullBlob.includes(group.strippedSlash));
          if (fullMatched) {
            coveredTerms++;
            if (
              item.headerBlob.includes(group.tok) ||
              (group.strippedSlash && item.headerBlob.includes(group.strippedSlash))
            ) {
              compoundHeaderHits++;
            }
            continue;
          }
          if (group.subTokens.length > 0) {
            let anySubHit = false;
            let anySubHeader = false;
            for (const st of group.subTokens) {
              if (item.fullBlob.includes(st)) {
                anySubHit = true;
                if (item.headerBlob.includes(st)) {
                  anySubHeader = true;
                  subScore += 3;
                } else {
                  subScore += 1;
                }
              }
            }
            if (anySubHit) {
              coveredTerms++;
              if (anySubHeader) compoundHeaderHits++;
            }
          }
        }
        if (coveredTerms >= minCovered && (item.tokenHitCount >= 1 || compoundHeaderHits >= 2)) {
          compoundRescue.push({
            concept: item.concept,
            tokenHitCount: coveredTerms * 10 + item.tokenHitCount,
            weightedScore: subScore
          });
        }
      }
      if (compoundRescue.length > 0) {
        chosen = compoundRescue;
      }
    }

    if (chosen.length === 0) {
      // Selective structural-header rescue when one specific identifier/file token matches title/tags/relPath/sources
      const maxAllowedDf = Math.max(3, Math.ceil(allConcepts.length * 0.25));
      const selectiveTokens = [];
      for (const group of termGroups) {
        const tok = group.tok;
        if (tok.length < 4 || GENERIC_HEADER_RESCUE_STOPWORDS.has(tok) || SEARCH_STOPWORDS.has(tok)) continue;
        let df = 0;
        for (const item of preparedConcepts) {
          if (item.identityHeaderBlob.includes(tok) || (group.strippedSlash && item.identityHeaderBlob.includes(group.strippedSlash))) {
            df++;
          }
        }
        if (df > 0 && df <= maxAllowedDf && (allConcepts.length < 2 || df < allConcepts.length)) {
          selectiveTokens.push(group);
        }
      }
      if (selectiveTokens.length > 0) {
        const headerRescue = [];
        for (const item of preparedConcepts) {
          let rescueHits = 0;
          for (const group of selectiveTokens) {
            if (item.identityHeaderBlob.includes(group.tok) || (group.strippedSlash && item.identityHeaderBlob.includes(group.strippedSlash))) {
              rescueHits++;
            }
          }
          if (rescueHits > 0) {
            headerRescue.push({
              concept: item.concept,
              tokenHitCount: rescueHits,
              weightedScore: item.weightedScore
            });
          }
        }
        chosen = headerRescue;
      }
    }
  }

  chosen.sort((a, b) => (b.tokenHitCount - a.tokenHitCount) || (b.weightedScore - a.weightedScore));
  return chosen;
}

function printHelp() {
  console.log(`
OKF Query (v0.2) — Context Retrieval & Prompt Injection Engine
Usage: node okf-query/scripts/query.js (--file <path[,path2,...]> | --search <query>) [options]

Modes:
  --file <path[,...]>    Retrieve concepts matching one or more file paths (comma/space-separated or repeated).
  --search <query>       Search active concepts by title, tags, description, resources, runtime, or body text.

Options:
  --full                 Print full concept bodies without per-concept or secondary-source compaction.
  --bundle <path>        Custom OKF bundle path (default: 'docs/okf' or 'okf').
  -h, --help             Show this help message and exit.
`);
}

function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }
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
  const rawSearchArgs = [];
  if (searchIndex !== -1) {
    for (let i = searchIndex + 1; i < args.length; i++) {
      if (String(args[i]).startsWith('--')) break;
      rawSearchArgs.push(String(args[i]).trim());
    }
  }
  const rawSearchString = rawSearchArgs.filter(Boolean).join(' ');
  const searchKeyword = rawSearchString ? rawSearchString.toLowerCase().trim() : null;
  const searchTokens = searchKeyword ? tokenizeSearchQuery(searchKeyword) : [];
  const rawFileArgs = [];
  const missingQueriedFiles = [];

  if (fileIndex !== -1) {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--file') {
        let j = i + 1;
        while (j < args.length && !String(args[j]).startsWith('--')) {
          const val = Array.isArray(args[j]) ? args[j].join(',') : String(args[j]);
          const parts = val.split(',').map(s => s.trim()).filter(Boolean);
          rawFileArgs.push(...parts);
          j++;
        }
        i = j - 1;
      }
    }

    function matchSingleFile(rawFileArg) {
      const fileMatches = [];
      const wsTarget = path.resolve(workspaceRoot, rawFileArg);
      const cwdTarget = path.resolve(process.cwd(), rawFileArg);
      const strippedBundleRel = rawFileArg.replace(/^[\/\\]+/, '').replace(/^(?:docs[\/\\])?okf[\/\\]/i, '');
      const bundleTarget = path.resolve(bundleRoot, strippedBundleRel);
      const targetFile = fs.existsSync(wsTarget)
        ? wsTarget
        : (fs.existsSync(cwdTarget) ? cwdTarget : (fs.existsSync(bundleTarget) ? bundleTarget : wsTarget));
      const targetExists = fs.existsSync(targetFile);
      const normalizedTarget = path.normalize(targetFile).toLowerCase();

      // Tier 1A (primary resource / direct concept file) & Tier 1B (secondary sources): Exact file match or enclosing directory resource
      const tier1Primary = [];
      const tier1Secondary = [];
      for (const c of allConcepts) {
        if (path.normalize(c.absolutePath).toLowerCase() === normalizedTarget) {
          tier1Primary.push({ concept: c, matchTier: 'primary' });
          continue;
        }
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
          if (rawRelNorm.endsWith('.md')) {
            const cRel = String(c.relativePath || '').replace(/\\/g, '/').toLowerCase();
            const cBase = path.basename(cRel);
            if (rawRelNorm.includes('/') && (cRel === rawRelNorm || cRel.endsWith('/' + rawRelNorm))) {
              suffixPrimary.push({ concept: c, matchTier: 'primary', fallback: 'fallback-suffix' });
              continue;
            }
            if (targetBase && cBase === targetBase) {
              basePrimary.push({ concept: c, matchTier: 'primary', fallback: 'fallback-basename' });
              hitPrimaryBase = true;
            }
          }
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

      // Tier 2B: Root repository hygiene/config file fallback (e.g. .gitignore, .gitattributes, LICENSE)
      if (fileMatches.length === 0 && isRootHygieneFile(rawFileArg)) {
        const baseName = path.basename(normalizedTarget).toLowerCase();
        if (GIT_HYGIENE_FILES.has(baseName)) {
          for (const c of allConcepts) {
            const fm = c.frontmatter || {};
            const rel = (c.relativePath || '').toLowerCase();
            const title = (fm.title || '').toLowerCase();
            const tags = (fm.tags || []).map(t => String(t).toLowerCase());
            if (rel.includes('git') || title.includes('git') || tags.includes('git')) {
              fileMatches.push({ concept: c, matchTier: 'root-config' });
            }
          }
        }
        if (fileMatches.length === 0) {
          const rootReadme = path.normalize(path.join(workspaceRoot, 'README.md')).toLowerCase();
          const rootPkg = path.normalize(path.join(workspaceRoot, 'package.json')).toLowerCase();
          for (const c of allConcepts) {
            for (const uri of collectPrimaryResourceUris(c.frontmatter)) {
              const resPath = resolveResourceLocalPath(uri, workspaceRoot, bundleRoot);
              if (resPath) {
                const normRes = path.normalize(resPath).toLowerCase();
                if (normRes === rootReadme || normRes === rootPkg) {
                  fileMatches.push({ concept: c, matchTier: 'root-config' });
                  break;
                }
              }
            }
            if (fileMatches.length > 0) break;
          }
        }
      }

      if (!targetExists && fileMatches.length > 0 && !missingQueriedFiles.includes(rawFileArg)) {
        missingQueriedFiles.push(rawFileArg);
      }

      return fileMatches;
    }

    const byRelPath = new Map();
    const tierPriority = { primary: 3, secondary: 2, directory: 1, 'root-config': 1 };
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
    const chosen = rankSearchMatches(allConcepts, rawSearchString);
    for (const item of chosen) {
      matchedEntries.push({ concept: item.concept, matchTier: 'search' });
    }
  }

  const effectiveQueryLabel = fileIndex !== -1 ? rawFileArgs.join(',') : rawSearchString;
  if (matchedEntries.length === 0) {
    const isAllRootHygiene = fileIndex !== -1 && rawFileArgs.length > 0 && rawFileArgs.every(isRootHygieneFile);
    if (fileIndex !== -1) {
      const relTarget = path.relative(workspaceRoot, path.resolve(workspaceRoot, rawFileArgs[0] || args[fileIndex + 1] || ''));
      if (isAllRootHygiene) {
        console.log(`No matching OKF concepts found for file: ${relTarget} (repository hygiene/config file — no concept binding required)`);
      } else {
        console.log(`No matching OKF concepts found for file: ${relTarget}`);
        console.log(`Tip: Try searching by keyword: node okf-query/scripts/query.js --search <module-or-topic>`);
        console.log(`Or inspect the catalog index at: ${fs.existsSync(path.join(bundleRoot, 'index.md')) ? path.relative(workspaceRoot, path.join(bundleRoot, 'index.md')).replace(/\\/g, '/') : 'docs/okf/index.md'}`);
      }
    } else if (rawSearchString) {
      console.log(`No matching OKF concepts found for search: ${rawSearchString}`);
    } else {
      console.log('No matching OKF concepts found.');
    }
    const durationMs = Date.now() - startTime;
    const anomalies = isAllRootHygiene ? [] : ['query_miss'];
    if (durationMs > 2000) anomalies.push('slow_exec');
    recordTelemetry({
      skill: 'okf-query',
      workspaceRoot,
      mode: fileIndex !== -1 ? 'file' : 'search',
      query: effectiveQueryLabel,
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
  const MAX_TOTAL_BODY_CHARS = 20000;
  const MAX_FULL_SEARCH_BODY_CHARS = 32000;
  const MAX_FILE_FULL_CONCEPTS = 3;
  const MAX_SEARCH_FULL_CONCEPTS = 5;
  const MAX_DISPLAYED_MATCHES = 10;
  const isMultiSearchFull = forceFull && searchIndex !== -1 && matchedEntries.length > 1;
  let totalBodyCharsPrinted = 0;

  function formatConceptBody(concept, maxChars = MAX_CONCEPT_CHARS) {
    const trimmed = concept.body.trim();
    if ((forceFull && !isMultiSearchFull) || trimmed.length <= maxChars) {
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
        const subToks = extractCasePreservedTerms(rawSearchString).flatMap(expandCompoundSubTokens);
        const allSectionTokens = Array.from(new Set([...searchTokens, ...subToks]));
        matchingSections = sections.filter(s => {
          const secText = (s.heading + '\n' + s.lines.join('\n')).toLowerCase();
          return allSectionTokens.some(tok => secText.includes(tok));
        });
      }
      if (matchingSections.length > 0) {
        const excerpt = matchingSections.map(s => s.lines.join('\n').trim()).join('\n\n---\n\n');
        if (excerpt.length <= maxChars) {
          return `[Concept Outline (${concept.relativePath})]\n${toc}\n\n[Matching Sections for "${rawSearchString}"]\n${excerpt}\n\n(Note: Showing matching sections from ${concept.relativePath} [${trimmed.length} chars total]. Pass --full to print entire concept.)`;
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
  if (missingQueriedFiles.length > 0) {
    console.log(`Note: Queried path(s) not found on disk: ${missingQueriedFiles.join(', ')} (matched via fallback/directory — check Resource/Sources below for exact file paths).\n`);
  }
  const displayedCount = forceFull ? matchedEntries.length : Math.min(matchedEntries.length, MAX_DISPLAYED_MATCHES);
  for (let idx = 0; idx < displayedCount; idx++) {
    const entry = matchedEntries[idx];
    const c = entry.concept;
    const effectiveTotalBudget = isMultiSearchFull ? MAX_FULL_SEARCH_BODY_CHARS : MAX_TOTAL_BODY_CHARS;
    const remainingBudget = effectiveTotalBudget - totalBodyCharsPrinted;
    const withinCountBudget =
      entry.matchTier === 'search'
        ? idx < MAX_SEARCH_FULL_CONCEPTS
        : (entry.matchTier === 'primary' || idx < MAX_FILE_FULL_CONCEPTS);
    const shouldPrintFull = isMultiSearchFull
      ? (idx === 0 || remainingBudget >= 1500)
      : (forceFull || (withinCountBudget && (idx === 0 || remainingBudget >= 1500)));

    console.log(`[Concept: ${c.frontmatter.title || c.relativePath}]`);
    console.log(`File:        ${c.relativePath}`);
    console.log(`Type:        ${c.frontmatter.type}`);
    if (shouldPrintFull) {
      if (c.frontmatter.description) console.log(`Description: ${c.frontmatter.description}`);
      if (c.frontmatter.resource)    console.log(`Resource:    ${c.frontmatter.resource}`);
      const secondaryUris = collectSecondarySourceUris(c.frontmatter);
      if (secondaryUris.length > 0) {
        const previewUris = secondaryUris.slice(0, 8);
        const moreSuffix = secondaryUris.length > 8 ? ` (+${secondaryUris.length - 8} more)` : '';
        console.log(`Sources:     ${previewUris.join(', ')}${moreSuffix}`);
      }
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
    }

    console.log(`----------------------------------------`);
    if (shouldPrintFull) {
      const perConceptBudget = isMultiSearchFull
        ? (idx === 0 ? MAX_FULL_SEARCH_BODY_CHARS : Math.max(1500, remainingBudget))
        : (forceFull
            ? MAX_CONCEPT_CHARS
            : (idx === 0 ? MAX_CONCEPT_CHARS : Math.min(MAX_CONCEPT_CHARS, Math.max(2000, remainingBudget))));
      const renderedBody = formatConceptBody(c, perConceptBudget);
      totalBodyCharsPrinted += renderedBody.length;
      console.log(renderedBody);
    } else if (!withinCountBudget && entry.matchTier === 'search') {
      console.log(`(Additional search match [${idx + 1} of ${matchedEntries.length}]. Query --file ${c.relativePath} --full or read ${c.relativePath} for full concept body.)`);
    } else if (!withinCountBudget) {
      console.log(`(Matched via secondary sources: binding [${idx + 1} of ${matchedEntries.length}]. Read ${c.relativePath} or pass --full for full concept body.)`);
    } else {
      console.log(`(Omitted full body to stay within cumulative context budget [${idx + 1} of ${matchedEntries.length}]. Query --file ${c.relativePath} --full or read ${c.relativePath} for full concept body.)`);
    }
    console.log(`\n========================================\n`);
  }
  if (matchedEntries.length > displayedCount) {
    const remainingEntries = matchedEntries.slice(displayedCount);
    const previewRemaining = remainingEntries.slice(0, 15).map(e => `  - ${e.concept.relativePath} (${e.concept.frontmatter.title || e.concept.frontmatter.type || 'Concept'})`);
    const extraTail = remainingEntries.length > 15 ? `\n  ... and ${remainingEntries.length - 15} more.` : '';
    console.log(`Additional matches omitted for context budget (${remainingEntries.length} more):\n${previewRemaining.join('\n')}${extraTail}\n\n========================================\n`);
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
    query: effectiveQueryLabel,
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
  tokenizeSearchQuery,
  expandCompoundSubTokens,
  rankSearchMatches,
  ROOT_HYGIENE_FILES,
  isRootHygieneFile,
  recordTelemetry
};
