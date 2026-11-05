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
            bodyLength: body.trim().length
          });
        }
      } catch (e) {}
    }
  }
  return results;
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
  const nowIso = new Date().toISOString();

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

function analyzeSingleTranscript(transcriptPath, convId) {
  const conversation = {
    conversationId: convId,
    found: false,
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
    return { conversation, userCorrections };
  }

  conversation.found = true;
  const lines = fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/).filter(Boolean);
  let firstTimeMs = null;
  let lastTimeMs = null;

  for (const line of lines) {
    let step;
    try { step = JSON.parse(line); } catch (e) { continue; }
    conversation.stepCount++;
    if (step.created_at) {
      const ms = new Date(step.created_at).getTime();
      if (!isNaN(ms)) {
        if (firstTimeMs === null || ms < firstTimeMs) firstTimeMs = ms;
        if (lastTimeMs === null || ms > lastTimeMs) lastTimeMs = ms;
      }
    }
    if (step.type === 'USER_INPUT') {
      conversation.userTurnCount++;
      const rawReqMatch = String(step.content || '').match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i);
      const userText = (rawReqMatch ? rawReqMatch[1] : String(step.content || '')).trim();
      if (/\b(no[,\s]|instead\b|don't\b|wrong\b|not working\b|still broken\b|should be\b|why did you\b)/i.test(userText)) {
        userCorrections.push({
          step: step.step_index,
          excerpt: userText.slice(0, 240)
        });
      }
    }
    if (step.type === 'PLANNER_RESPONSE') {
      conversation.tokens.inputTokens += Number(step.input_tokens || 0);
      conversation.tokens.cacheReadTokens += Number(step.cache_read_tokens || 0);
      conversation.tokens.outputTokens += Number(step.output_tokens || 0);
      const content = String(step.content || '');
      if (/OKF Check|OKF Citations|docs\/okf\/|\/okf\/concepts\//i.test(content)) {
        conversation.gateCompliance.conceptCitations++;
      }
      if (Array.isArray(step.tool_calls)) {
        for (const tc of step.tool_calls) {
          const tcArgs = (tc && tc.args) || {};
          if (tcArgs.Path && typeof tcArgs.Path === 'string') {
            if (!conversation.inferredWorkspace) {
              const inferred = inferWorkspaceFromPath(tcArgs.Path);
              if (inferred) conversation.inferredWorkspace = inferred;
            }
            if (tc.name === 'read_file' && /(?:^|[\/\\])okf[\/\\]index\.md["']*$/i.test(tcArgs.Path)) {
              conversation.gateCompliance.preWorkQueries++;
            }
          }
          const cmd = tcArgs.CommandLine ? String(tcArgs.CommandLine) : '';
          if (/lint\.js\b/.test(cmd) && /--drift\b/.test(cmd)) {
            conversation.gateCompliance.sessionStartLint = true;
          }
          const qMatches = cmd.match(/query\.js\b/g);
          if (qMatches) {
            conversation.gateCompliance.preWorkQueries += qMatches.length;
          }
          if (/maintain\.js\b/.test(cmd)) {
            conversation.gateCompliance.preCompletionMaintain = true;
          }
        }
      }
    }

    const stepContent = String(step.content || '');
    const isReadFileOutput = /\n(?:Showing lines \d+-\d+ of \d+|Partial read \(lines \d+-\d+ of \d+\))\r?\n/.test(stepContent);
    if (!isReadFileOutput) {
      const missFileMatch = stepContent.match(/^No matching OKF concepts found for file:\s*([^\r\n]+)$/m);
      if (missFileMatch && !/[$`/*?<>|();]/.test(missFileMatch[1])) {
        conversation.friction.queryMisses.push({
          step: step.step_index,
          missedTarget: missFileMatch[1].trim()
        });
      } else if (/^No matching OKF concepts found\.$/m.test(stepContent)) {
        conversation.friction.queryMisses.push({
          step: step.step_index,
          missedTarget: '(search query)'
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
              const head = fs.readFileSync(localOutPath, 'utf8').slice(0, 2048);
              if (head.includes('OKF CONTEXT BLOCK') && stat.size > 40000) {
                conversation.friction.contextBloat.push({
                  step: step.step_index,
                  bytes: stat.size,
                  file: localOutPath
                });
              }
            } catch (e) {}
          }
        }
      }
    }

    if (stepContent.includes('Tool is running as a background task')) {
      const descMatch = stepContent.match(/Task Description:\s*([^\r\n]+)/);
      if (descMatch && /okf-(?:query|maintain|lint|prune|visualize|wayfinder|learn)|(?:query|maintain|lint|learn)\.js/i.test(descMatch[1])) {
        conversation.friction.slowCommands.push({
          step: step.step_index,
          command: descMatch[1].trim(),
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

  if (firstTimeMs !== null && lastTimeMs !== null && lastTimeMs >= firstTimeMs) {
    conversation.durationMinutes = Math.round(((lastTimeMs - firstTimeMs) / 60000) * 10) / 10;
  }

  const gatesPassed =
    (conversation.gateCompliance.sessionStartLint ? 1 : 0) +
    (conversation.gateCompliance.preWorkQueries > 0 ? 1 : 0) +
    (conversation.gateCompliance.conceptCitations > 0 ? 1 : 0) +
    (conversation.gateCompliance.preCompletionMaintain ? 1 : 0);
  conversation.gateCompliance.scorePercent = Math.round((gatesPassed / 4) * 100);

  return { conversation, userCorrections };
}

function evaluateSkillsPerformance(options = {}) {
  const brainDir = options.brainDir || process.env.OKF_BRAIN_DIR || path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');
  const telemetryPath = options.telemetryPath;
  const skillLearningsPath = options.skillLearningsPath || resolveSkillLearningsPath();
  const workspaceRoot = options.workspaceRoot || process.cwd();
  const bundleRoot = options.bundleRoot || (fs.existsSync(path.join(workspaceRoot, 'docs', 'okf')) ? path.join(workspaceRoot, 'docs', 'okf') : path.join(workspaceRoot, 'okf'));
  const excludeConvId = options.excludeConversationId || process.env.OKF_CURRENT_CONVERSATION_ID || null;
  let targetConvId = options.conversationId || null;

  const candidates = [];
  if (fs.existsSync(brainDir)) {
    for (const entry of fs.readdirSync(brainDir)) {
      if (excludeConvId && entry === excludeConvId) continue;
      const tPath = path.join(brainDir, entry, '.system_generated', 'logs', 'transcript.jsonl');
      if (fs.existsSync(tPath)) {
        try {
          const rawLines = fs.readFileSync(tPath, 'utf8').split(/\r?\n/).filter(Boolean);
          candidates.push({
            id: entry,
            tPath,
            mtimeMs: fs.statSync(tPath).mtimeMs,
            stepCount: rawLines.length
          });
        } catch (e) {}
      }
    }
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  if (!targetConvId && candidates.length > 0) {
    // Smart --latest: prefer the most recent substantive session (>= 6 steps) so running /okf-learn
    // from a freshly opened meta-session automatically evaluates the prior real coding session.
    const substantive = candidates.find(c => c.stepCount >= 6);
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
            telemetry.queryMisses.push({ timestamp: ev.timestamp, query: ev.query, workspaceRoot: ev.workspaceRoot });
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

  const targetTranscriptPath = targetConvId
    ? path.join(brainDir, targetConvId, '.system_generated', 'logs', 'transcript.jsonl')
    : null;
  const { conversation, userCorrections } = analyzeSingleTranscript(targetTranscriptPath, targetConvId);
  learningSignals.userCorrections = userCorrections;

  const recentSessions = [];
  if (options.recentLimit && options.recentLimit > 0 && candidates.length > 0) {
    const substantiveCandidates = candidates.filter(c => c.stepCount >= 6);
    const pool = substantiveCandidates.length > 0 ? substantiveCandidates : candidates;
    for (const cand of pool.slice(0, options.recentLimit)) {
      const { conversation: cSummary } = analyzeSingleTranscript(cand.tPath, cand.id);
      recentSessions.push({
        conversationId: cand.id,
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
    const targets = [
      ...conversation.friction.queryMisses.map(m => m.missedTarget),
      ...telemetry.queryMisses.map(m => m.query)
    ].filter(Boolean);
    const uniqueTargets = Array.from(new Set(targets)).slice(0, 5);
    recommendations.push({
      priority: 'HIGH',
      category: 'concept-coverage',
      message: `Bind missed files in docs/okf/ concepts using "node okf-learn/scripts/learn.js --bind <file> --concept <concept>" for queried paths (${uniqueTargets.join(', ')}).`
    });
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

function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const telPath = resolveTelemetryPath(args) || path.join(os.homedir(), '.okf', 'telemetry.jsonl');
  const learningsPath = resolveSkillLearningsPath(args);

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
    try {
      const dir = path.dirname(telPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(telPath, '', 'utf8');
      if (fs.existsSync(learningsPath)) {
        fs.writeFileSync(learningsPath, '', 'utf8');
      }
    } catch (e) {}
    if (isJson) {
      console.log(JSON.stringify({ success: true, reset: true, telemetryPath: telPath, learningsPath }, null, 2));
    } else {
      console.log('✓ OKF telemetry log and skill learnings queue cleared.');
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
  if (c.found) {
    console.log(`Session Metrics:     ${c.stepCount} steps | ${c.userTurnCount} user turns | ${c.durationMinutes} min${c.inferredWorkspace ? ` | Workspace: ${c.inferredWorkspace}` : ''}`);
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
  bindSourceToConcept,
  recordTelemetry,
  recordSkillLearning,
  resolveSkillLearningsPath
};
