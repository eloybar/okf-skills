const fs = require('fs');
const os = require('os');
const path = require('path');

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
        if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && v.endsWith("'"))) {
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

function resolveSkillLearningsPath(args = []) {
  const idx = args.indexOf('--learnings');
  if (idx !== -1 && args[idx + 1]) return path.resolve(args[idx + 1]);
  if (process.env.OKF_SKILL_LEARNINGS_PATH) return path.resolve(process.env.OKF_SKILL_LEARNINGS_PATH);
  return path.join(os.homedir(), '.okf', 'skill-learnings.jsonl');
}

function resolveLearnStatePath(args = [], telPathOverride = null) {
  const idx = args.indexOf('--state');
  if (idx !== -1 && args[idx + 1]) return path.resolve(args[idx + 1]);
  if (process.env.OKF_LEARN_STATE_PATH) return path.resolve(process.env.OKF_LEARN_STATE_PATH);
  const telIdx = args.indexOf('--telemetry');
  if (telIdx !== -1 && args[telIdx + 1]) {
    return path.join(path.dirname(path.resolve(args[telIdx + 1])), 'learn-state.json');
  }
  if (process.env.OKF_TELEMETRY_PATH) {
    return path.join(path.dirname(path.resolve(process.env.OKF_TELEMETRY_PATH)), 'learn-state.json');
  }
  if (telPathOverride) {
    return path.join(path.dirname(path.resolve(telPathOverride)), 'learn-state.json');
  }
  return path.join(os.homedir(), '.okf', 'learn-state.json');
}

function readResetTimestampMs(statePath) {
  if (!statePath || !fs.existsSync(statePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (data && data.resetAt) {
      const ms = new Date(data.resetAt).getTime();
      return isNaN(ms) ? null : ms;
    }
  } catch (e) {}
  return null;
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

function recordSkillLearning({ workspaceRoot, skill, category, message }, args = []) {
  const learningsPath = resolveSkillLearningsPath(args);
  const dir = path.dirname(learningsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const payload = {
    timestamp: new Date().toISOString(),
    workspaceRoot: workspaceRoot || process.cwd(),
    skill: skill || 'okf-skills',
    category: category || 'general',
    message
  };
  fs.appendFileSync(learningsPath, JSON.stringify(payload) + '\n', 'utf8');
  return { success: true, note: payload, learningsPath };
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

function fileUriToPath(uri) {
  let cleaned = uri.replace(/^file:\/\/\/?/, '');
  try { cleaned = decodeURIComponent(cleaned); } catch (e) {}
  if (process.platform !== 'win32' && !cleaned.startsWith('/')) {
    cleaned = '/' + cleaned;
  }
  return path.normalize(cleaned);
}

function measureOkfContextBlockBytes(rawText) {
  if (!rawText || typeof rawText !== 'string') return 0;
  const startIdx = rawText.indexOf('=== OKF CONTEXT BLOCK');
  if (startIdx === -1) return 0;
  const sep = '========================================';
  const blocks = rawText.slice(startIdx).split(/(?==== OKF CONTEXT BLOCK)/);
  let maxBlockBytes = 0;
  for (const blk of blocks) {
    if (!blk.startsWith('=== OKF CONTEXT BLOCK')) continue;
    const lastSepIdx = blk.lastIndexOf(sep);
    const slice = lastSepIdx !== -1 ? blk.slice(0, lastSepIdx + sep.length) : blk;
    const bytes = Buffer.byteLength(slice, 'utf8');
    if (bytes > maxBlockBytes) maxBlockBytes = bytes;
  }
  return maxBlockBytes;
}

function walkBundleConcepts(dir, bundleRoot, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === 'archive') continue;
      walkBundleConcepts(fullPath, bundleRoot, results);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      if (entry.name === 'index.md' || entry.name === 'log.md') continue;
      try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        const fm = parseFrontmatter(raw);
        if (fm) {
          const body = raw.replace(/^---[\s\S]*?---\r?\n?/, '');
          results.push({
            file: path.relative(bundleRoot, fullPath).replace(/\\/g, '/'),
            fullPath,
            frontmatter: fm,
            body,
            bodyLength: body.trim().length
          });
        }
      } catch (e) {}
    }
  }
  return results;
}

const bundleConceptsCache = new Map();
function getCachedBundleConcepts(bundleRoot) {
  const key = path.resolve(bundleRoot).toLowerCase();
  if (!bundleConceptsCache.has(key)) {
    bundleConceptsCache.set(key, walkBundleConcepts(bundleRoot, bundleRoot));
  }
  return bundleConceptsCache.get(key);
}

function isQueryMissResolvedInBundle(mode, rawTarget, workspaceDir) {
  if (!rawTarget || typeof rawTarget !== 'string') return false;
  const candidateBundleRoots = [];
  const addWorkspaceCandidates = ws => {
    if (!ws || typeof ws !== 'string') return;
    const d1 = path.join(ws, 'docs', 'okf');
    const d2 = path.join(ws, 'okf');
    if (fs.existsSync(d1)) candidateBundleRoots.push(d1);
    if (fs.existsSync(d2)) candidateBundleRoots.push(d2);
  };
  addWorkspaceCandidates(workspaceDir);

  if (mode !== 'search') {
    const firstPart = rawTarget.split(',')[0].trim();
    const inferred = inferWorkspaceFromPath(firstPart);
    if (inferred) addWorkspaceCandidates(inferred);
    if (firstPart) {
      for (const baseDir of [workspaceDir, process.cwd()].filter(Boolean)) {
        const resolved = path.resolve(baseDir, firstPart);
        if (fs.existsSync(resolved)) {
          const inferredFromResolved = inferWorkspaceFromPath(resolved);
          if (inferredFromResolved) addWorkspaceCandidates(inferredFromResolved);
        }
      }
    }
  }

  const uniqueBundles = Array.from(new Set(candidateBundleRoots.map(b => path.resolve(b))));
  if (uniqueBundles.length === 0) return false;

  for (const bRoot of uniqueBundles) {
    const concepts = getCachedBundleConcepts(bRoot);
    if (concepts.length === 0) continue;
    if (mode === 'search') {
      const qTrimmed = rawTarget.trim();
      const qLower = qTrimmed.toLowerCase();
      if (!qLower || qLower === '(search query)') continue;
      let rankSearchFn = null;
      try {
        const siblingQueryPath = path.resolve(__dirname, '..', '..', 'okf-query', 'scripts', 'query.js');
        if (fs.existsSync(siblingQueryPath)) {
          const queryMod = require(siblingQueryPath);
          if (queryMod && typeof queryMod.rankSearchMatches === 'function') {
            rankSearchFn = queryMod.rankSearchMatches;
          }
        }
      } catch (e) {}
      if (rankSearchFn) {
        const matches = rankSearchFn(concepts, qTrimmed);
        if (matches.length > 0) return true;
      } else {
        const tokens = qLower.split(/[\s_-]+/).filter(t => t.length >= 2);
        for (const c of concepts) {
          const fm = c.frontmatter || {};
          const tagsStr = Array.isArray(fm.tags) ? fm.tags.join(' ') : '';
          const blob = [c.file, fm.title || '', fm.description || '', tagsStr, c.body || ''].join(' ').toLowerCase();
          if (blob.includes(qLower) || (tokens.length >= 2 && tokens.every(tok => blob.includes(tok)))) {
            return true;
          }
        }
      }
    } else {
      const parts = rawTarget.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length === 0) continue;
      const allMatched = parts.every(part => {
        const base = path.basename(part.replace(/\\/g, '/')).toLowerCase();
        if (!base) return false;
        return concepts.some(c => {
          if (path.basename(c.file).toLowerCase() === base) return true;
          const fm = c.frontmatter || {};
          const uris = [];
          if (fm.resource) uris.push(String(fm.resource));
          if (Array.isArray(fm.sources)) {
            for (const s of fm.sources) {
              const u = typeof s === 'string' ? s : (s && s.resource);
              if (u) uris.push(String(u));
            }
          }
          return uris.some(u => path.basename(u.replace(/\\/g, '/')).toLowerCase() === base);
        });
      });
      if (allMatched) return true;
    }
  }
  return false;
}

function bindSourceToConcept({ workspaceRoot, bundleRoot, filePath, conceptRelPath }) {
  const cleanRelConcept = conceptRelPath.replace(/^\/+/, '');
  const candidate1 = path.resolve(bundleRoot, cleanRelConcept);
  const candidate2 = path.resolve(workspaceRoot, conceptRelPath);
  const targetConceptPath = fs.existsSync(candidate1) ? candidate1 : candidate2;
  if (!fs.existsSync(targetConceptPath)) {
    throw new Error(`Concept file not found: ${conceptRelPath}`);
  }

  const absFile = path.resolve(workspaceRoot, filePath);
  const normalizedRelFile = path.relative(workspaceRoot, absFile).replace(/\\/g, '/');
  const raw = fs.readFileSync(targetConceptPath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    throw new Error(`Concept file lacks valid YAML frontmatter: ${conceptRelPath}`);
  }

  const fm = parseFrontmatter(raw);
  const existingUris = new Set();
  if (fm.resource) existingUris.add(String(fm.resource).replace(/^file:\/\/\/?/, '').replace(/\\/g, '/').toLowerCase());
  if (Array.isArray(fm.sources)) {
    for (const s of fm.sources) {
      const u = typeof s === 'string' ? s : (s && s.resource);
      if (u) existingUris.add(String(u).replace(/^file:\/\/\/?/, '').replace(/\\/g, '/').toLowerCase());
    }
  }

  if (existingUris.has(normalizedRelFile.toLowerCase())) {
    return {
      success: true,
      bound: false,
      alreadyBound: true,
      file: normalizedRelFile,
      concept: path.relative(bundleRoot, targetConceptPath).replace(/\\/g, '/')
    };
  }

  let fmLines = fmMatch[1].split(/\r?\n/);
  const nowDate = new Date();
  const nowIso = nowDate.toISOString();

  // Update generated.at or timestamp if present
  for (let i = 0; i < fmLines.length; i++) {
    if (/^\s+at:\s*/.test(fmLines[i])) {
      fmLines[i] = fmLines[i].replace(/^(\s+at:\s*).*/, `$1${nowIso}`);
    } else if (/^timestamp:\s*/.test(fmLines[i])) {
      fmLines[i] = `timestamp: ${nowIso}`;
    }
  }

  const sourcesLineIdx = fmLines.findIndex(l => /^sources:\s*$/.test(l.trim()) || /^sources:\s*\[/.test(l.trim()));
  if (sourcesLineIdx !== -1) {
    if (/^sources:\s*\[.*\]$/.test(fmLines[sourcesLineIdx].trim())) {
      const existingArr = Array.isArray(fm.sources) ? fm.sources : [];
      existingArr.push(normalizedRelFile);
      fmLines.splice(
        sourcesLineIdx,
        1,
        'sources:',
        ...existingArr.map(item => `  - ${typeof item === 'string' ? item : item.resource}`)
      );
    } else {
      let insertAt = sourcesLineIdx + 1;
      while (insertAt < fmLines.length && (/^\s+-/.test(fmLines[insertAt]) || /^\s+[a-zA-Z0-9_]+:/.test(fmLines[insertAt]))) {
        insertAt++;
      }
      fmLines.splice(insertAt, 0, `  - ${normalizedRelFile}`);
    }
  } else {
    fmLines.push('sources:', `  - ${normalizedRelFile}`);
  }

  const newFrontmatterBlock = `---${eol}${fmLines.join(eol)}${eol}---`;
  const updatedContent = raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, newFrontmatterBlock);
  fs.writeFileSync(targetConceptPath, updatedContent, 'utf8');
  try {
    fs.utimesSync(targetConceptPath, nowDate, nowDate);
  } catch (e) {}

  return {
    success: true,
    bound: true,
    file: normalizedRelFile,
    concept: path.relative(bundleRoot, targetConceptPath).replace(/\\/g, '/')
  };
}

function inferWorkspaceFromPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  const normP = rawPath.replace(/^["']+|["']+$/g, '').replace(/\\+/g, '/').replace(/\/+/g, '/');
  if (normP.includes('/.gemini/') || normP.includes('/AppData/Local/Temp/') || normP.startsWith('/tmp/')) {
    return null;
  }
  const okfBundleIdx = normP.search(/\/(?:docs\/)?okf(?=\/|$)/i);
  if (okfBundleIdx > 0) {
    return normP.slice(0, okfBundleIdx);
  }
  let curr = path.dirname(normP);
  for (let depth = 0; depth < 5; depth++) {
    const cleanCurr = curr.replace(/\\+/g, '/');
    const parts = cleanCurr.split('/').filter(Boolean);
    if (parts.length < 2) break;
    try {
      if (
        fs.existsSync(path.join(cleanCurr, '.git')) ||
        fs.existsSync(path.join(cleanCurr, 'docs', 'okf')) ||
        fs.existsSync(path.join(cleanCurr, 'okf'))
      ) {
        return cleanCurr;
      }
    } catch (e) {}
    const parent = path.dirname(cleanCurr).replace(/\\+/g, '/');
    if (parent === cleanCurr) break;
    curr = parent;
  }
  const parts = normP.split('/');
  if (parts.length >= 2) {
    return parts.slice(0, Math.min(parts.length - 1, 3)).join('/');
  }
  return null;
}

function isSyntheticUserTurn(rawText) {
  if (!rawText || typeof rawText !== 'string') return true;
  if (/^\s*Base directory for this skill:/i.test(rawText)) return true;
  if (/^\s*This session is being continued from a previous conversation that ran out of context\b/i.test(rawText)) return true;
  if (/^\s*\[Request interrupted by user\b/i.test(rawText)) return true;
  return false;
}

function sanitizeUserTurnText(rawText) {
  if (isSyntheticUserTurn(rawText)) return '';
  return rawText
    .replace(/<pasted_content\b[^>]*>[\s\S]*?<\/pasted_content\b[^>]*>/gi, ' ')
    .replace(/<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder\b[^>]*>/gi, ' ')
    .replace(/<task-notification\b[^>]*>[\s\S]*?<\/task-notification\b[^>]*>/gi, ' ')
    .replace(/<local-command-caveat\b[^>]*>[\s\S]*?<\/local-command-caveat\b[^>]*>/gi, ' ')
    .replace(/<local-command-stdout\b[^>]*>[\s\S]*?<\/local-command-stdout\b[^>]*>/gi, ' ')
    .replace(/<local-command-stderr\b[^>]*>[\s\S]*?<\/local-command-stderr\b[^>]*>/gi, ' ')
    .replace(/<command-name\b[^>]*>[\s\S]*?<\/command-name\b[^>]*>/gi, ' ')
    .replace(/<command-message\b[^>]*>[\s\S]*?<\/command-message\b[^>]*>/gi, ' ')
    .replace(/<command-args\b[^>]*>[\s\S]*?<\/command-args\b[^>]*>/gi, ' ')
    .replace(/<bash-input\b[^>]*>[\s\S]*?<\/bash-input\b[^>]*>/gi, ' ')
    .replace(/<bash-stdout\b[^>]*>[\s\S]*?<\/bash-stdout\b[^>]*>/gi, ' ')
    .replace(/<bash-stderr\b[^>]*>[\s\S]*?<\/bash-stderr\b[^>]*>/gi, ' ')
    .replace(/<ide_opened_file\b[^>]*>[\s\S]*?<\/ide_opened_file\b[^>]*>/gi, ' ')
    .replace(/<ide_selection\b[^>]*>[\s\S]*?<\/ide_selection\b[^>]*>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .trim();
}

function isUserCorrectionTurn(cleanedText) {
  if (!cleanedText || typeof cleanedText !== 'string') return false;
  const normalized = cleanedText
    .replace(/\b(?:i|we|they)\s+don't\s+(?:have|know|think|see|remember|need|mind|care|just)\b/gi, ' ')
    .replace(/\bdon't\s+have\s+(?:it|that|them|the\s+\w+|any|access)\b/gi, ' ')
    .replace(/\bdon't\s+(?:seem|appear)\s+to\b/gi, ' ')
    .replace(/\bit\s+should\s+be\s+something\b/gi, ' ');
  return /\b(no[,\s]|instead\b|don't\b|wrong\b|not working\b|still broken\b|should be\b|why did you\b|why\s+(?:was\s+(?:it|that|this)\s+missed|did\s+(?:you|we)\s+miss)\b)/i.test(normalized);
}

function extractSearchQueryFromCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') return null;
  const m = cmd.match(/query\.js\b[^\r\n;&|]*?--search\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|)"']+))/i);
  if (!m) return null;
  const q = (m[1] || m[2] || m[3] || '').trim();
  if (!q || q.startsWith('$')) return null;
  return q;
}

function collectWorkspaceConceptHints(workspaceDir) {
  if (!workspaceDir || typeof workspaceDir !== 'string') return null;
  const candidateRoots = [
    path.join(workspaceDir, 'docs', 'okf'),
    path.join(workspaceDir, 'okf')
  ].filter(p => {
    try {
      return fs.existsSync(p);
    } catch (e) {
      return false;
    }
  });
  if (candidateRoots.length === 0) return null;

  const conceptFilenames = new Set();
  const hyphenatedSlugs = new Set();
  const reservedNames = new Set(['index.md', 'log.md', 'skill.md', 'readme.md', 'agents.md', 'claude.md', 'gemini.md']);

  for (const bRoot of candidateRoots) {
    const concepts = getCachedBundleConcepts(bRoot);
    for (const c of concepts) {
      const base = path.basename(c.file || '').toLowerCase();
      if (!base || reservedNames.has(base)) continue;
      conceptFilenames.add(base);
      const slug = base.replace(/\.md$/i, '');
      if (slug.length >= 5 && slug.includes('-')) {
        hyphenatedSlugs.add(slug);
      }
    }
  }
  if (conceptFilenames.size === 0 && hyphenatedSlugs.size === 0) return null;
  return { conceptFilenames, hyphenatedSlugs };
}

function preInferWorkspaceFromRecords(parsedRecords) {
  if (!Array.isArray(parsedRecords)) return null;
  for (const r of parsedRecords) {
    if (!r || typeof r !== 'object') continue;
    if (r.cwd && typeof r.cwd === 'string') {
      return r.cwd.replace(/\\+/g, '/');
    }
    if (
      r.type === 'attachment' &&
      r.attachment &&
      r.attachment.snapshot &&
      typeof r.attachment.snapshot.workingDirectory === 'string'
    ) {
      return r.attachment.snapshot.workingDirectory.replace(/\\+/g, '/');
    }
    if (r.type === 'assistant' && r.message && Array.isArray(r.message.content)) {
      for (const b of r.message.content) {
        if (b && b.type === 'tool_use' && b.input && typeof b.input === 'object') {
          const fp = b.input.file_path || b.input.path || b.input.Path || '';
          const inf = inferWorkspaceFromPath(fp);
          if (inf) return inf;
        }
      }
    } else if (r.type === 'PLANNER_RESPONSE' && Array.isArray(r.tool_calls)) {
      for (const tc of r.tool_calls) {
        const fp = tc && tc.args && tc.args.Path;
        const inf = inferWorkspaceFromPath(fp);
        if (inf) return inf;
      }
    }
  }
  return null;
}

function hasConceptCitation(text, bundleHints = null) {
  if (!text || typeof text !== 'string') return false;
  if (
    /OKF Check|OKF Citations|\[Concept:\s*[^\]]+\]|docs[\/\\]okf[\/\\]|[`"'](?:[^`"'\r\n]*[\/\\])?okf[\/\\][`"']|(?:^|[\s\/\\(`"'])okf[\/\\](?!log\.md\b|SKILL\.md\b)[a-z0-9_.-]+(?:[\/\\][a-z0-9_.-]+)*\.md\b/i.test(
      text
    )
  ) {
    return true;
  }
  if (bundleHints) {
    const mdMatches = text.match(/[a-z0-9_.-]+\.md\b/gi);
    if (mdMatches && bundleHints.conceptFilenames && bundleHints.conceptFilenames.size > 0) {
      for (const m of mdMatches) {
        if (bundleHints.conceptFilenames.has(m.toLowerCase())) return true;
      }
    }
    if (
      bundleHints.hyphenatedSlugs &&
      bundleHints.hyphenatedSlugs.size > 0 &&
      /\b(?:okf|bundle|concepts?)\b/i.test(text)
    ) {
      const lowerText = text.toLowerCase();
      for (const slug of bundleHints.hyphenatedSlugs) {
        if (lowerText.includes(slug)) return true;
      }
    }
  }
  return false;
}

function isOkfBundleReadPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const norm = filePath.replace(/^["'\\]+|["'\\]+$/g, '').replace(/\\+/g, '/').replace(/\/+/g, '/');
  return /(?:^|\/)(?:docs\/)?okf\/(?!log\.md\b|SKILL\.md\b)[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*\.md$/i.test(norm);
}

function countCommandPreWorkQueries(cmd) {
  if (!cmd || typeof cmd !== 'string') return 0;
  let count = 0;
  const qMatches = cmd.match(/(?:query|wayfinder_taxonomy)\.js\b/g);
  if (qMatches) count += qMatches.length;
  if (
    count === 0 &&
    !/\bsed\s+-i\b|\bcat\s*>>?/.test(cmd) &&
    /\b(?:cat|head|sed|grep)\b[^\r\n]*?(?:^|[\s"'\/\\])(?:docs\/)?okf\/(?!log\.md\b|SKILL\.md\b)[a-z0-9_./-]+\.md\b/i.test(cmd)
  ) {
    count += 1;
  }
  return count;
}

function detectTranscriptFormat(records) {
  if (!Array.isArray(records) || records.length === 0) return 'empty';
  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    if (
      r.step_index !== undefined ||
      r.type === 'USER_INPUT' ||
      r.type === 'PLANNER_RESPONSE'
    ) {
      return 'antigravity';
    }
    if (
      ((r.type === 'user' || r.type === 'assistant') && r.message && typeof r.message === 'object') ||
      r.sessionId !== undefined ||
      r.type === 'file-history-snapshot' ||
      r.type === 'permission-mode'
    ) {
      return 'claude-code';
    }
  }
  return 'unrecognized';
}

function extractClaudeToolResultText(blockContent, toolUseResult) {
  const parts = [];
  if (typeof blockContent === 'string') {
    parts.push(blockContent);
  } else if (Array.isArray(blockContent)) {
    for (const item of blockContent) {
      if (typeof item === 'string') parts.push(item);
      else if (item && typeof item.text === 'string') parts.push(item.text);
    }
  }
  if (toolUseResult && typeof toolUseResult === 'object') {
    if (typeof toolUseResult.stdout === 'string' && !parts.join('\n').includes(toolUseResult.stdout)) {
      parts.push(toolUseResult.stdout);
    }
    if (typeof toolUseResult.stderr === 'string' && !parts.join('\n').includes(toolUseResult.stderr)) {
      parts.push(toolUseResult.stderr);
    }
  }
  return parts.join('\n');
}

function getRecordTimestampMs(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const raw = rec.created_at || rec.timestamp || (rec.snapshot && rec.snapshot.timestamp);
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return isNaN(ms) ? null : ms;
}

function filterRawLinesAfterReset(rawLines, resetAtMs) {
  if (!resetAtMs || !Array.isArray(rawLines) || rawLines.length === 0) return rawLines;
  const postLines = [];
  let hasAnyPost = false;
  for (const line of rawLines) {
    try {
      const r = JSON.parse(line);
      const ms = getRecordTimestampMs(r);
      if (ms !== null && ms > resetAtMs) {
        hasAnyPost = true;
        postLines.push(line);
      }
    } catch (e) {}
  }
  return hasAnyPost ? postLines : rawLines;
}

function analyzeSingleTranscript(transcriptPath, convId, options = {}) {
  const resetAtMs = options.resetAtMs || null;
  const conversation = {
    conversationId: convId,
    found: false,
    transcriptFormat: null,
    warning: null,
    inferredWorkspace: null,
    stepCount: 0,
    userTurnCount: 0,
    durationMinutes: 0,
    tokens: { inputTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
    gateCompliance: {
      sessionStartLint: false,
      preWorkQueries: 0,
      conceptCitations: 0,
      preCompletionMaintain: false,
      scorePercent: 0
    },
    friction: {
      queryMisses: [],
      contextBloat: [],
      slowCommands: [],
      toolErrors: {
        total: 0,
        editFileTargetNotFound: 0,
        fileDoesNotExist: 0,
        other: 0
      }
    }
  };
  const userCorrections = [];

  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    if (convId) {
      conversation.warning = `Transcript file not found for conversation '${convId}'.`;
    }
    return { conversation, userCorrections };
  }

  conversation.found = true;
  const lines = fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/).filter(Boolean);
  const parsedRecords = [];
  for (const line of lines) {
    try {
      parsedRecords.push(JSON.parse(line));
    } catch (e) {}
  }

  const format = detectTranscriptFormat(parsedRecords);
  conversation.transcriptFormat = format;
  if (format === 'unrecognized' || format === 'empty') {
    conversation.warning = `Transcript at '${transcriptPath}' has ${format} schema (${parsedRecords.length} valid JSON line(s)).`;
    return { conversation, userCorrections };
  }

  let firstTimeMs = null;
  let lastTimeMs = null;
  let hasFileModifications = false;
  let recordsToAnalyze = parsedRecords;
  let preSessionQueries = 0;
  let preSessionCitations = 0;
  const initialWorkspace = preInferWorkspaceFromRecords(parsedRecords) || options.workspaceRoot || null;
  const bundleHints = collectWorkspaceConceptHints(initialWorkspace);

  if (resetAtMs) {
    const postRecords = [];
    const preRecords = [];
    for (const r of parsedRecords) {
      const ms = getRecordTimestampMs(r);
      if (ms !== null && ms > resetAtMs) {
        postRecords.push(r);
      } else {
        preRecords.push(r);
      }
    }
    if (postRecords.length > 0) {
      recordsToAnalyze = postRecords;
      for (const pr of preRecords) {
        if (!conversation.inferredWorkspace && pr.cwd && typeof pr.cwd === 'string') {
          conversation.inferredWorkspace = pr.cwd.replace(/\\+/g, '/');
        }
        if (
          !conversation.inferredWorkspace &&
          pr.type === 'attachment' &&
          pr.attachment &&
          pr.attachment.snapshot &&
          typeof pr.attachment.snapshot.workingDirectory === 'string'
        ) {
          conversation.inferredWorkspace = pr.attachment.snapshot.workingDirectory.replace(/\\+/g, '/');
        }
        if (pr.type === 'assistant' && pr.message && Array.isArray(pr.message.content)) {
          for (const b of pr.message.content) {
            if (!b) continue;
            if (b.type === 'text' && typeof b.text === 'string' && hasConceptCitation(b.text, bundleHints)) {
              preSessionCitations++;
            }
            if (b.type !== 'tool_use') continue;
            const inp = (b.input && typeof b.input === 'object') ? b.input : {};
            const fp = inp.file_path || inp.path || inp.Path || '';
            if (!conversation.inferredWorkspace && fp) {
              const inf = inferWorkspaceFromPath(fp);
              if (inf) conversation.inferredWorkspace = inf;
            }
            if (/^(?:Read|read_file)$/i.test(String(b.name || '')) && isOkfBundleReadPath(fp)) {
              preSessionQueries++;
            }
            const cmd = String(inp.command || inp.CommandLine || '');
            if (/lint\.js\b/.test(cmd) && /--drift\b/.test(cmd)) {
              conversation.gateCompliance.sessionStartLint = true;
            }
            preSessionQueries += countCommandPreWorkQueries(cmd);
          }
        } else if (pr.type === 'PLANNER_RESPONSE') {
          if (hasConceptCitation(String(pr.content || ''), bundleHints)) {
            preSessionCitations++;
          }
          if (Array.isArray(pr.tool_calls)) {
            for (const tc of pr.tool_calls) {
              const tcArgs = (tc && tc.args) || {};
              if (!conversation.inferredWorkspace && tcArgs.Path) {
                const inf = inferWorkspaceFromPath(tcArgs.Path);
                if (inf) conversation.inferredWorkspace = inf;
              }
              if (tc && tc.name === 'read_file' && isOkfBundleReadPath(tcArgs.Path)) {
                preSessionQueries++;
              }
              const cmd = tcArgs.CommandLine ? String(tcArgs.CommandLine) : '';
              if (/lint\.js\b/.test(cmd) && /--drift\b/.test(cmd)) {
                conversation.gateCompliance.sessionStartLint = true;
              }
              preSessionQueries += countCommandPreWorkQueries(cmd);
            }
          }
        }
      }
    } else {
      let mtimeAfterReset = false;
      try {
        mtimeAfterReset = fs.statSync(transcriptPath).mtimeMs > resetAtMs;
      } catch (e) {}
      if (!mtimeAfterReset) {
        recordsToAnalyze = [];
      }
    }
  }

  if (format === 'claude-code') {
    const seenAssistantMsgIds = new Set();
    const citedAssistantMsgIds = new Set();
    const toolUseById = new Map();

    for (let idx = 0; idx < recordsToAnalyze.length; idx++) {
      const rec = recordsToAnalyze[idx];
      const stepNum = idx + 1;
      if (rec.type === 'user' || rec.type === 'assistant') {
        conversation.stepCount++;
      }

      const tsRaw = rec.timestamp || rec.created_at || (rec.snapshot && rec.snapshot.timestamp);
      if (tsRaw) {
        const ms = new Date(tsRaw).getTime();
        if (!isNaN(ms)) {
          if (firstTimeMs === null || ms < firstTimeMs) firstTimeMs = ms;
          if (lastTimeMs === null || ms > lastTimeMs) lastTimeMs = ms;
        }
      }

      if (!conversation.inferredWorkspace && rec.cwd && typeof rec.cwd === 'string') {
        conversation.inferredWorkspace = rec.cwd.replace(/\\+/g, '/');
      }
      if (
        !conversation.inferredWorkspace &&
        rec.type === 'attachment' &&
        rec.attachment &&
        rec.attachment.snapshot &&
        typeof rec.attachment.snapshot.workingDirectory === 'string'
      ) {
        conversation.inferredWorkspace = rec.attachment.snapshot.workingDirectory.replace(/\\+/g, '/');
      }

      if (rec.type === 'assistant' && rec.message && typeof rec.message === 'object') {
        const msg = rec.message;
        const msgKey = msg.id || `line_${stepNum}`;
        if (msg.usage && typeof msg.usage === 'object' && !seenAssistantMsgIds.has(msgKey)) {
          seenAssistantMsgIds.add(msgKey);
          conversation.tokens.inputTokens +=
            Number(msg.usage.input_tokens || 0) + Number(msg.usage.cache_creation_input_tokens || 0);
          conversation.tokens.cacheReadTokens += Number(msg.usage.cache_read_input_tokens || 0);
          conversation.tokens.outputTokens += Number(msg.usage.output_tokens || 0);
        }

        const blocks = Array.isArray(msg.content) ? msg.content : [];
        for (const block of blocks) {
          if (!block || typeof block !== 'object') continue;
          if (block.type === 'text' && typeof block.text === 'string') {
            if (!citedAssistantMsgIds.has(msgKey) && hasConceptCitation(block.text, bundleHints)) {
              citedAssistantMsgIds.add(msgKey);
              conversation.gateCompliance.conceptCitations++;
            }
          } else if (block.type === 'tool_use') {
            const toolName = String(block.name || '');
            const input = (block.input && typeof block.input === 'object') ? block.input : {};
            if (block.id) {
              toolUseById.set(block.id, { name: toolName, input });
            }
            if (/^(?:Edit|Write|MultiEdit|NotebookEdit|edit_file|write_file)$/i.test(toolName)) {
              hasFileModifications = true;
            }
            const filePath = input.file_path || input.path || input.Path || '';
            if (filePath && typeof filePath === 'string') {
              if (!conversation.inferredWorkspace) {
                const inferred = inferWorkspaceFromPath(filePath);
                if (inferred) conversation.inferredWorkspace = inferred;
              }
              if (/^(?:Read|read_file)$/i.test(toolName) && isOkfBundleReadPath(filePath)) {
                conversation.gateCompliance.preWorkQueries++;
              }
            }
            if (/^(?:Bash|bash|run_command)$/i.test(toolName)) {
              const cmd = String(input.command || input.CommandLine || '');
              if (/lint\.js\b/.test(cmd) && /--drift\b/.test(cmd)) {
                conversation.gateCompliance.sessionStartLint = true;
              }
              conversation.gateCompliance.preWorkQueries += countCommandPreWorkQueries(cmd);
              if (/maintain\.js\b/.test(cmd)) {
                conversation.gateCompliance.preCompletionMaintain = true;
                hasFileModifications = true;
              }
              if (/\b(?:prune|upgrade)\.js\b|\blearn\.js\b[^\r\n]*--bind\b|\bgit\s+(?:commit|merge|cherry-pick|revert)\b|\bsed\s+-i\b|\btee\s+/i.test(cmd)) {
                hasFileModifications = true;
              }
            }
          }
        }
      } else if (rec.type === 'user' && rec.message && typeof rec.message === 'object') {
        const msg = rec.message;
        const blocks = Array.isArray(msg.content) ? msg.content : null;
        const toolResults = blocks ? blocks.filter(b => b && b.type === 'tool_result') : [];

        if (toolResults.length > 0) {
          for (const tr of toolResults) {
            const origin = tr.tool_use_id ? toolUseById.get(tr.tool_use_id) : null;
            const isReadTool = origin && /^(?:Read|read_file)$/i.test(origin.name);
            const originCmd = origin && origin.input ? String(origin.input.command || origin.input.CommandLine || '') : '';
            const toolText = extractClaudeToolResultText(tr.content, rec.toolUseResult);

            if (!isReadTool && toolText) {
              const hasMatchedConcepts = toolText.includes('OKF CONTEXT BLOCK') || /^\[Concept:/m.test(toolText);
              const missFileMatch = toolText.match(/^No matching OKF concepts found for file:\s*([^\r\n]+)$/m);
              const missSearchMatch = toolText.match(/^No matching OKF concepts found for search:\s*([^\r\n]+)$/m);
              if (missFileMatch && !/[$`*?<>|();]/.test(missFileMatch[1])) {
                conversation.friction.queryMisses.push({
                  step: stepNum,
                  mode: 'file',
                  missedTarget: missFileMatch[1].trim()
                });
              } else if (missSearchMatch && !hasMatchedConcepts) {
                conversation.friction.queryMisses.push({
                  step: stepNum,
                  mode: 'search',
                  missedTarget: missSearchMatch[1].trim()
                });
              } else if (/^No matching OKF concepts found\.$/m.test(toolText) && !hasMatchedConcepts) {
                const extractedSearch = extractSearchQueryFromCommand(originCmd);
                conversation.friction.queryMisses.push({
                  step: stepNum,
                  mode: 'search',
                  missedTarget: extractedSearch || '(search query)'
                });
              }

              const outBytes = measureOkfContextBlockBytes(toolText);
              if (outBytes > 40000) {
                conversation.friction.contextBloat.push({
                  step: stepNum,
                  bytes: outBytes,
                  file: transcriptPath
                });
              }
            }

            if (tr.is_error === true && !/^The user doesn't want to proceed with this tool use\b/i.test(toolText.trim())) {
              conversation.friction.toolErrors.total++;
              if (/target content not found|String to replace not found|old_string not found/i.test(toolText)) {
                conversation.friction.toolErrors.editFileTargetNotFound++;
              } else if (/file does not exist|ENOENT/i.test(toolText)) {
                conversation.friction.toolErrors.fileDoesNotExist++;
              } else {
                conversation.friction.toolErrors.other++;
              }
            }
          }
        } else if (!rec.isMeta && !rec.isSidechain && !rec.isCompactSummary) {
          let rawUserText = '';
          if (typeof msg.content === 'string') {
            rawUserText = msg.content;
          } else if (blocks) {
            rawUserText = blocks
              .filter(b => b && b.type === 'text' && typeof b.text === 'string')
              .map(b => b.text)
              .join('\n');
          }
          if (!isSyntheticUserTurn(rawUserText)) {
            const hasSlashCmd = /<command-name\b[^>]*>[\s\S]*?<\/command-name>/i.test(rawUserText);
            const cleanedText = sanitizeUserTurnText(rawUserText);
            if (cleanedText || hasSlashCmd) {
              conversation.userTurnCount++;
            }
            if (isUserCorrectionTurn(cleanedText)) {
              userCorrections.push({
                step: stepNum,
                excerpt: cleanedText.slice(0, 240)
              });
            }
          }
        }
      }
    }
  } else {
    let lastSearchCmd = '';
    for (const step of recordsToAnalyze) {
      conversation.stepCount++;
      if (step.created_at) {
        const ms = new Date(step.created_at).getTime();
        if (!isNaN(ms)) {
          if (firstTimeMs === null || ms < firstTimeMs) firstTimeMs = ms;
          if (lastTimeMs === null || ms > lastTimeMs) lastTimeMs = ms;
        }
      }
      if (step.type === 'USER_INPUT') {
        const rawReqMatch = String(step.content || '').match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i);
        const rawUserText = (rawReqMatch ? rawReqMatch[1] : String(step.content || '')).trim();
        if (!isSyntheticUserTurn(rawUserText)) {
          conversation.userTurnCount++;
          const userText = sanitizeUserTurnText(rawUserText);
          if (isUserCorrectionTurn(userText)) {
            userCorrections.push({
              step: step.step_index,
              excerpt: userText.slice(0, 240)
            });
          }
        }
      }
      if (step.type === 'PLANNER_RESPONSE') {
        conversation.tokens.inputTokens += Number(step.input_tokens || 0);
        conversation.tokens.cacheReadTokens += Number(step.cache_read_tokens || 0);
        conversation.tokens.outputTokens += Number(step.output_tokens || 0);
        const content = String(step.content || '');
        if (hasConceptCitation(content, bundleHints)) {
          conversation.gateCompliance.conceptCitations++;
        }
        if (Array.isArray(step.tool_calls)) {
          for (const tc of step.tool_calls) {
            const tcArgs = (tc && tc.args) || {};
            if (tc && /^(?:edit_file|write_file|Edit|Write|MultiEdit|NotebookEdit)$/i.test(String(tc.name || ''))) {
              hasFileModifications = true;
            }
            if (tcArgs.Path && typeof tcArgs.Path === 'string') {
              if (!conversation.inferredWorkspace) {
                const inferred = inferWorkspaceFromPath(tcArgs.Path);
                if (inferred) conversation.inferredWorkspace = inferred;
              }
              if (tc.name === 'read_file' && isOkfBundleReadPath(tcArgs.Path)) {
                conversation.gateCompliance.preWorkQueries++;
              }
            }
            const cmd = tcArgs.CommandLine ? String(tcArgs.CommandLine) : '';
            if (/query\.js\b/.test(cmd) && /--search\b/.test(cmd)) {
              lastSearchCmd = cmd;
            }
            if (/lint\.js\b/.test(cmd) && /--drift\b/.test(cmd)) {
              conversation.gateCompliance.sessionStartLint = true;
            }
            conversation.gateCompliance.preWorkQueries += countCommandPreWorkQueries(cmd);
            if (/maintain\.js\b/.test(cmd)) {
              conversation.gateCompliance.preCompletionMaintain = true;
              hasFileModifications = true;
            }
            if (/\b(?:prune|upgrade)\.js\b|\blearn\.js\b[^\r\n]*--bind\b|\bgit\s+(?:commit|merge|cherry-pick|revert)\b|\bsed\s+-i\b|\bSet-Content\b|\bOut-File\b|\bAdd-Content\b/i.test(cmd)) {
              hasFileModifications = true;
            }
          }
        }
      }

      const stepContent = String(step.content || '');
      const isReadFileOutput = /\n(?:Showing lines \d+-\d+ of \d+|Partial read \(lines \d+-\d+ of \d+\))\r?\n/.test(stepContent);
      if (!isReadFileOutput) {
        const hasMatchedConcepts = stepContent.includes('OKF CONTEXT BLOCK') || /^\[Concept:/m.test(stepContent);
        const missFileMatch = stepContent.match(/^No matching OKF concepts found for file:\s*([^\r\n]+)$/m);
        const missSearchMatch = stepContent.match(/^No matching OKF concepts found for search:\s*([^\r\n]+)$/m);
        if (missFileMatch && !/[$`*?<>|();]/.test(missFileMatch[1])) {
          conversation.friction.queryMisses.push({
            step: step.step_index,
            mode: 'file',
            missedTarget: missFileMatch[1].trim()
          });
        } else if (missSearchMatch && !hasMatchedConcepts) {
          conversation.friction.queryMisses.push({
            step: step.step_index,
            mode: 'search',
            missedTarget: missSearchMatch[1].trim()
          });
        } else if (/^No matching OKF concepts found\.$/m.test(stepContent) && !hasMatchedConcepts) {
          const extractedSearch = extractSearchQueryFromCommand(lastSearchCmd);
          conversation.friction.queryMisses.push({
            step: step.step_index,
            mode: 'search',
            missedTarget: extractedSearch || '(search query)'
          });
        }

        if (stepContent.includes('output was truncated due to being too long')) {
          const uriMatch = stepContent.match(/file:\/\/\/[^\s)"']+/);
          if (uriMatch) {
            const cleanedUri = uriMatch[0].replace(/\.$/, '');
            const localOutPath = fileUriToPath(cleanedUri);
            const belongsToConv = !convId || localOutPath.toLowerCase().includes(String(convId).toLowerCase());
            if (belongsToConv && fs.existsSync(localOutPath)) {
              try {
                const stat = fs.statSync(localOutPath);
                if (stat.size > 40000) {
                  const fullOut = fs.readFileSync(localOutPath, 'utf8');
                  const contextBytes = measureOkfContextBlockBytes(fullOut);
                  if (contextBytes > 40000) {
                    conversation.friction.contextBloat.push({
                      step: step.step_index,
                      bytes: contextBytes,
                      file: localOutPath
                    });
                  }
                }
              } catch (e) {}
            }
          }
        }
      }

      if (stepContent.includes('Tool is running as a background task')) {
        const descMatch = stepContent.match(/Task Description:\s*([^\r\n]+)/);
        const rawDesc = descMatch ? descMatch[1].trim() : '';
        if (
          rawDesc &&
          /(?:query|maintain|lint|prune|visualize|wayfinder_taxonomy|learn|upgrade)\.js\b|\bnpm\s+run\s+okf:/i.test(rawDesc) &&
          !/\b(?:npx\s+jest|jest\b|npm\s+(?:run\s+)?test|pytest\b|vitest\b|cargo\s+test|dotnet\s+test|git\s+(?:push|pull|fetch|clone)|gh\s+(?:pr|issue|release|run|api)\b)\b/i.test(rawDesc)
        ) {
          conversation.friction.slowCommands.push({
            step: step.step_index,
            command: rawDesc,
            backgrounded: true
          });
        }
      }

      if (step.status === 'ERROR') {
        conversation.friction.toolErrors.total++;
        if (stepContent.includes('target content not found in the file')) {
          conversation.friction.toolErrors.editFileTargetNotFound++;
        } else if (stepContent.includes('file does not exist')) {
          conversation.friction.toolErrors.fileDoesNotExist++;
        } else {
          conversation.friction.toolErrors.other++;
        }
      }
    }
  }

  if (firstTimeMs !== null && lastTimeMs !== null && lastTimeMs >= firstTimeMs) {
    conversation.durationMinutes = Math.round(((lastTimeMs - firstTimeMs) / 60000) * 10) / 10;
  }

  if (conversation.stepCount > 0 && !hasFileModifications) {
    conversation.gateCompliance.preCompletionMaintain = true;
  }

  // If resetAtMs cut through the middle of an active turn (0 new user turns in post-reset slice),
  // carry forward pre-reset grounding queries and citations from earlier in the same session.
  if (conversation.userTurnCount === 0 && (preSessionQueries > 0 || preSessionCitations > 0)) {
    if (conversation.gateCompliance.preWorkQueries === 0 && preSessionQueries > 0) {
      conversation.gateCompliance.preWorkQueries = preSessionQueries;
    }
    if (conversation.gateCompliance.conceptCitations === 0 && preSessionCitations > 0) {
      conversation.gateCompliance.conceptCitations = preSessionCitations;
    }
  }

  if (conversation.friction.queryMisses.length > 0) {
    conversation.friction.queryMisses = conversation.friction.queryMisses.filter(
      m => !isQueryMissResolvedInBundle(m.mode || 'file', m.missedTarget, conversation.inferredWorkspace)
    );
  }

  const gatesPassed =
    (conversation.gateCompliance.sessionStartLint ? 1 : 0) +
    (conversation.gateCompliance.preWorkQueries > 0 ? 1 : 0) +
    (conversation.gateCompliance.conceptCitations > 0 ? 1 : 0) +
    (conversation.gateCompliance.preCompletionMaintain ? 1 : 0);
  conversation.gateCompliance.scorePercent = Math.round((gatesPassed / 4) * 100);

  return { conversation, userCorrections };
}

function isMetaLearnTranscript(rawLines) {
  if (!Array.isArray(rawLines) || rawLines.length === 0) return true;
  let userInputCount = 0;
  let firstUserRequest = '';
  for (const line of rawLines) {
    if (!line.includes('USER_INPUT') && !line.includes('"user"')) continue;
    try {
      const r = JSON.parse(line);
      if (r.type === 'USER_INPUT') {
        const m = String(r.content || '').match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i);
        const txt = (m ? m[1] : String(r.content || '')).trim();
        if (!isSyntheticUserTurn(txt)) {
          userInputCount++;
          if (userInputCount === 1) firstUserRequest = txt;
          if (userInputCount > 1) return false;
        }
      } else if (r.type === 'user' && !r.isMeta && !r.isSidechain && !r.isCompactSummary && r.message) {
        const c = r.message.content;
        if (Array.isArray(c) && c.some(b => b && b.type === 'tool_result')) continue;
        const txt = typeof c === 'string' ? c.trim() : (Array.isArray(c) ? c.map(b => (b && b.text) || '').join('\n').trim() : '');
        if (!isSyntheticUserTurn(txt)) {
          userInputCount++;
          if (userInputCount === 1) firstUserRequest = txt;
          if (userInputCount > 1) return false;
        }
      }
    } catch (e) {}
  }
  return (
    userInputCount === 1 &&
    (
      /^\/okf-learn\b/i.test(firstUserRequest) ||
      /<command-name\b[^>]*>\s*\/?okf-learn\s*<\/command-name\b[^>]*>/i.test(firstUserRequest)
    )
  );
}

function summarizeCandidateLines(rawLines, allRawLines = null) {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return { stepCount: 0, minSteps: 6, hasCompletedReply: false, isSubagent: false };
  }
  let isClaude = false;
  let claudeSteps = 0;
  let agySteps = 0;
  let hasCompletedReply = false;
  for (const line of rawLines) {
    try {
      const r = JSON.parse(line);
      if (!r || typeof r !== 'object') continue;
      if (r.step_index !== undefined || r.type === 'USER_INPUT' || r.type === 'PLANNER_RESPONSE' || r.type === 'SYSTEM_MESSAGE') {
        agySteps++;
        if (r.type === 'PLANNER_RESPONSE' && String(r.content || '').trim().length > 0) {
          hasCompletedReply = true;
        }
      } else {
        if (
          r.sessionId !== undefined ||
          r.type === 'user' ||
          r.type === 'assistant' ||
          r.type === 'file-history-snapshot' ||
          r.type === 'permission-mode'
        ) {
          isClaude = true;
        }
        if (r.type === 'user' || r.type === 'assistant') {
          claudeSteps++;
          if (r.type === 'assistant' && r.message && Array.isArray(r.message.content)) {
            if (r.message.content.some(b => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim().length > 0)) {
              hasCompletedReply = true;
            }
          }
        }
      }
    } catch (e) {}
  }
  const isPureClaude = isClaude && agySteps === 0;
  let isSubagent = false;
  if (!isPureClaude) {
    const fullScanLines = Array.isArray(allRawLines) && allRawLines.length > 0 ? allRawLines : rawLines;
    let agyUserInputs = 0;
    let agySystemMessages = 0;
    for (const line of fullScanLines) {
      if (line.includes('"USER_INPUT"')) agyUserInputs++;
      else if (line.includes('"SYSTEM_MESSAGE"')) agySystemMessages++;
    }
    if (agyUserInputs === 0 && agySystemMessages > 0) {
      isSubagent = true;
    }
  }
  return {
    stepCount: isPureClaude ? claudeSteps : rawLines.length,
    minSteps: isPureClaude ? 3 : 6,
    hasCompletedReply,
    isSubagent
  };
}

function scanTranscriptDirectory(rootDir, excludeConvId, seenPaths, candidates, resetAtMs = null) {
  if (!rootDir || !fs.existsSync(rootDir)) return;
  let entries;
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  function pushCandidateFile(id, filePath) {
    if (excludeConvId && id === excludeConvId) return;
    const normKey = path.resolve(filePath).toLowerCase();
    if (seenPaths.has(normKey)) return;
    seenPaths.add(normKey);
    try {
      const mtimeMs = fs.statSync(filePath).mtimeMs;
      if (resetAtMs && mtimeMs <= resetAtMs) return;
      const rawLines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
      const effectiveLines = filterRawLinesAfterReset(rawLines, resetAtMs);
      const summary = summarizeCandidateLines(effectiveLines, rawLines);
      if (summary.isSubagent) return;
      const isMeta = isMetaLearnTranscript(effectiveLines);
      candidates.push({
        id,
        tPath: filePath,
        mtimeMs,
        stepCount: summary.stepCount,
        isMetaLearn: isMeta,
        isSubstantive: summary.stepCount >= summary.minSteps && summary.hasCompletedReply && !isMeta
      });
    } catch (e) {}
  }

  for (const entry of entries) {
    const fullEntryPath = path.join(rootDir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      const id = path.basename(entry.name, '.jsonl');
      pushCandidateFile(id, fullEntryPath);
    } else if (entry.isDirectory()) {
      if (excludeConvId && entry.name === excludeConvId) continue;
      // 1. Antigravity layout: <brainDir>/<convId>/.system_generated/logs/transcript.jsonl
      const agyPath = path.join(fullEntryPath, '.system_generated', 'logs', 'transcript.jsonl');
      if (fs.existsSync(agyPath)) {
        pushCandidateFile(entry.name, agyPath);
        continue;
      }
      // 2. Claude Code layout: <dir>/<project-slug>/<session-id>.jsonl (or <dir>/projects/<project-slug>/<session-id>.jsonl)
      try {
        for (const sub of fs.readdirSync(fullEntryPath, { withFileTypes: true })) {
          const subPath = path.join(fullEntryPath, sub.name);
          if (sub.isFile() && sub.name.endsWith('.jsonl')) {
            const id = path.basename(sub.name, '.jsonl');
            pushCandidateFile(id, subPath);
          } else if (sub.isDirectory() && entry.name === 'projects') {
            for (const leaf of fs.readdirSync(subPath, { withFileTypes: true })) {
              if (!leaf.isFile() || !leaf.name.endsWith('.jsonl')) continue;
              const id = path.basename(leaf.name, '.jsonl');
              pushCandidateFile(id, path.join(subPath, leaf.name));
            }
          }
        }
      } catch (e) {}
    }
  }
}

function discoverTranscriptCandidates(options = {}) {
  const explicitBrainDir = options.brainDir || process.env.OKF_BRAIN_DIR || null;
  const excludeConvId = options.excludeConversationId || process.env.OKF_CURRENT_CONVERSATION_ID || null;
  const resetAtMs = options.resetAtMs || null;
  const candidates = [];
  const seenPaths = new Set();

  if (explicitBrainDir) {
    scanTranscriptDirectory(explicitBrainDir, excludeConvId, seenPaths, candidates, resetAtMs);
  } else {
    const home = os.homedir();
    const defaultAgyDir = path.join(home, '.gemini', 'antigravity-cli', 'brain');
    scanTranscriptDirectory(defaultAgyDir, excludeConvId, seenPaths, candidates, resetAtMs);

    const claudeProjectDirs = [];
    if (process.env.CLAUDE_CONFIG_DIR) {
      claudeProjectDirs.push(path.join(process.env.CLAUDE_CONFIG_DIR, 'projects'));
    }
    claudeProjectDirs.push(path.join(home, '.claude', 'projects'));
    try {
      for (const d of fs.readdirSync(home, { withFileTypes: true })) {
        if (d.isDirectory() && d.name.startsWith('.claude-')) {
          claudeProjectDirs.push(path.join(home, d.name, 'projects'));
        }
      }
    } catch (e) {}
    for (const cDir of claudeProjectDirs) {
      scanTranscriptDirectory(cDir, excludeConvId, seenPaths, candidates, resetAtMs);
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates;
}

function evaluateSkillsPerformance(options = {}) {
  const brainDir = options.brainDir || process.env.OKF_BRAIN_DIR || path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');
  const telemetryPath = options.telemetryPath;
  const skillLearningsPath = options.skillLearningsPath || resolveSkillLearningsPath();
  const statePath = options.statePath || resolveLearnStatePath([], telemetryPath);
  const resetAtMs = options.resetAtMs !== undefined ? options.resetAtMs : readResetTimestampMs(statePath);
  const workspaceRoot = options.workspaceRoot || process.cwd();
  const bundleRoot = options.bundleRoot || (fs.existsSync(path.join(workspaceRoot, 'docs', 'okf')) ? path.join(workspaceRoot, 'docs', 'okf') : path.join(workspaceRoot, 'okf'));
  const excludeConvId = options.excludeConversationId || process.env.OKF_CURRENT_CONVERSATION_ID || null;
  let targetConvId = options.conversationId || null;

  const candidates = discoverTranscriptCandidates({
    brainDir: options.brainDir || process.env.OKF_BRAIN_DIR || null,
    excludeConversationId: excludeConvId,
    resetAtMs
  });

  if (!targetConvId && candidates.length > 0) {
    // Smart --latest: prefer the most recent substantive session (completed reply and not a pure /okf-learn meta-session)
    // so running /okf-learn automatically evaluates the prior real coding session.
    const substantive = candidates.find(c => c.isSubstantive);
    targetConvId = (substantive || candidates[0]).id;
  }

  const telemetry = {
    totalEvents: 0,
    bySkill: {},
    queryMisses: [],
    fallbacksUsed: [],
    contextBloats: [],
    slowRuns: []
  };

  if (telemetryPath && fs.existsSync(telemetryPath)) {
    try {
      const rawTel = fs.readFileSync(telemetryPath, 'utf8').trim();
      if (rawTel) {
        for (const line of rawTel.split(/\r?\n/)) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          telemetry.totalEvents++;
          telemetry.bySkill[ev.skill] = (telemetry.bySkill[ev.skill] || 0) + 1;
          const anoms = Array.isArray(ev.anomalies) ? ev.anomalies : [];
          if (anoms.includes('query_miss')) {
            if (!isQueryMissResolvedInBundle(ev.mode || 'file', ev.query, ev.workspaceRoot)) {
              telemetry.queryMisses.push({ timestamp: ev.timestamp, mode: ev.mode || 'file', query: ev.query, workspaceRoot: ev.workspaceRoot });
            }
          }
          if (anoms.includes('fallback_used')) {
            telemetry.fallbacksUsed.push({ timestamp: ev.timestamp, query: ev.query, matchTiers: ev.matchTiers, workspaceRoot: ev.workspaceRoot });
          }
          if (anoms.includes('context_bloat')) {
            telemetry.contextBloats.push({ timestamp: ev.timestamp, query: ev.query, outputBytes: ev.outputBytes, workspaceRoot: ev.workspaceRoot });
          }
          if (anoms.includes('slow_exec')) {
            telemetry.slowRuns.push({ timestamp: ev.timestamp, skill: ev.skill, durationMs: ev.durationMs, workspaceRoot: ev.workspaceRoot });
          }
        }
      }
    } catch (e) {}
  }

  const skillLearningsQueue = [];
  if (skillLearningsPath && fs.existsSync(skillLearningsPath)) {
    try {
      const rawNotes = fs.readFileSync(skillLearningsPath, 'utf8').trim();
      if (rawNotes) {
        for (const line of rawNotes.split(/\r?\n/)) {
          if (!line.trim()) continue;
          skillLearningsQueue.push(JSON.parse(line));
        }
      }
    } catch (e) {}
  }

  const learningSignals = {
    userCorrections: [],
    oversizedConcepts: []
  };

  if (fs.existsSync(bundleRoot)) {
    const concepts = walkBundleConcepts(bundleRoot, bundleRoot);
    for (const c of concepts) {
      if (c.bodyLength > 12000) {
        learningSignals.oversizedConcepts.push({
          file: c.file,
          title: c.frontmatter.title || c.file,
          bodyChars: c.bodyLength
        });
      }
    }
  }

  let targetTranscriptPath = null;
  if (targetConvId) {
    if (targetConvId.endsWith('.jsonl') && fs.existsSync(targetConvId)) {
      targetTranscriptPath = path.resolve(targetConvId);
      targetConvId = path.basename(targetConvId, '.jsonl');
    } else {
      const matchedCandidate = candidates.find(c => c.id === targetConvId);
      if (matchedCandidate) {
        targetTranscriptPath = matchedCandidate.tPath;
      } else {
        const agyFallback = path.join(brainDir, targetConvId, '.system_generated', 'logs', 'transcript.jsonl');
        const flatFallback = path.join(brainDir, `${targetConvId}.jsonl`);
        targetTranscriptPath = fs.existsSync(flatFallback) ? flatFallback : agyFallback;
      }
    }
  }
  const { conversation, userCorrections } = analyzeSingleTranscript(targetTranscriptPath, targetConvId, { resetAtMs });
  learningSignals.userCorrections = userCorrections;

  const recentSessions = [];
  if (options.recentLimit && options.recentLimit > 0 && candidates.length > 0) {
    const substantiveCandidates = candidates.filter(c => c.isSubstantive);
    const pool = substantiveCandidates.length > 0 ? substantiveCandidates : candidates;
    for (const cand of pool.slice(0, options.recentLimit)) {
      const { conversation: cSummary } = analyzeSingleTranscript(cand.tPath, cand.id, { resetAtMs });
      recentSessions.push({
        conversationId: cand.id,
        transcriptFormat: cSummary.transcriptFormat,
        inferredWorkspace: cSummary.inferredWorkspace,
        stepCount: cSummary.stepCount,
        userTurnCount: cSummary.userTurnCount,
        scorePercent: cSummary.gateCompliance.scorePercent,
        queryMisses: cSummary.friction.queryMisses.length,
        contextBloat: cSummary.friction.contextBloat.length,
        toolErrors: cSummary.friction.toolErrors.total
      });
    }
  }

  const recommendations = [];
  if (skillLearningsQueue.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      category: 'skill-backlog',
      message: `${skillLearningsQueue.length} queued skill-level learning note(s) in ~/.okf/skill-learnings.jsonl (${skillLearningsQueue.map(n => `[${n.skill}] ${n.message}`).slice(0, 3).join('; ')}). Apply inside okf-skills and clear with "node okf-learn/scripts/learn.js --clear-notes".`
    });
  }
  if (conversation.friction.queryMisses.length > 0 || telemetry.queryMisses.length > 0) {
    const allMisses = [
      ...conversation.friction.queryMisses.map(m => ({
        mode: m.mode || (m.missedTarget === '(search query)' ? 'search' : 'file'),
        target: m.missedTarget
      })),
      ...telemetry.queryMisses.map(m => ({
        mode: m.mode || 'file',
        target: m.query
      }))
    ].filter(m => m.target);
    const fileMissTargets = Array.from(new Set(allMisses.filter(m => m.mode !== 'search').map(m => m.target))).slice(0, 5);
    const searchMissTargets = Array.from(new Set(allMisses.filter(m => m.mode === 'search').map(m => m.target))).slice(0, 5);
    if (fileMissTargets.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'concept-coverage',
        message: `Bind missed files in docs/okf/ concepts using "node okf-learn/scripts/learn.js --bind <file> --concept <concept>" for queried paths (${fileMissTargets.join(', ')}).`
      });
    }
    if (searchMissTargets.length > 0) {
      recommendations.push({
        priority: 'MED',
        category: 'search-coverage',
        message: `Add missing search keywords/tags to relevant concepts (or author a new concept) for missed search queries (${searchMissTargets.join(', ')}).`
      });
    }
  }
  if (
    conversation.friction.contextBloat.length > 0 ||
    telemetry.contextBloats.length > 0 ||
    learningSignals.oversizedConcepts.length > 0
  ) {
    recommendations.push({
      priority: 'HIGH',
      category: 'context-budget',
      message: 'Large query output or oversized concept (>12KB) detected. Split oversized concepts or narrow resource/sources bindings.'
    });
  }
  if (learningSignals.userCorrections.length > 0) {
    recommendations.push({
      priority: 'MED',
      category: 'lesson-extraction',
      message: `Detected ${learningSignals.userCorrections.length} corrective user turn(s). Review learningSignals.userCorrections and codify durable constraints in the relevant OKF concept.`
    });
  }
  if (conversation.friction.slowCommands.length > 0 || telemetry.slowRuns.length > 0) {
    recommendations.push({
      priority: 'MED',
      category: 'performance',
      message: 'OKF CLI command exceeded wait threshold or backgrounded. Ensure git commit batching is active or increase WaitMsBeforeAsync.'
    });
  }
  if (conversation.friction.toolErrors.editFileTargetNotFound > 0) {
    recommendations.push({
      priority: 'MED',
      category: 'editing-ergonomics',
      message: `Detected ${conversation.friction.toolErrors.editFileTargetNotFound} edit_file target-not-found error(s). On Windows CRLF files, use single-line Target strings or read exact line ranges before editing.`
    });
  }
  if (conversation.found && conversation.gateCompliance.scorePercent < 100) {
    recommendations.push({
      priority: 'HIGH',
      category: 'gate-compliance',
      message: `OKF Steering Gate compliance was ${conversation.gateCompliance.scorePercent}%. Ensure session-start lint, pre-work query, concept citations, and pre-completion maintain run in every task.`
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'LOW',
      category: 'healthy',
      message: 'All OKF gates passed with zero query misses, context bloat, or slow commands.'
    });
  }

  return {
    success: true,
    conversation,
    recentSessions,
    telemetry,
    skillLearningsQueue,
    learningSignals,
    recommendations
  };
}

function printHelp() {
  console.log(`
OKF Learn (v0.2) — Session Transcript & Telemetry Self-Improvement Engine
Usage: node okf-learn/scripts/learn.js [<conversation-id> | --latest] [options]

Modes:
  --latest (or no args)            Evaluate the most recent post-reset coding session + ~/.okf/telemetry.jsonl.
  <conversation-id>                Evaluate a specific conversation transcript ID or .jsonl path.
  --recent [N]                     Summarize the last N (default 5) substantive post-reset sessions.
  --bind <file> --concept <md>     Add <file> to <md>'s sources: frontmatter and refresh generated.at.
  --note "<msg>" [--skill <name>]  Append a cross-repo skill improvement item to ~/.okf/skill-learnings.jsonl.
  --clear-notes                    Clear queued notes in ~/.okf/skill-learnings.jsonl.
  --reset                          Clear telemetry, skill notes, and advance the ~/.okf/learn-state.json watermark.

Options:
  --bundle <path>                  Custom OKF bundle path (default: 'docs/okf' or 'okf').
  --brain-dir <path>               Custom transcript root directory.
  --exclude <conversation-id>      Exclude a specific conversation ID from --latest / --recent discovery.
  --json                           Emit structured JSON report.
  -h, --help                       Show this help message and exit.
`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }
  const isJson = args.includes('--json');
  const telPath = resolveTelemetryPath(args) || path.join(os.homedir(), '.okf', 'telemetry.jsonl');
  const learningsPath = resolveSkillLearningsPath(args);
  const statePath = resolveLearnStatePath(args, telPath);

  if (args.includes('--clear-notes')) {
    try {
      const dir = path.dirname(learningsPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(learningsPath, '', 'utf8');
    } catch (e) {}
    if (isJson) {
      console.log(JSON.stringify({ success: true, clearedNotes: true, learningsPath }, null, 2));
    } else {
      console.log('✓ OKF skill learnings queue cleared.');
    }
    return;
  }

  if (args.includes('--reset')) {
    const resetAt = new Date().toISOString();
    try {
      const dir = path.dirname(telPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(telPath, '', 'utf8');
      if (fs.existsSync(learningsPath)) {
        fs.writeFileSync(learningsPath, '', 'utf8');
      }
      const stateDir = path.dirname(statePath);
      if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify({ resetAt }, null, 2) + '\n', 'utf8');
    } catch (e) {}
    if (isJson) {
      console.log(JSON.stringify({ success: true, reset: true, resetAt, telemetryPath: telPath, learningsPath, statePath }, null, 2));
    } else {
      console.log('✓ OKF telemetry log, skill learnings queue, and session history watermark cleared.');
    }
    return;
  }

  const noteIdx = args.indexOf('--note');
  if (noteIdx !== -1 && args[noteIdx + 1]) {
    const { workspaceRoot } = resolveWorkspaceAndBundle(args);
    const skillIdx = args.indexOf('--skill');
    const catIdx = args.indexOf('--category');
    const res = recordSkillLearning(
      {
        workspaceRoot,
        skill: skillIdx !== -1 && args[skillIdx + 1] ? args[skillIdx + 1] : 'okf-skills',
        category: catIdx !== -1 && args[catIdx + 1] ? args[catIdx + 1] : 'general',
        message: args[noteIdx + 1]
      },
      args
    );
    if (isJson) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`✓ Queued skill learning note for [${res.note.skill}] in ${res.learningsPath}`);
    }
    return;
  }

  const bindIdx = args.indexOf('--bind');
  const conceptIdx = args.indexOf('--concept');
  if (bindIdx !== -1 && args[bindIdx + 1] && conceptIdx !== -1 && args[conceptIdx + 1]) {
    const { workspaceRoot, bundleRoot } = resolveWorkspaceAndBundle(args);
    const res = bindSourceToConcept({
      workspaceRoot,
      bundleRoot,
      filePath: args[bindIdx + 1],
      conceptRelPath: args[conceptIdx + 1]
    });
    if (isJson) {
      console.log(JSON.stringify(res, null, 2));
    } else if (res.bound) {
      console.log(`✓ Bound '${res.file}' into concept '${res.concept}'.`);
    } else {
      console.log(`ℹ '${res.file}' is already bound in '${res.concept}'.`);
    }
    return;
  }

  const { workspaceRoot, bundleRoot } = resolveWorkspaceAndBundle(args);
  let conversationId = null;
  const convFlagIdx = args.indexOf('--conversation');
  const evalFlagIdx = args.indexOf('--evaluate');
  const excludeIdx = args.indexOf('--exclude');
  const excludeConversationId = (excludeIdx !== -1 && args[excludeIdx + 1]) ? args[excludeIdx + 1] : undefined;

  let recentLimit = 0;
  const recentIdx = args.indexOf('--recent');
  if (recentIdx !== -1) {
    const nextArg = args[recentIdx + 1];
    if (nextArg && !nextArg.startsWith('--') && /^\d+$/.test(nextArg)) {
      recentLimit = parseInt(nextArg, 10);
    } else {
      recentLimit = 5;
    }
  }

  if (convFlagIdx !== -1 && args[convFlagIdx + 1] && !args[convFlagIdx + 1].startsWith('--')) {
    conversationId = args[convFlagIdx + 1];
  } else if (evalFlagIdx !== -1 && args[evalFlagIdx + 1] && !args[evalFlagIdx + 1].startsWith('--')) {
    conversationId = args[evalFlagIdx + 1];
  } else {
    const flagsWithVal = new Set([
      '--brain-dir',
      '--bundle',
      '--telemetry',
      '--learnings',
      '--state',
      '--conversation',
      '--evaluate',
      '--bind',
      '--concept',
      '--note',
      '--skill',
      '--category',
      '--exclude'
    ]);
    for (let i = 0; i < args.length; i++) {
      if (flagsWithVal.has(args[i])) {
        i++;
        continue;
      }
      if (args[i] === '--recent') {
        if (args[i + 1] && /^\d+$/.test(args[i + 1])) i++;
        continue;
      }
      if (!args[i].startsWith('--')) {
        conversationId = args[i];
        break;
      }
    }
  }

  const brainIdx = args.indexOf('--brain-dir');
  const brainDir = (brainIdx !== -1 && args[brainIdx + 1]) ? path.resolve(args[brainIdx + 1]) : undefined;
  const report = evaluateSkillsPerformance({
    conversationId,
    excludeConversationId,
    recentLimit,
    brainDir,
    telemetryPath: telPath,
    skillLearningsPath: learningsPath,
    statePath,
    workspaceRoot,
    bundleRoot
  });

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const c = report.conversation;
  const t = report.telemetry;
  const ls = report.learningSignals;
  console.log('==========================================================');
  console.log(`OKF Skill Self-Improvement Report${c.conversationId ? ` (Conversation: ${c.conversationId})` : ''}`);
  console.log('==========================================================');
  if (c.warning) {
    console.log(`⚠️  Warning:          ${c.warning}`);
  }
  if (c.found && c.transcriptFormat !== 'unrecognized' && c.transcriptFormat !== 'empty') {
    console.log(`Session Metrics:     ${c.stepCount} steps | ${c.userTurnCount} user turns | ${c.durationMinutes} min${c.transcriptFormat ? ` | Format: ${c.transcriptFormat}` : ''}${c.inferredWorkspace ? ` | Workspace: ${c.inferredWorkspace}` : ''}`);
    console.log(`Gate Compliance:     ${c.gateCompliance.scorePercent}%`);
    console.log(`  - Session-start lint --drift:   ${c.gateCompliance.sessionStartLint ? 'PASS' : 'MISS'}`);
    console.log(`  - Pre-work okf-query calls:     ${c.gateCompliance.preWorkQueries > 0 ? `PASS (${c.gateCompliance.preWorkQueries} calls)` : 'MISS'}`);
    console.log(`  - OKF Check citations:          ${c.gateCompliance.conceptCitations > 0 ? `PASS (${c.gateCompliance.conceptCitations} turns)` : 'MISS'}`);
    console.log(`  - Pre-completion okf-maintain:  ${c.gateCompliance.preCompletionMaintain ? 'PASS' : 'MISS'}`);
    console.log('----------------------------------------------------------');
    console.log('Transcript Friction:');
    console.log(`  - Query misses:                 ${c.friction.queryMisses.length}${c.friction.queryMisses.length ? ` (${c.friction.queryMisses.map(m => m.missedTarget).join(', ')})` : ''}`);
    console.log(`  - Context bloat (>40KB):        ${c.friction.contextBloat.length}${c.friction.contextBloat.length ? ` (${c.friction.contextBloat.map(b => `step ${b.step}: ${Math.round(b.bytes / 1024)}KB`).join(', ')})` : ''}`);
    console.log(`  - Backgrounded slow commands:   ${c.friction.slowCommands.length}`);
    console.log(`  - Tool errors:                  ${c.friction.toolErrors.total} (edit_file target-not-found: ${c.friction.toolErrors.editFileTargetNotFound})`);
    console.log('----------------------------------------------------------');
    console.log('Qualitative Learning Signals:');
    console.log(`  - User corrections detected:    ${ls.userCorrections.length}`);
    console.log(`  - Oversized concepts (>12KB):   ${ls.oversizedConcepts.length}${ls.oversizedConcepts.length ? ` (${ls.oversizedConcepts.map(o => o.file).join(', ')})` : ''}`);
  } else {
    console.log('Transcript:          No matching conversation transcript found.');
  }
  if (report.recentSessions && report.recentSessions.length > 0) {
    console.log('----------------------------------------------------------');
    console.log(`Recent Substantive Sessions (${report.recentSessions.length}):`);
    for (const rs of report.recentSessions) {
      console.log(`  - ${rs.conversationId} | ${rs.stepCount} steps | gates: ${rs.scorePercent}% | misses: ${rs.queryMisses} | bloat: ${rs.contextBloat} | errors: ${rs.toolErrors}${rs.inferredWorkspace ? ` | ${rs.inferredWorkspace}` : ''}`);
    }
  }
  if (report.skillLearningsQueue && report.skillLearningsQueue.length > 0) {
    console.log('----------------------------------------------------------');
    console.log(`Queued Cross-Repo Skill Learnings (${report.skillLearningsQueue.length}):`);
    for (const qn of report.skillLearningsQueue) {
      console.log(`  - [${qn.skill}/${qn.category}] ${qn.message} (from ${qn.workspaceRoot})`);
    }
  }
  console.log('----------------------------------------------------------');
  console.log(`Passive Telemetry:   ${t.totalEvents} CLI events recorded`);
  console.log(`  - Query misses:                 ${t.queryMisses.length} | Fallbacks used: ${t.fallbacksUsed.length}`);
  console.log(`  - Context bloats (>40KB):       ${t.contextBloats.length} | Slow runs (>2s): ${t.slowRuns.length}`);
  console.log('----------------------------------------------------------');
  console.log('Actionable Recommendations:');
  for (let i = 0; i < report.recommendations.length; i++) {
    const r = report.recommendations[i];
    console.log(`  ${i + 1}. [${r.priority}] (${r.category}) ${r.message}`);
  }
  console.log('==========================================================');
}

if (require.main === module) {
  main();
}

module.exports = {
  parseFrontmatter,
  evaluateSkillsPerformance,
  analyzeSingleTranscript,
  discoverTranscriptCandidates,
  isUserCorrectionTurn,
  hasConceptCitation,
  collectWorkspaceConceptHints,
  measureOkfContextBlockBytes,
  bindSourceToConcept,
  recordTelemetry,
  recordSkillLearning,
  resolveSkillLearningsPath
};
