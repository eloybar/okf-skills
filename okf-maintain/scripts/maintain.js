const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');

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

const ROOT_HYGIENE_FILES = new Set([
  '.gitignore', '.gitattributes', '.gitmodules', '.editorconfig',
  '.nvmrc', '.node-version', '.npmrc', '.yarnrc', '.yarnrc.yml',
  '.prettierignore', '.eslintignore', '.dockerignore', '.stylelintignore',
  'license', 'license.md', 'license.txt', 'skills-lock.json'
]);

function isRootHygieneQueryTarget(rawTarget) {
  if (!rawTarget || typeof rawTarget !== 'string') return false;
  const cleanedTarget = rawTarget.replace(/\s*\(repository hygiene\/config file[^)]*\)\s*$/i, '').trim();
  const parts = cleanedTarget.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(part => {
    const base = path.basename(part.replace(/\\/g, '/')).toLowerCase();
    return ROOT_HYGIENE_FILES.has(base);
  });
}

function checkSessionAnomaliesForNudge(workspaceRoot, args = []) {
  const telPath = resolveTelemetryPath(args);
  if (!telPath || !fs.existsSync(telPath)) return null;
  try {
    const raw = fs.readFileSync(telPath, 'utf8').trim();
    if (!raw) return null;
    const wsNorm = path.resolve(workspaceRoot).toLowerCase();
    const entries = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch (e) { return null; }
      })
      .filter(e => e && e.workspaceRoot && path.resolve(e.workspaceRoot).toLowerCase() === wsNorm);

    let lastMaintainIdx = -1;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].skill === 'okf-maintain' && entries[i].mode === 'sync') {
        lastMaintainIdx = i;
        break;
      }
    }

    const recentWindowMs = 60 * 60 * 1000;
    const nowMs = Date.now();
    const slice = entries.slice(lastMaintainIdx + 1).filter(e => {
      const t = e.timestamp ? new Date(e.timestamp).getTime() : nowMs;
      return isNaN(t) || (nowMs - t <= recentWindowMs);
    });
    if (slice.length === 0) return null;

    let queryMisses = 0;
    let contextBloats = 0;
    let slowRuns = 0;
    const missedQueries = [];
    for (const e of slice) {
      const anoms = Array.isArray(e.anomalies) ? e.anomalies : [];
      if (anoms.includes('query_miss')) {
        if (e.mode !== 'search' && isRootHygieneQueryTarget(e.query)) continue;
        queryMisses++;
        if (e.query) missedQueries.push(e.query);
      }
      if (anoms.includes('context_bloat')) contextBloats++;
      if (anoms.includes('slow_exec')) slowRuns++;
    }

    if (queryMisses === 0 && contextBloats === 0 && slowRuns === 0) return null;
    const parts = [];
    if (queryMisses > 0) {
      const uniqueMissed = Array.from(new Set(missedQueries)).slice(0, 3);
      const missedSuffix = uniqueMissed.length > 0 ? ` [${uniqueMissed.join(', ')}]` : '';
      parts.push(`${queryMisses} query miss${queryMisses === 1 ? '' : 'es'}${missedSuffix}`);
    }
    if (contextBloats > 0) parts.push(`${contextBloats} bloated output${contextBloats === 1 ? '' : 's'}`);
    if (slowRuns > 0) parts.push(`${slowRuns} slow run${slowRuns === 1 ? '' : 's'}`);
    return `💡 [OKF Self-Improvement] Session telemetry recorded ${parts.join(', ')} — invoke okf-learn (run "node okf-learn/scripts/learn.js --latest" or "node okf-maintain/scripts/maintain.js --evaluate --latest") to inspect and remediate.`;
  } catch (e) {
    return null;
  }
}

function fileUriToPath(uri) {
  let cleaned = uri.replace(/^file:\/\/\/?/, '');
  try { cleaned = decodeURIComponent(cleaned); } catch (e) {}
  if (process.platform !== 'win32' && !cleaned.startsWith('/')) {
    cleaned = '/' + cleaned;
  }
  return path.normalize(cleaned);
}

function evaluateSkillsPerformance(options = {}) {
  const siblingLearnScript = path.resolve(__dirname, '..', '..', 'okf-learn', 'scripts', 'learn.js');
  if (fs.existsSync(siblingLearnScript)) {
    try {
      const learnMod = require(siblingLearnScript);
      if (learnMod && typeof learnMod.evaluateSkillsPerformance === 'function') {
        return learnMod.evaluateSkillsPerformance(options);
      }
    } catch (e) {}
  }

  const brainDir = options.brainDir || process.env.OKF_BRAIN_DIR || path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');
  const telemetryPath = options.telemetryPath;
  let targetConvId = options.conversationId || null;

  if (!targetConvId && fs.existsSync(brainDir)) {
    const candidates = [];
    for (const entry of fs.readdirSync(brainDir)) {
      const tPath = path.join(brainDir, entry, '.system_generated', 'logs', 'transcript.jsonl');
      if (fs.existsSync(tPath)) {
        try {
          candidates.push({ id: entry, mtimeMs: fs.statSync(tPath).mtimeMs });
        } catch (e) {}
      }
    }
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (candidates.length > 0) {
      targetConvId = candidates[0].id;
    }
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
            telemetry.fallbacksUsed.push({ timestamp: ev.timestamp, query: ev.query, matchTiers: ev.matchTiers });
          }
          if (anoms.includes('context_bloat')) {
            telemetry.contextBloats.push({ timestamp: ev.timestamp, query: ev.query, outputBytes: ev.outputBytes });
          }
          if (anoms.includes('slow_exec')) {
            telemetry.slowRuns.push({ timestamp: ev.timestamp, skill: ev.skill, durationMs: ev.durationMs });
          }
        }
      }
    } catch (e) {}
  }

  const conversation = {
    conversationId: targetConvId,
    found: false,
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

  if (targetConvId) {
    const transcriptPath = path.join(brainDir, targetConvId, '.system_generated', 'logs', 'transcript.jsonl');
    if (fs.existsSync(transcriptPath)) {
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
              if (tc && tc.name === 'read_file' && tcArgs.Path && /(?:^|[\/\\])okf[\/\\]index\.md["']*$/i.test(String(tcArgs.Path))) {
                conversation.gateCompliance.preWorkQueries++;
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
          if (missFileMatch && !/[$`*?<>|();]/.test(missFileMatch[1])) {
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
              const belongsToConv = !targetConvId || localOutPath.toLowerCase().includes(String(targetConvId).toLowerCase());
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
          if (descMatch && /okf-(?:query|maintain|lint|prune|visualize|wayfinder)|(?:query|maintain|lint)\.js/i.test(descMatch[1])) {
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
    }
  }

  const recommendations = [];
  if (conversation.friction.queryMisses.length > 0 || telemetry.queryMisses.length > 0) {
    const targets = [
      ...conversation.friction.queryMisses.map(m => m.missedTarget),
      ...telemetry.queryMisses.map(m => m.query)
    ].filter(Boolean);
    const uniqueTargets = Array.from(new Set(targets)).slice(0, 5);
    recommendations.push({
      priority: 'HIGH',
      category: 'concept-coverage',
      message: `Bind missed files or add secondary sources: in docs/okf/ concepts for queried paths (${uniqueTargets.join(', ')}).`
    });
  }
  if (conversation.friction.contextBloat.length > 0 || telemetry.contextBloats.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      category: 'context-budget',
      message: 'Large query output caused context truncation (>40KB). Split oversized concepts or narrow resource/sources bindings.'
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
    telemetry,
    recommendations
  };
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

function resolveResourceLocalPath(resourceUri, workspaceRoot, bundleRoot = null) {
  if (!resourceUri || typeof resourceUri !== 'string') return null;
  const trimmed = resourceUri.trim();
  if (/^(?!file:\/\/)[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(trimmed)) return null;
  if (/^(?!file:)[a-zA-Z][a-zA-Z0-9+.-]+:/i.test(trimmed)) return null;
  if (!/^file:\/\//i.test(trimmed) && /\s/.test(trimmed) && !/[\/\\]/.test(trimmed)) return null;

  const isFileUri = /^file:\/\//i.test(trimmed);
  let localPath = trimmed.replace(/^file:\/\/\/?/, '').replace(/[?#].*$/, '');
  if (/%[0-9A-Fa-f]{2}/.test(localPath)) {
    try {
      localPath = decodeURIComponent(localPath);
    } catch (e) {}
  }
  if (!isFileUri && localPath.startsWith('/') && bundleRoot) {
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

function isReservedBundleFile(filePath, bundleRoot) {
  if (!filePath || !bundleRoot) return false;
  const absFile = path.resolve(filePath).toLowerCase();
  const absBundle = path.resolve(bundleRoot).toLowerCase();
  if (!absFile.startsWith(absBundle + path.sep)) return false;
  const base = path.basename(absFile);
  return base === 'log.md' || base === 'index.md' || base === 'viz.html';
}

const gitModifiedCache = new Map();
const gitDirtySetByCwd = new Map();
const gitTopLevelByCwd = new Map();
const gitRepoCommitMapByTop = new Map();
const gitRepoCommitHashByTop = new Map();
const gitRepoCommitFilesByTop = new Map();
const gitRepoHeadByTop = new Map();
const gitCommitOnlyCache = new Map();

function getGitTopLevel(execCwd) {
  const normCwd = path.resolve(execCwd).toLowerCase();
  if (gitTopLevelByCwd.has(normCwd)) {
    return gitTopLevelByCwd.get(normCwd);
  }
  let topLevel = null;
  try {
    topLevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: execCwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (e) {
    topLevel = null;
  }
  gitTopLevelByCwd.set(normCwd, topLevel);
  return topLevel;
}

function resolveGitScope(execCwd, targetFile = null) {
  const topLevel = getGitTopLevel(execCwd);
  if (!topLevel) return null;
  const absTop = path.resolve(topLevel);
  const absExec = path.resolve(execCwd);
  const relExec = path.relative(absTop, absExec);
  const isInsideTop = Boolean(relExec && !relExec.startsWith('..') && !path.isAbsolute(relExec));
  const isSubpkgRoot =
    isInsideTop &&
    (fs.existsSync(path.join(absExec, 'docs', 'okf')) || fs.existsSync(path.join(absExec, 'okf')));

  if (isSubpkgRoot) {
    if (targetFile) {
      const absTarget = path.resolve(targetFile);
      const relTarget = path.relative(absExec, absTarget);
      if (relTarget.startsWith('..') || path.isAbsolute(relTarget)) {
        return { topLevel: absTop, scopeRoot: absTop, scopeKey: absTop.toLowerCase(), relPathspec: null };
      }
    }
    return {
      topLevel: absTop,
      scopeRoot: absExec,
      scopeKey: absExec.toLowerCase(),
      relPathspec: relExec.replace(/\\/g, '/')
    };
  }
  return { topLevel: absTop, scopeRoot: absTop, scopeKey: absTop.toLowerCase(), relPathspec: null };
}

function getRepoCommitTimeMap(execCwd, forceRefresh = false, targetFile = null) {
  const scope = resolveGitScope(execCwd, targetFile);
  if (!scope) return new Map();
  const { topLevel, scopeRoot, scopeKey, relPathspec } = scope;
  if (!forceRefresh && gitRepoCommitMapByTop.has(scopeKey)) {
    return gitRepoCommitMapByTop.get(scopeKey);
  }
  let headSha = null;
  try {
    headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: topLevel,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (e) {}

  if (headSha && gitRepoCommitMapByTop.has(scopeKey) && gitRepoHeadByTop.get(scopeKey) === headSha) {
    return gitRepoCommitMapByTop.get(scopeKey);
  }

  const commitMap = new Map();
  const commitHashMap = new Map();
  const commitFilesMap = new Map();
  const cachePath = headSha
    ? path.join(os.tmpdir(), `okf-gitlog-v2-${Buffer.from(scopeKey).toString('hex').slice(-24)}-${headSha}.json`)
    : null;

  let loadedFromDisk = false;
  if (cachePath && fs.existsSync(cachePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (parsed && parsed.v === 2 && Array.isArray(parsed.hashes) && Array.isArray(parsed.entries)) {
        const { hashes, entries, mdCommits } = parsed;
        for (const [relP, iso, hIdx] of entries) {
          const absP = path.resolve(scopeRoot, relP).toLowerCase();
          commitMap.set(absP, iso);
          if (hIdx >= 0 && hashes[hIdx]) commitHashMap.set(absP, hashes[hIdx]);
        }
        if (Array.isArray(mdCommits)) {
          for (const [hIdx, relArr] of mdCommits) {
            const h = hashes[hIdx];
            if (h && Array.isArray(relArr)) {
              commitFilesMap.set(h, new Set(relArr.map(rp => path.resolve(scopeRoot, rp).toLowerCase())));
            }
          }
        }
        loadedFromDisk = true;
      }
    } catch (e) {}
  }

  if (!loadedFromDisk) {
    try {
      const logArgs = ['-c', 'core.quotepath=false', 'log', '-m', '--format=__OKF_COMMIT__%H|%aI', '--name-only'];
      if (relPathspec) logArgs.push('--', relPathspec);
      const out = execFileSync('git', logArgs, {
        cwd: topLevel,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 64 * 1024 * 1024
      });
      let currentHash = null;
      let currentIso = null;
      for (const rawLine of out.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith('__OKF_COMMIT__')) {
          const payload = line.slice('__OKF_COMMIT__'.length).trim();
          const sepIdx = payload.indexOf('|');
          if (sepIdx !== -1) {
            currentHash = payload.slice(0, sepIdx);
            currentIso = payload.slice(sepIdx + 1).trim();
          } else {
            currentHash = payload;
            currentIso = payload;
          }
        } else if (currentIso) {
          const cleaned = line.replace(/^"|"$/g, '');
          const absPath = path.resolve(topLevel, cleaned).toLowerCase();
          if (currentHash && absPath.endsWith('.md')) {
            if (!commitFilesMap.has(currentHash)) {
              commitFilesMap.set(currentHash, new Set());
            }
            commitFilesMap.get(currentHash).add(absPath);
          }
          if (!commitMap.has(absPath)) {
            commitMap.set(absPath, currentIso);
            if (currentHash) commitHashMap.set(absPath, currentHash);
          }
        }
      }
      if (cachePath && commitMap.size > 0) {
        try {
          const hashToIdx = new Map();
          const hashes = [];
          const entries = [];
          for (const [absP, iso] of commitMap.entries()) {
            const h = commitHashMap.get(absP) || '';
            let hIdx = -1;
            if (h) {
              hIdx = hashToIdx.get(h);
              if (hIdx === undefined) {
                hIdx = hashes.length;
                hashes.push(h);
                hashToIdx.set(h, hIdx);
              }
            }
            entries.push([path.relative(scopeRoot, absP), iso, hIdx]);
          }
          const mdCommits = [];
          for (const [h, hIdx] of hashToIdx.entries()) {
            const set = commitFilesMap.get(h);
            if (set && set.size > 0) {
              mdCommits.push([hIdx, Array.from(set, p => path.relative(scopeRoot, p))]);
            }
          }
          fs.writeFileSync(
            cachePath,
            JSON.stringify({ v: 2, hashes, entries, mdCommits }),
            'utf8'
          );
        } catch (e) {}
      }
    } catch (e) {
      // Ignore git log errors
    }
  }
  gitRepoCommitMapByTop.set(scopeKey, commitMap);
  gitRepoCommitHashByTop.set(scopeKey, commitHashMap);
  gitRepoCommitFilesByTop.set(scopeKey, commitFilesMap);
  if (headSha) gitRepoHeadByTop.set(scopeKey, headSha);
  return commitMap;
}

function getRepoDirtySet(execCwd, targetFile = null) {
  const scope = resolveGitScope(execCwd, targetFile);
  if (!scope) {
    return new Set();
  }
  const { topLevel, scopeKey, relPathspec } = scope;
  if (gitDirtySetByCwd.has(scopeKey)) {
    return gitDirtySetByCwd.get(scopeKey);
  }
  const dirtySet = new Set();
  try {
    const statusArgs = ['-c', 'core.quotepath=false', 'status', '--porcelain', '-uall'];
    if (relPathspec) statusArgs.push('--', relPathspec);
    const statusOut = execFileSync('git', statusArgs, {
      cwd: topLevel,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    for (const line of statusOut.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const m = line.match(/^\s*[MADRCU?!]{1,2}\s+(.*)$/);
      if (!m) continue;
      let rawPath = m[1].trim();
      if (rawPath.includes(' -> ')) rawPath = rawPath.split(' -> ').pop().trim();
      rawPath = rawPath.replace(/^"|"$/g, '');
      dirtySet.add(path.resolve(topLevel, rawPath).toLowerCase());
    }
  } catch (e) {
    // Ignore git status errors
  }
  gitDirtySetByCwd.set(scopeKey, dirtySet);
  return dirtySet;
}

function getGitCommitISO(filePath, cwd) {
  const absFile = path.resolve(filePath);
  const cacheKey = absFile.toLowerCase();
  if (gitCommitOnlyCache.has(cacheKey)) {
    return gitCommitOnlyCache.get(cacheKey);
  }
  const execCwd = cwd || path.dirname(absFile);
  const commitMap = getRepoCommitTimeMap(execCwd, false, absFile);
  let gitIso = commitMap.get(cacheKey) || null;
  if (!gitIso && fs.existsSync(absFile)) {
    try {
      const stat = fs.statSync(absFile);
      if (stat.isDirectory()) {
        const prefix = cacheKey.endsWith(path.sep) ? cacheKey : cacheKey + path.sep;
        for (const [trackedPath, iso] of commitMap.entries()) {
          if (trackedPath.startsWith(prefix)) {
            if (!gitIso || new Date(iso) > new Date(gitIso)) {
              gitIso = iso;
            }
          }
        }
      }
    } catch (e) {}
  }
  gitCommitOnlyCache.set(cacheKey, gitIso);
  return gitIso;
}

function getGitLastModifiedISO(filePath, cwd) {
  const absFile = path.resolve(filePath);
  const cacheKey = absFile.toLowerCase();
  if (gitModifiedCache.has(cacheKey)) {
    return gitModifiedCache.get(cacheKey);
  }

  const execCwd = cwd || path.dirname(absFile);
  let gitIso = getGitCommitISO(absFile, execCwd);

  try {
    const dirtySet = getRepoDirtySet(execCwd, absFile);
    const stat = fs.existsSync(absFile) ? fs.statSync(absFile) : null;
    if (stat) {
      let latestDirtyMtime = null;
      if (stat.isDirectory()) {
        const prefix = cacheKey.endsWith(path.sep) ? cacheKey : cacheKey + path.sep;
        for (const dirtyPath of dirtySet) {
          if (dirtyPath.startsWith(prefix) && fs.existsSync(dirtyPath)) {
            const mtime = fs.statSync(dirtyPath).mtime;
            if (!latestDirtyMtime || mtime > latestDirtyMtime) {
              latestDirtyMtime = mtime;
            }
          }
        }
      } else if (dirtySet.has(cacheKey)) {
        latestDirtyMtime = stat.mtime;
      }
      if (latestDirtyMtime) {
        const mtimeIso = latestDirtyMtime.toISOString();
        if (!gitIso || new Date(mtimeIso) > new Date(gitIso)) {
          gitModifiedCache.set(cacheKey, mtimeIso);
          return mtimeIso;
        }
      }
    }
  } catch (e) {
    // Fallback if git status fails
  }

  gitModifiedCache.set(cacheKey, gitIso);
  return gitIso;
}

function isPathDirty(filePath, execCwd) {
  const absFile = path.resolve(filePath);
  const cacheKey = absFile.toLowerCase();
  const dirtySet = getRepoDirtySet(execCwd || path.dirname(absFile), absFile);
  if (dirtySet.has(cacheKey)) return true;
  if (fs.existsSync(absFile)) {
    try {
      const stat = fs.statSync(absFile);
      if (stat.isDirectory()) {
        const prefix = cacheKey.endsWith(path.sep) ? cacheKey : cacheKey + path.sep;
        for (const d of dirtySet) {
          if (d.startsWith(prefix)) return true;
        }
      }
    } catch (e) {}
  }
  return false;
}

function isCoModifiedInLatestCommit(conceptFilePath, resourcePath, workspaceRoot) {
  const execCwd = workspaceRoot || path.dirname(path.resolve(conceptFilePath));
  if (isPathDirty(resourcePath, execCwd)) return false;
  const scope = resolveGitScope(execCwd, resourcePath);
  if (!scope) return false;
  const { scopeKey } = scope;
  getRepoCommitTimeMap(execCwd, false, resourcePath);
  const commitMap = gitRepoCommitMapByTop.get(scopeKey);
  const commitHashMap = gitRepoCommitHashByTop.get(scopeKey);
  const commitFilesMap = gitRepoCommitFilesByTop.get(scopeKey);
  if (!commitMap || !commitHashMap || !commitFilesMap) return false;

  const absConceptKey = path.resolve(conceptFilePath).toLowerCase();
  const absRes = path.resolve(resourcePath);
  const absResKey = absRes.toLowerCase();

  let latestResHash = commitHashMap.get(absResKey) || null;
  if (!latestResHash && fs.existsSync(absRes)) {
    try {
      const stat = fs.statSync(absRes);
      if (stat.isDirectory()) {
        const prefix = absResKey.endsWith(path.sep) ? absResKey : absResKey + path.sep;
        let latestIso = null;
        for (const [trackedPath, iso] of commitMap.entries()) {
          if (trackedPath.startsWith(prefix)) {
            if (!latestIso || new Date(iso) > new Date(latestIso)) {
              latestIso = iso;
              latestResHash = commitHashMap.get(trackedPath) || null;
            }
          }
        }
      }
    } catch (e) {}
  }
  if (!latestResHash) return false;
  const touchedFiles = commitFilesMap.get(latestResHash);
  return Boolean(touchedFiles && touchedFiles.has(absConceptKey));
}

function getEffectiveConceptTime(conceptFilePath, rawLastModified, workspaceRoot) {
  if (!rawLastModified) return null;
  const fmDate = new Date(rawLastModified);
  if (isNaN(fmDate.getTime())) return null;

  const absConcept = path.resolve(conceptFilePath);
  const dirtySet = getRepoDirtySet(workspaceRoot || path.dirname(absConcept));
  if (!dirtySet.has(absConcept.toLowerCase())) {
    const commitIso = getGitCommitISO(absConcept, workspaceRoot);
    if (commitIso) {
      const commitDate = new Date(commitIso);
      if (!isNaN(commitDate.getTime()) && commitDate > fmDate) {
        return commitDate;
      }
    }
  } else if (fs.existsSync(absConcept)) {
    try {
      const mtime = fs.statSync(absConcept).mtime;
      const diffMs = mtime.getTime() - fmDate.getTime();
      if (diffMs >= 0 && diffMs <= 2000) {
        return mtime;
      }
    } catch (e) {}
  }
  return fmDate;
}

function getResourceEffectiveModifiedISO(resourcePath, workspaceRoot, bundleRoot) {
  const absRes = path.resolve(resourcePath);
  if (bundleRoot && absRes.toLowerCase().endsWith('.md') && !isReservedBundleFile(absRes, bundleRoot)) {
    const absBundle = path.resolve(bundleRoot).toLowerCase();
    if (absRes.toLowerCase().startsWith(absBundle + path.sep) && fs.existsSync(absRes)) {
      try {
        const stat = fs.statSync(absRes);
        if (stat.isFile()) {
          const fm = parseFrontmatter(fs.readFileSync(absRes, 'utf8'));
          const resLastMod = fm && (fm.timestamp || (fm.generated && fm.generated.at));
          if (resLastMod) {
            const fmDate = new Date(resLastMod);
            if (!isNaN(fmDate.getTime())) {
              const dirty = isPathDirty(absRes, workspaceRoot);
              if (!dirty || Math.abs(stat.mtime.getTime() - fmDate.getTime()) <= 5000) {
                const eff = getEffectiveConceptTime(absRes, resLastMod, workspaceRoot);
                if (eff) return eff.toISOString();
              }
            }
          }
        }
      } catch (e) {}
    }
  }
  return getGitLastModifiedISO(absRes, workspaceRoot);
}

function resolveWorkspaceAndBundle(args) {
  const cwd = process.cwd();
  const bundleIdx = args.indexOf('--bundle');
  let rawBundleArg = (bundleIdx !== -1 && args[bundleIdx + 1]) ? args[bundleIdx + 1] : null;
  const hasPositionalModeFlag = args.some(a =>
    a === '--verify' || a === '--stale-after' || a === '--clear-stale' || a === '--evaluate'
  );
  if (!rawBundleArg && !hasPositionalModeFlag) {
    const valueFlags = new Set([
      '--bundle', '--actor', '--by', '--stale-after', '--telemetry',
      '--brain-dir', '--user', '--agent', '--home', '--source'
    ]);
    for (let i = 0; i < args.length; i++) {
      if (valueFlags.has(args[i])) {
        i++;
        continue;
      }
      if (!args[i].startsWith('-')) {
        rawBundleArg = args[i];
        break;
      }
    }
  }

  if (rawBundleArg) {
    const candidate = path.resolve(cwd, rawBundleArg);
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

function findBundlesOnOtherBranches(workspaceRoot) {
  const hints = [];
  try {
    const branchesOut = execFileSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (!branchesOut) return hints;
    for (const branch of branchesOut.split(/\r?\n/)) {
      const b = branch.trim();
      if (!b) continue;
      for (const candidate of ['docs/okf/index.md', 'okf/index.md']) {
        try {
          execFileSync('git', ['cat-file', '-e', `${b}:${candidate}`], {
            cwd: workspaceRoot,
            stdio: ['ignore', 'ignore', 'ignore']
          });
          const bundleDir = candidate.replace(/\/index\.md$/, '');
          hints.push({ branch: b, bundlePath: bundleDir });
        } catch (e) {}
      }
    }
  } catch (e) {}
  return hints;
}

const IGNORED_FRONTIER_EXTENSIONS = new Set([
  '.pyc', '.pyo', '.pyd', '.dll', '.exe', '.so', '.dylib',
  '.class', '.o', '.obj', '.a', '.lib', '.pdb',
  '.bin', '.rdb', '.elf', '.hex', '.uf2', '.map',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp', '.tiff', '.avif',
  '.mp4', '.webm', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.ogg',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.tar', '.gz', '.tgz', '.7z', '.rar', '.pkpass'
]);

function isHashedBuildAsset(relPath) {
  const norm = String(relPath || '').replace(/\\/g, '/');
  const m = norm.match(/(?:^|\/)assets\/([a-zA-Z0-9_.-]+?)-([a-zA-Z0-9_-]{8,})(\.(?:js|mjs|cjs|css))$/i);
  if (!m) return false;
  const hash = m[2];
  return /\d/.test(hash) || (/[a-z]/.test(hash) && /[A-Z]/.test(hash));
}

function healStaleHashedAssetBindings(conceptFiles, workspaceRoot, bundleRoot) {
  const healed = [];
  for (const cFile of conceptFiles) {
    let content;
    try { content = fs.readFileSync(cFile, 'utf8'); } catch (e) { continue; }
    const fm = parseFrontmatter(content);
    if (!fm || !Array.isArray(fm.sources)) continue;
    let modified = false;
    let updatedContent = content;
    for (const src of fm.sources) {
      const rawResource = typeof src === 'string' ? src : (src && src.resource);
      if (!rawResource || /^https?:\/\//i.test(rawResource)) continue;
      if (!isHashedBuildAsset(rawResource)) continue;
      const local = resolveResourceLocalPath(rawResource, workspaceRoot, bundleRoot);
      if (!local || fs.existsSync(local)) continue;
      const assetDir = path.dirname(local);
      if (!fs.existsSync(assetDir)) continue;
      const base = path.basename(local);
      const m = base.match(/^([a-zA-Z0-9_.-]+?)-([a-zA-Z0-9_-]{8,})(\.(?:js|mjs|cjs|css))$/i);
      if (!m) continue;
      const [, stem, , ext] = m;
      const candidates = fs.readdirSync(assetDir).filter(f => {
        if (!f.startsWith(stem + '-') || !f.endsWith(ext)) return false;
        return isHashedBuildAsset('assets/' + f);
      });
      if (candidates.length === 1) {
        const newRawResource = rawResource.slice(0, rawResource.length - base.length) + candidates[0];
        if (updatedContent.includes(rawResource)) {
          updatedContent = updatedContent.split(rawResource).join(newRawResource);
          modified = true;
        }
      }
    }
    if (modified) {
      fs.writeFileSync(cFile, updatedContent, 'utf8');
      healed.push({
        file: path.relative(bundleRoot, cFile).replace(/\\/g, '/'),
        fullPath: cFile,
        resource: 'hashed-asset'
      });
    }
  }
  return healed;
}

const IGNORED_FRONTIER_FILES = new Set([
  'skills-lock.json', '.gitignore', 'license', 'readme.md',
  'agents.md', 'claude.md', 'gemini.md',
  '.cursorrules', '.windsurfrules', '.clinerules'
]);

function loadGitignorePatterns(workspaceRoot) {
  const patterns = [];
  const dirsToCheck = [];
  let curr = path.resolve(workspaceRoot);
  while (curr) {
    dirsToCheck.push(curr);
    if (fs.existsSync(path.join(curr, '.git'))) break;
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }

  for (const dir of dirsToCheck) {
    const gitignorePath = path.join(dir, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      try {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        const lines = content.split(/\r?\n/);
        for (let line of lines) {
          line = line.trim();
          if (!line || line.startsWith('#') || line.startsWith('!')) continue;
          
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
  }
  return patterns;
}

function isOkfBundleDir(dirPath) {
  const idx = path.join(dirPath, 'index.md');
  if (!fs.existsSync(idx)) return false;
  try {
    const head = fs.readFileSync(idx, 'utf8').slice(0, 2000);
    const m = head.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    return !!(m && /^okf_version\s*:/m.test(m[1]));
  } catch (e) {
    return false;
  }
}

// A file is covered when it, or any ancestor directory, is bound as a resource.
// This lets a concept bind a whole module directory (e.g. `file:///.../sql-fixes/`).
function isCoveredByResource(relPath, fullPath, documentedResources) {
  const normRel = relPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  if (documentedResources.has(normRel) || documentedResources.has(path.resolve(fullPath).toLowerCase())) return true;
  const parts = normRel.split('/');
  for (let i = 1; i < parts.length; i++) {
    if (documentedResources.has(parts.slice(0, i).join('/'))) return true;
  }
  return false;
}

function scanWorkspaceFiles(dir, workspaceRoot, documentedResources, results = [], gitignorePatterns = null, bundleRoot = null) {
  if (!fs.existsSync(dir)) return results;
  if (gitignorePatterns === null) {
    gitignorePatterns = loadGitignorePatterns(workspaceRoot);
  }
  const files = fs.readdirSync(dir);
  const ignores = [
    '.git', 'node_modules', '.agents', '.claude', '.gemini', 'agent', 'docs',
    'tmp', 'temp', 'scratch', '.scratch', '.idea', '.vscode', '.superpowers', '__pycache__',
    '.pytest_cache', '.mypy_cache', '.ruff_cache', '.venv', 'venv',
    'dist', 'build', 'coverage', '.next', 'target', 'bin', 'obj'
  ];
  const normBundleRoot = bundleRoot ? path.resolve(bundleRoot).toLowerCase() : null;
  
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
      if (fs.existsSync(path.join(fullPath, '.git'))) continue;
      // An OKF bundle's own files (concepts, index.md, log.md, viz.html) are the
      // documentation, not undocumented workspace files. Skip the active bundle,
      // any nested bundle directory, and any child sub-package that hosts its own
      // nested OKF bundle (okf/ or docs/okf/).
      if (normBundleRoot && path.resolve(fullPath).toLowerCase() === normBundleRoot) continue;
      if (isOkfBundleDir(fullPath)) continue;
      const childOkf = path.join(fullPath, 'okf');
      const childDocsOkf = path.join(fullPath, 'docs', 'okf');
      if (
        (isOkfBundleDir(childOkf) && path.resolve(childOkf).toLowerCase() !== normBundleRoot) ||
        (isOkfBundleDir(childDocsOkf) && path.resolve(childDocsOkf).toLowerCase() !== normBundleRoot)
      ) {
        continue;
      }
      scanWorkspaceFiles(fullPath, workspaceRoot, documentedResources, results, gitignorePatterns, bundleRoot);
    } else if (stat.isFile()) {
      const ext = path.extname(file).toLowerCase();
      if (IGNORED_FRONTIER_EXTENSIONS.has(ext)) continue;
      if (isHashedBuildAsset(relPath)) continue;
      if (!IGNORED_FRONTIER_FILES.has(file.toLowerCase())) {
        if (!isCoveredByResource(relPath, fullPath, documentedResources)) {
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
      if (file.toLowerCase() === 'archive') continue;
      walkConceptFiles(fullPath, list);
    } else if (stat.isFile() && file.endsWith('.md')) {
      if (file !== 'index.md' && file !== 'log.md') {
        list.push(fullPath);
      }
    }
  }
  return list;
}

function updateConceptTimestamp(filePath, nowISO, actor, syncDate = null) {
  const content = fs.readFileSync(filePath, 'utf8');
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return false;

  let fmText = fmMatch[1].replace(/\r\n/g, '\n');
  let updatedFm = fmText;

  // Check if generated block exists
  if (/generated:\s*\n/m.test(fmText)) {
    // Update at within generated
    if (/(\s+at:\s*)([^\n]+)/.test(fmText)) {
      updatedFm = updatedFm.replace(/(\s+at:\s*)([^\n]+)/, `$1${nowISO}`);
    } else {
      updatedFm = updatedFm.replace(/(generated:\s*\n)/, `$1  at: ${nowISO}\n`);
    }
  } else if (/timestamp:\s*[^\n]+/m.test(fmText)) {
    // Update legacy timestamp
    updatedFm = updatedFm.replace(/timestamp:\s*[^\n]+/, `generated:\n  by: ${actor}\n  at: ${nowISO}`);
  } else {
    // Add generated block
    updatedFm = updatedFm.trimEnd() + `\ngenerated:\n  by: ${actor}\n  at: ${nowISO}\n`;
  }

  const normalizedBlock = `---\n${updatedFm.trim()}\n---`;
  const finalBlock = eol === '\r\n' ? normalizedBlock.replace(/\n/g, '\r\n') : normalizedBlock;
  const newContent = content.replace(fmMatch[0], finalBlock);
  fs.writeFileSync(filePath, newContent, 'utf8');
  if (syncDate instanceof Date && !isNaN(syncDate.getTime())) {
    try {
      fs.utimesSync(filePath, syncDate, syncDate);
    } catch (e) {}
  }
  return true;
}

function resolveDefaultVerifierActor(workspaceRoot) {
  try {
    let osUser = '';
    try {
      osUser = (os.userInfo().username || '').toLowerCase();
    } catch (e) {}
    const gitName = execFileSync('git', ['config', 'user.name'], {
      cwd: workspaceRoot || process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (gitName) {
      const slug = gitName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
      if (slug && slug !== osUser) return `human:${slug}`;
    }
  } catch (e) {}
  return 'human:reviewer';
}

function parseStaleAfterSpec(staleAfterSpec, baseDate = new Date()) {
  if (staleAfterSpec === undefined || staleAfterSpec === null || staleAfterSpec === '') {
    return { mode: 'auto' };
  }
  const raw = String(staleAfterSpec).trim();
  if (/^(?:none|clear|false|null|off)$/i.test(raw)) {
    return { mode: 'clear' };
  }
  const relDaysMatch = raw.match(/^\+?(\d+)\s*d?$/i);
  if (relDaysMatch) {
    const days = parseInt(relDaysMatch[1], 10);
    const targetDate = new Date(baseDate.getTime() + days * 86400000);
    return {
      mode: 'set',
      iso: targetDate.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      label: `+${days}d`
    };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00Z`);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid --stale-after date: ${raw}`);
    }
    return {
      mode: 'set',
      iso: `${raw}T00:00:00Z`,
      label: `${raw}T00:00:00Z`
    };
  }
  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid --stale-after value '${raw}'. Expected <days>d (e.g. 90d), YYYY-MM-DD, ISO-8601 timestamp, or 'none'.`);
  }
  const iso = parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { mode: 'set', iso, label: iso };
}

function updateConceptVerification(filePath, options = {}) {
  const {
    verify = true,
    verifierActor = 'human:reviewer',
    nowISO = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    staleAfterSpec = undefined,
    syncDate = new Date(nowISO)
  } = options;

  const content = fs.readFileSync(filePath, 'utf8');
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return { updated: false };

  const fm = parseFrontmatter(content) || {};
  let updatedFm = fmMatch[1].replace(/\r\n/g, '\n');
  let trustTier = null;
  let staleAfterResult = null;

  if (verify) {
    // 1. Refresh generated.at timestamp
    if (/^generated:[ \t]*\n/m.test(updatedFm)) {
      if (/^([ \t]+at:[ \t]*)([^\n]+)/m.test(updatedFm)) {
        updatedFm = updatedFm.replace(/^([ \t]+at:[ \t]*)([^\n]+)/m, `$1${nowISO}`);
      } else {
        updatedFm = updatedFm.replace(/^(generated:[ \t]*\n)/m, `$1  at: ${nowISO}\n`);
      }
    } else if (/^timestamp:[ \t]*[^\n]+/m.test(updatedFm)) {
      updatedFm = updatedFm.replace(/^timestamp:[ \t]*[^\n]+/m, `generated:\n  by: ${verifierActor}\n  at: ${nowISO}`);
    } else {
      updatedFm = updatedFm.trimEnd() + `\ngenerated:\n  by: ${verifierActor}\n  at: ${nowISO}`;
    }

    // 2. Build updated verified list
    let verifiedList = [];
    if (Array.isArray(fm.verified)) {
      verifiedList = fm.verified
        .filter(v => v && typeof v === 'object' && v.by)
        .map(v => ({ by: String(v.by), at: String(v.at || nowISO) }));
    } else if (fm.verified && typeof fm.verified === 'object' && fm.verified.by) {
      verifiedList = [{ by: String(fm.verified.by), at: String(fm.verified.at || nowISO) }];
    }
    const existingIdx = verifiedList.findIndex(v => v.by === verifierActor);
    if (existingIdx !== -1) {
      verifiedList[existingIdx] = { by: verifierActor, at: nowISO };
    } else {
      verifiedList.push({ by: verifierActor, at: nowISO });
    }

    const verifiedBlock = [
      'verified:',
      ...verifiedList.map(v => `  - by: ${v.by}\n    at: ${v.at}`)
    ].join('\n');

    const verifiedRe = /^verified:[ \t]*[^\n]*(?:\n[ \t]+[^\n]*)*/m;
    if (verifiedRe.test(updatedFm)) {
      updatedFm = updatedFm.replace(verifiedRe, () => verifiedBlock);
    } else {
      const genRe = /^generated:[ \t]*[^\n]*(?:\n[ \t]+[^\n]*)*/m;
      if (genRe.test(updatedFm)) {
        updatedFm = updatedFm.replace(genRe, match => `${match}\n${verifiedBlock}`);
      } else {
        updatedFm = updatedFm.trimEnd() + `\n${verifiedBlock}`;
      }
    }

    const hasHuman = verifiedList.some(v => String(v.by).startsWith('human:'));
    trustTier = hasHuman ? 'human-reviewed' : 'machine-confirmed';
  }

  // 3. Handle stale_after update, renewal, or removal
  const staleSpec = parseStaleAfterSpec(staleAfterSpec, syncDate);
  if (staleSpec.mode === 'clear') {
    if (/^stale_after:[ \t]*[^\n]*\n?/m.test(updatedFm)) {
      updatedFm = updatedFm.replace(/^stale_after:[ \t]*[^\n]*\n?/m, '');
      staleAfterResult = 'cleared';
    }
  } else if (staleSpec.mode === 'set') {
    if (/^stale_after:[ \t]*[^\n]*/m.test(updatedFm)) {
      updatedFm = updatedFm.replace(/^stale_after:[ \t]*[^\n]*/m, `stale_after: ${staleSpec.iso}`);
    } else {
      updatedFm = updatedFm.trimEnd() + `\nstale_after: ${staleSpec.iso}`;
    }
    staleAfterResult = staleSpec.iso;
  } else if (verify && fm.stale_after) {
    const existingStaleTime = new Date(fm.stale_after).getTime();
    if (!isNaN(existingStaleTime) && syncDate.getTime() >= existingStaleTime) {
      const autoRenewedIso = new Date(syncDate.getTime() + 90 * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      if (/^stale_after:[ \t]*[^\n]*/m.test(updatedFm)) {
        updatedFm = updatedFm.replace(/^stale_after:[ \t]*[^\n]*/m, `stale_after: ${autoRenewedIso}`);
      } else {
        updatedFm = updatedFm.trimEnd() + `\nstale_after: ${autoRenewedIso}`;
      }
      staleAfterResult = `${autoRenewedIso} (+90d auto-renewed)`;
    } else {
      staleAfterResult = String(fm.stale_after);
    }
  }

  const normalizedBlock = `---\n${updatedFm.trim()}\n---`;
  const finalBlock = eol === '\r\n' ? normalizedBlock.replace(/\n/g, '\r\n') : normalizedBlock;
  const newContent = content.replace(fmMatch[0], () => finalBlock);
  fs.writeFileSync(filePath, newContent, 'utf8');
  if (syncDate instanceof Date && !isNaN(syncDate.getTime())) {
    try {
      fs.utimesSync(filePath, syncDate, syncDate);
    } catch (e) {}
  }

  return {
    updated: true,
    verifiedBy: verify ? verifierActor : null,
    verifiedAt: verify ? nowISO : null,
    trustTier,
    staleAfter: staleAfterResult
  };
}

function resolveConceptTargetFile(targetStr, bundleRoot, workspaceRoot, allConceptFiles) {
  const cleaned = String(targetStr || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned) return null;
  const candidates = [
    path.resolve(bundleRoot, cleaned),
    path.resolve(bundleRoot, cleaned.endsWith('.md') ? cleaned : `${cleaned}.md`),
    path.resolve(bundleRoot, 'concepts', cleaned.endsWith('.md') ? cleaned : `${cleaned}.md`),
    path.resolve(workspaceRoot, cleaned),
    path.resolve(workspaceRoot, cleaned.endsWith('.md') ? cleaned : `${cleaned}.md`)
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
      return cand;
    }
  }
  const lowerCleaned = cleaned.toLowerCase();
  const lowerWithMd = lowerCleaned.endsWith('.md') ? lowerCleaned : `${lowerCleaned}.md`;
  for (const cFile of allConceptFiles) {
    const rel = path.relative(bundleRoot, cFile).replace(/\\/g, '/').toLowerCase();
    const base = path.basename(cFile).toLowerCase();
    if (rel === lowerCleaned || rel === lowerWithMd || base === lowerCleaned || base === lowerWithMd) {
      return cFile;
    }
  }
  return null;
}

function verifyConcepts(options = {}) {
  const {
    bundleRoot,
    workspaceRoot = path.dirname(bundleRoot),
    targets = [],
    allStale = false,
    allConcepts = false,
    verify = true,
    byActor = null,
    staleAfterSpec = undefined
  } = options;

  if (!bundleRoot || !fs.existsSync(bundleRoot)) {
    throw new Error(`OKF bundle not found at: ${bundleRoot}`);
  }

  const verifierActor = byActor || resolveDefaultVerifierActor(workspaceRoot);
  const allFiles = walkConceptFiles(bundleRoot);
  const selectedPaths = [];
  const seen = new Set();

  const addFile = (fullPath) => {
    const key = path.resolve(fullPath).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      selectedPaths.push(fullPath);
    }
  };

  if (allConcepts) {
    allFiles.forEach(addFile);
  } else if (allStale) {
    const nowMs = Date.now();
    for (const cFile of allFiles) {
      const fm = parseFrontmatter(fs.readFileSync(cFile, 'utf8'));
      if (fm && fm.stale_after) {
        const sMs = new Date(fm.stale_after).getTime();
        if (!isNaN(sMs) && nowMs >= sMs) {
          addFile(cFile);
        }
      }
    }
  }

  for (const rawTarget of targets) {
    for (const part of String(rawTarget).split(',').map(s => s.trim()).filter(Boolean)) {
      const resolved = resolveConceptTargetFile(part, bundleRoot, workspaceRoot, allFiles);
      if (!resolved) {
        throw new Error(`Concept not found in bundle: '${part}'`);
      }
      addFile(resolved);
    }
  }

  const syncDate = new Date();
  const nowISO = syncDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const dateStr = nowISO.slice(0, 10);
  const results = [];

  for (const fullPath of selectedPaths) {
    const relFile = path.relative(bundleRoot, fullPath).replace(/\\/g, '/');
    const res = updateConceptVerification(fullPath, {
      verify,
      verifierActor,
      nowISO,
      staleAfterSpec,
      syncDate
    });
    if (res.updated) {
      results.push({
        file: relFile,
        fullPath,
        ...res
      });
    }
  }

  const logPath = path.join(bundleRoot, 'log.md');
  let logUpdated = false;
  if (results.length > 0 && fs.existsSync(logPath)) {
    const descList = results.map(r => {
      const staleNote = r.staleAfter ? ` (stale_after: ${r.staleAfter})` : '';
      return `\`${r.file}\`${staleNote}`;
    });
    const entry = verify
      ? `Verified ${results.length} concept(s) as \`${verifierActor}\`: ${descList.join(', ')}.`
      : `Updated \`stale_after\` on ${results.length} concept(s): ${descList.join(', ')}.`;
    logUpdated = appendLogEntry(logPath, [entry], dateStr);
  }

  return {
    success: true,
    bundleRoot,
    verifierActor: verify ? verifierActor : null,
    verifiedAt: nowISO,
    verifiedCount: results.length,
    results,
    logUpdated
  };
}

function collectBundleMarkdownLower(bundleRoot) {
  if (!bundleRoot || !fs.existsSync(bundleRoot)) return '';
  const chunks = [];
  for (const name of ['index.md', 'log.md']) {
    const p = path.join(bundleRoot, name);
    if (fs.existsSync(p)) chunks.push(fs.readFileSync(p, 'utf8').toLowerCase());
  }
  for (const cFile of walkConceptFiles(bundleRoot)) {
    try {
      chunks.push(fs.readFileSync(cFile, 'utf8').toLowerCase());
    } catch (e) {}
  }
  return chunks.join('\n');
}

function isAcknowledgedInBundle(relPath, bundleMarkdownLower) {
  const norm = relPath.replace(/\\/g, '/').toLowerCase();
  const base = path.basename(norm);
  if (bundleMarkdownLower.includes(norm) || bundleMarkdownLower.includes('`' + base + '`')) {
    return true;
  }
  const ellipsisRe = /`(?:\u2026|\.{3})([^`\r\n]{8,})`/g;
  let m;
  while ((m = ellipsisRe.exec(bundleMarkdownLower)) !== null) {
    if (base.endsWith(m[1])) return true;
  }
  return false;
}

function updateIndexFrontier(indexPath, frontierList, documentedResources, workspaceRoot = null) {
  if (!fs.existsSync(indexPath)) {
    return { updated: false, added: 0, removed: 0, alreadyListed: 0 };
  }
  let content = fs.readFileSync(indexPath, 'utf8');

  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const itemRe = /^-\s+`([^`]+)`(?:\s*[—–-]\s*(.*))?$/;

  // Locate the section, bounded by its heading and the next `## ` heading (or EOF).
  // Only the bullet items inside it are managed. Hand-written prose in the section
  // and every section after it are preserved byte-for-byte.
  const headingMatch = content.match(/^## Not yet specified[^\r\n]*$/m);
  let before, section, after;
  if (headingMatch) {
    const start = headingMatch.index;
    const bodyStart = start + headingMatch[0].length;
    const nextIdx = content.slice(bodyStart).search(/^## /m);
    const end = nextIdx === -1 ? content.length : bodyStart + nextIdx;
    before = content.slice(0, start);
    section = content.slice(start, end);
    after = content.slice(end);
  } else {
    if (frontierList.length === 0) {
      return { updated: false, added: 0, removed: 0, alreadyListed: 0 };
    }
    before = content.trimEnd() + eol + eol;
    section = '## Not yet specified' + eol;
    after = '';
  }

  const lines = section.split(/\r?\n/);
  let modified = !headingMatch;
  let removedCount = 0;
  const bundleRel = workspaceRoot
    ? path.relative(workspaceRoot, path.dirname(indexPath)).replace(/\\/g, '/').toLowerCase()
    : '';
  const frontierSet = new Set(frontierList.map(f => f.path.replace(/\\/g, '/').toLowerCase()));

  // 1. Drop managed bullet items whose file is now documented, deleted, or excluded.
  //    Hand-written notes (custom prose after `—` or multi-line indented continuations)
  //    are never deleted by maintain.
  const kept = [];
  const listed = new Set();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(itemRe);
    if (m) {
      const key = m[1].replace(/\\/g, '/').toLowerCase();
      const hasContinuation = (i + 1 < lines.length) && /^\s+\S/.test(lines[i + 1]);
      const isAutoGeneratedBullet = !hasContinuation && (!m[2] || m[2].trim() === 'Undocumented codebase file.');
      if (isAutoGeneratedBullet) {
        // Also self-heal auto-generated entries that point inside this bundle;
        // earlier versions listed the bundle's own files as frontier.
        const inBundle = bundleRel !== '' && key.startsWith(bundleRel + '/');
        const existsOnDisk = !workspaceRoot || fs.existsSync(path.join(workspaceRoot, m[1]));
        if (
          inBundle ||
          isCoveredByResource(key, key, documentedResources) ||
          !existsOnDisk ||
          !frontierSet.has(key)
        ) {
          modified = true;
          removedCount++;
          continue;
        }
      }
      listed.add(key);
    }
    kept.push(line);
  }

  // 2. Add frontier files not already acknowledged anywhere in the bundle. A path
  //    or backtick-quoted filename the author already explains in prose counts as
  //    listed, which matches how `--check` decides what is unindexed.
  const bundleMarkdownLower = content.toLowerCase() + '\n' + collectBundleMarkdownLower(path.dirname(indexPath));
  const additions = frontierList
    .filter(f => {
      const norm = f.path.toLowerCase();
      return !listed.has(norm) && !isCoveredByResource(norm, f.absolutePath || norm, documentedResources) && !isAcknowledgedInBundle(norm, bundleMarkdownLower);
    })
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(f => `- \`${f.path}\` — Undocumented codebase file.`);

  const alreadyListedCount = Math.max(0, frontierList.length - additions.length);
  if (!headingMatch && additions.length === 0) {
    return { updated: false, added: 0, removed: 0, alreadyListed: alreadyListedCount };
  }

  if (additions.length > 0) {
    modified = true;
    // Insert after the last existing bullet (and any indented continuation lines),
    // or directly under the heading.
    let insertAt = 1;
    for (let i = 0; i < kept.length; i++) {
      if (itemRe.test(kept[i])) {
        insertAt = i + 1;
        while (insertAt < kept.length && /^\s+\S/.test(kept[insertAt])) {
          insertAt++;
        }
      }
    }
    kept.splice(insertAt, 0, ...additions);
  }

  if (!modified) {
    return { updated: false, added: 0, removed: 0, alreadyListed: alreadyListedCount };
  }

  let newSection = kept.join(eol);
  if (after && !/(\r?\n){2}$/.test(newSection)) newSection = newSection.trimEnd() + eol + eol;
  if (!after) newSection = newSection.trimEnd() + eol;
  fs.writeFileSync(indexPath, before + newSection + after, 'utf8');
  return {
    updated: true,
    added: additions.length,
    removed: removedCount,
    alreadyListed: alreadyListedCount
  };
}

function appendLogEntry(logPath, entries, dateStr) {
  if (!fs.existsSync(logPath)) return false;
  const rawContent = fs.readFileSync(logPath, 'utf8');
  const eol = rawContent.includes('\r\n') ? '\r\n' : '\n';
  const content = rawContent.replace(/\r\n/g, '\n');
  const dateHeading = `## ${dateStr}`;

  const newEntriesText = entries.map(e => `- ${e}`).join('\n');
  const headingDates = [];
  const headingRe = /^## (\d{4}-\d{2}-\d{2})\b/gm;
  let hm;
  while ((hm = headingRe.exec(content)) !== null) {
    headingDates.push(hm[1]);
  }
  const isChronological =
    /newest\s+(?:entries|changes)\s+at\s+the\s+bottom/i.test(content) ||
    (headingDates.length >= 2 && headingDates[0] < headingDates[headingDates.length - 1]);
  const hasBlankLineAfterHeading = /^## \d{4}-\d{2}-\d{2}[ \t]*\n\n/m.test(content);
  const headingSep = hasBlankLineAfterHeading ? '\n\n' : '\n';
  let newContent;

  const escapedHeading = dateHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactHeadingRe = new RegExp(`^${escapedHeading}[ \\t]*$`, 'm');
  const existingMatch = exactHeadingRe.exec(content);

  if (existingMatch) {
    const headingStart = existingMatch.index;
    const afterHeadingIdx = headingStart + existingMatch[0].length;
    const restAfterHeading = content.slice(afterHeadingIdx);
    const nextSectionMatch = restAfterHeading.match(/\n## \d{4}-\d{2}-\d{2}\b/);
    const sectionBody = nextSectionMatch ? restAfterHeading.slice(0, nextSectionMatch.index) : restAfterHeading;
    const afterSection = nextSectionMatch ? restAfterHeading.slice(nextSectionMatch.index) : '';

    if (isChronological && sectionBody.trim().length > 0) {
      const trimmedSection = sectionBody.replace(/\n+$/, '');
      const trailingGap = afterSection ? '\n' : '\n';
      newContent =
        content.slice(0, afterHeadingIdx) +
        trimmedSection +
        '\n' +
        newEntriesText +
        trailingGap +
        afterSection;
    } else {
      const localSep = /^\n\n/.test(sectionBody) || (sectionBody.trim().length === 0 && hasBlankLineAfterHeading) ? '\n\n' : '\n';
      const cleanedBody = sectionBody.replace(/^\n+/, '');
      newContent =
        content.slice(0, headingStart) +
        dateHeading +
        localSep +
        newEntriesText +
        (cleanedBody ? '\n' + cleanedBody : '\n') +
        afterSection;
    }
  } else if (isChronological) {
    newContent = content.trimEnd() + `\n\n${dateHeading}${headingSep}${newEntriesText}\n`;
  } else {
    const firstHeadingMatch = content.match(/\n(## \d{4}-\d{2}-\d{2}|[-\*]\s+(?:\*\*|\[)?\d{4}-\d{2}-\d{2})/);
    if (firstHeadingMatch) {
      const idx = firstHeadingMatch.index;
      const isBullet = firstHeadingMatch[1].startsWith('-') || firstHeadingMatch[1].startsWith('*');
      if (isBullet) {
        newContent = content.slice(0, idx).trimEnd() + `\n\n${dateHeading}${headingSep}${newEntriesText}\n\n` + content.slice(idx + 1);
      } else {
        newContent = content.slice(0, idx) + `\n\n${dateHeading}${headingSep}${newEntriesText}\n` + content.slice(idx);
      }
    } else {
      newContent = content.trimEnd() + `\n\n${dateHeading}${headingSep}${newEntriesText}\n`;
    }
  }

  fs.writeFileSync(logPath, eol === '\r\n' ? newContent.replace(/\n/g, '\r\n') : newContent, 'utf8');
  return true;
}

const TARGET_STEERING_VERSION = '1.8.2';

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

function extractIndexedConceptPaths(indexContent) {
  const indexedSet = new Set();
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = linkRe.exec(indexContent)) !== null) {
    let raw = m[1].replace(/[?#].*$/, '').trim();
    if (!raw || /^(?:https?:|mailto:|file:|git:)/i.test(raw)) continue;
    try {
      raw = decodeURIComponent(raw);
    } catch (e) {}
    const norm = raw.replace(/\\/g, '/').replace(/^(?:\.\/|\/)+/, '').toLowerCase();
    if (norm) indexedSet.add(norm);
  }
  return indexedSet;
}

function findUnindexedConcepts(indexPath, allConceptRecords) {
  if (!fs.existsSync(indexPath) || !Array.isArray(allConceptRecords)) return [];
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  const indexedSet = extractIndexedConceptPaths(indexContent);
  return allConceptRecords.filter(rec => {
    if (String(rec.status || '').toLowerCase() === 'deprecated') return false;
    return !indexedSet.has(rec.file.toLowerCase());
  });
}

function updateIndexConcepts(indexPath, unindexedRecords) {
  if (!fs.existsSync(indexPath) || !Array.isArray(unindexedRecords) || unindexedRecords.length === 0) {
    return false;
  }
  const rawContent = fs.readFileSync(indexPath, 'utf8');
  const eol = rawContent.includes('\r\n') ? '\r\n' : '\n';
  const content = rawContent.replace(/\r\n/g, '\n');

  const newBullets = unindexedRecords
    .slice()
    .sort((a, b) => a.file.localeCompare(b.file))
    .map(rec => `- [${rec.title}](/${rec.file})`)
    .join('\n');

  let newContent;
  const conceptHeadingMatch = content.match(/^##\s+(?!Archived\s+Concepts\b).*concepts.*$/im);
  if (conceptHeadingMatch) {
    const headingEnd = conceptHeadingMatch.index + conceptHeadingMatch[0].length;
    const rest = content.slice(headingEnd);
    const nextHeadingMatch = rest.match(/\n##\s+/);
    const sectionEnd = nextHeadingMatch ? headingEnd + nextHeadingMatch.index : content.length;
    const beforeSectionEnd = content.slice(0, sectionEnd).trimEnd();
    const afterSectionEnd = content.slice(sectionEnd);
    newContent =
      beforeSectionEnd +
      '\n' +
      newBullets +
      '\n' +
      (afterSectionEnd ? '\n' + afterSectionEnd.replace(/^\n+/, '') : '');
  } else {
    const specialHeadingMatch = content.match(/^##\s+(?:Not yet specified|Archived Concepts|Provenance)\b/im);
    if (specialHeadingMatch) {
      const insertIdx = specialHeadingMatch.index;
      const before = content.slice(0, insertIdx).trimEnd();
      const after = content.slice(insertIdx);
      newContent = before + '\n\n## Concepts\n' + newBullets + '\n\n' + after;
    } else {
      newContent = content.trimEnd() + '\n\n## Concepts\n' + newBullets + '\n';
    }
  }

  fs.writeFileSync(indexPath, eol === '\r\n' ? newContent.replace(/\n/g, '\r\n') : newContent, 'utf8');
  return true;
}

// Path prefix for invoking the OKF skill scripts, as seen from the workspace root:
// workspace-relative when the skills live inside the repo, `~/`-relative on POSIX when
// under the user's home directory, forward-slash absolute on Windows (PowerShell does not
// expand `~/` when passed as an argument to `node`). Always ends with '/' (or is '').
function resolveSkillsBase(workspaceRoot, options = {}) {
  const skillsRoot = options.skillsRoot || path.resolve(__dirname, '..', '..');
  const homeDir = options.homeDir || os.homedir();
  const platform = options.platform || process.platform;
  if (
    workspaceRoot &&
    !options.skillsRoot &&
    fs.existsSync(path.join(workspaceRoot, 'okf-query', 'scripts', 'query.js')) &&
    fs.existsSync(path.join(workspaceRoot, 'okf-maintain', 'scripts', 'maintain.js'))
  ) {
    return '';
  }
  const isInside = (rel) => rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  const relWs = workspaceRoot ? path.relative(workspaceRoot, skillsRoot) : skillsRoot;
  if (relWs === '') return '';
  if (isInside(relWs) && (!relWs.startsWith('.') || path.resolve(workspaceRoot) !== path.resolve(homeDir))) {
    return relWs.replace(/\\/g, '/') + '/';
  }
  if (platform !== 'win32') {
    const relHome = path.relative(homeDir, skillsRoot);
    if (isInside(relHome)) return '~/' + relHome.replace(/\\/g, '/') + '/';
  }
  if (isInside(relWs)) return relWs.replace(/\\/g, '/') + '/';
  return skillsRoot.replace(/\\/g, '/') + '/';
}

function buildSteeringDirectivesBlock(bundleRelPath, targetVersion, skillsBase = '') {
  const b = bundleRelPath;
  const s = skillsBase;
  return `## 📂 Knowledge Bundle / OKF
Architecture, contracts and procedures for this repository are documented in the OKF bundle at \`${b}/\` (start at \`${b}/index.md\`). Run OKF tools from the repo root. If nested bundles exist, use the closest parent \`okf/\` of the file you are working on. At session start, run \`node ${s}okf-lint/scripts/lint.js --drift\`; if it reports drift, run \`node ${s}okf-maintain/scripts/maintain.js\`.

## ⚡ Pre-Work Grounding Gate (MANDATORY)
Before answering questions about the system, planning, or editing:
1. **Search:** \`node ${s}okf-query/scripts/query.js --search <keywords>\` (or read \`${b}/index.md\`).
2. **Per-file context:** \`node ${s}okf-query/scripts/query.js --file <path[,path2,...]>\` before analyzing or editing files (batch multiple paths in one comma-separated call); if nothing matches, search by module name.
3. **Cite** the concept(s) you used, or state "OKF Check: no matching concept for <topic>".
4. **Model-Tier Routing:** use the model's **High** setting for bootstrapping, architecture discovery and planning; switch to **Medium** once the plan is approved, for implementation and upkeep.

## ⚡ Pre-Completion Verification Gate (MANDATORY)
Before reporting work complete after changing code:
1. **Semantic Concept & Source Binding Upkeep:** update affected concepts, or create one, when you change a schema, component, API, configuration or build/deploy step, or learn a durable constraint or pattern. Bind new or changed source files in the concept's \`resource:\`/\`sources:\` frontmatter, and add a dated line to \`${b}/log.md\`.
2. **Maintain:** \`node ${s}okf-maintain/scripts/maintain.js\` (refreshes timestamps, the \`## Not yet specified\` frontier, \`log.md\` and \`viz.html\`).
3. **Lint:** \`node ${s}okf-lint/scripts/lint.js --drift\`. It must report 0 errors and 0 warnings (use \`;\` rather than \`&&\` when chaining commands in Windows PowerShell).

<!-- okf-steering-version: ${targetVersion} -->`;
}

function inspectAndSyncSteeringFile(filePath, workspaceRoot, bundleRoot, targetVersion, dryRun = false, options = {}) {
  if (!fs.existsSync(filePath)) return { exists: false, outdated: false, updated: false };
  const rawContent = fs.readFileSync(filePath, 'utf8');
  const eol = rawContent.includes('\r\n') ? '\r\n' : '\n';
  let content = rawContent.replace(/\r\n/g, '\n');

  // Check if file is related to OKF
  const isOkfRelated = content.includes('Knowledge Bundle') ||
                       content.includes('okf-maintain') ||
                       content.includes('okf-steering-version') ||
                       content.includes('Open Knowledge Format');
  if (!isOkfRelated) return { exists: true, outdated: false, updated: false };

  const versionMatch = content.match(/<!-- okf-steering-version:\s*([0-9.]+)\s*-->/);
  let isOutdated = false;
  if (versionMatch) {
    const v = versionMatch[1].trim();
    if (compareVersions(v, targetVersion) < 0) {
      isOutdated = true;
    }
  } else {
    isOutdated = true;
  }

  if (!content.includes('Pre-Completion Verification Gate') ||
      !content.includes('Pre-Work Grounding Gate') ||
      !content.includes('Model-Tier Routing')) {
    isOutdated = true;
  }

  const platform = options.platform || process.platform;
  if (platform === 'win32' && /\bnode\s+~\//.test(content)) {
    isOutdated = true;
  }

  if (!isOutdated) {
    return { exists: true, outdated: false, updated: false };
  }

  if (dryRun) {
    return { exists: true, outdated: true, updated: false };
  }

  const bundleRel = path.relative(workspaceRoot, bundleRoot).replace(/\\/g, '/') || '.';
  const newBlock = buildSteeringDirectivesBlock(bundleRel, targetVersion, resolveSkillsBase(workspaceRoot, options));

  let newContent = content;
  const startRegex = /(## (?:⚡ )?Pre-Work Grounding Gate[\s\S]*?|## (?:⚡ )?Pre-Completion Verification Gate[\s\S]*?|## (?:📂 )?Knowledge Bundle \/ OKF[\s\S]*?)(?:<!-- okf-steering-version:\s*[0-9.]+\s*-->)/;

  if (startRegex.test(content)) {
    newContent = content.replace(startRegex, newBlock);
  } else if (content.includes('<!-- okf-steering-version:')) {
    newContent = content.replace(/(?:## (?:📂 )?Knowledge Bundle[\s\S]*?)?<!-- okf-steering-version:\s*[0-9.]+\s*-->/, newBlock);
  } else if (content.includes('## Knowledge Bundle / OKF')) {
    const idx = content.indexOf('## Knowledge Bundle / OKF');
    newContent = content.slice(0, idx).trimEnd() + '\n\n' + newBlock + '\n';
  } else {
    newContent = content.trimEnd() + '\n\n' + newBlock + '\n';
  }

  fs.writeFileSync(filePath, eol === '\r\n' ? newContent.replace(/\n/g, '\r\n') : newContent, 'utf8');
  return { exists: true, outdated: true, updated: true };
}

function printHelp() {
  console.log(`
OKF Maintain (v0.2) — Drift Sync, Concept Verification, Pruning & Skill Updater
Usage: node okf-maintain/scripts/maintain.js [options]

Modes:
  (default)                        Sync drifted concept timestamps, index.md frontier, steering files, and log.md.
  --check                          Audit mode: preview drift, unindexed concepts, and frontier without mutating files.
  --verify [<concept>...]          Stamp verified: [{ by, at }] on target concepts (or --all-stale / --all).
  --stale-after <days>d|YYYY-MM-DD Set or roll forward stale_after expiration (or 'none' / --clear-stale to remove).
  --prune [prune-options]          Delegate to lifecycle garbage collection (pass --prune --help for details).
  --upgrade [upgrade-options]      Upgrade v0.1 bundles to v0.2 (pass --upgrade --help for details).
  --skills, --upgrade --skills     Pull latest OKF skills from Git and sync all local/global agent skill folders.
  --evaluate [<id> | --latest]     Audit session transcript and passive CLI telemetry.

Options:
  --by, --actor <actor>            Actor identifier for --verify or sync (e.g., human:alice, process:ci).
  --all-stale                      Target all concepts whose stale_after deadline has expired (with --verify).
  --all                            Target all active concepts in the bundle (with --verify).
  --clear-stale                    Remove stale_after from target concept frontmatter.
  --viz                            Regenerate interactive viz.html graph after sync.
  --bundle <path>                  Custom OKF bundle path (default: 'docs/okf' or 'okf').
  --json                           Emit structured JSON output.
  -h, --help                       Show this help message and exit.
`);
}

async function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const isCheckMode = args.includes('--check');
  const isJson = args.includes('--json');
  const withViz = args.includes('--viz');

  if (args.includes('--prune')) {
    const pruneArgs = args.filter(a => a !== '--prune');
    const pruneScript = path.join(__dirname, 'prune.js');
    try {
      execFileSync(process.execPath, [pruneScript, ...pruneArgs], { stdio: 'inherit' });
      process.exit(0);
    } catch (e) {
      process.exit(typeof e.status === 'number' ? e.status : 1);
    }
  }

  if (args.includes('--upgrade') || args.includes('--upgrade-skills') || args.includes('--skills')) {
    const upgradeArgs = args
      .map(a => (a === '--upgrade-skills' ? '--skills' : a))
      .filter(a => a !== '--upgrade');
    const upgradeScript = path.join(__dirname, 'upgrade.js');
    try {
      execFileSync(process.execPath, [upgradeScript, ...upgradeArgs], { stdio: 'inherit' });
      process.exit(0);
    } catch (e) {
      process.exit(typeof e.status === 'number' ? e.status : 1);
    }
  }

  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--verify') || args.includes('--stale-after') || args.includes('--clear-stale')) {
    const { workspaceRoot, bundleRoot } = resolveWorkspaceAndBundle(args);
    const hasVerifyFlag = args.includes('--verify');
    const allStale = args.includes('--all-stale');
    const allConcepts = args.includes('--all');
    const byIdx = args.indexOf('--by') !== -1 ? args.indexOf('--by') : args.indexOf('--actor');
    const byActor = (byIdx !== -1 && args[byIdx + 1] && !args[byIdx + 1].startsWith('--'))
      ? args[byIdx + 1]
      : null;

    let staleAfterSpec = undefined;
    if (args.includes('--clear-stale')) {
      staleAfterSpec = 'none';
    } else {
      const staleIdx = args.indexOf('--stale-after');
      if (staleIdx !== -1 && args[staleIdx + 1] && !args[staleIdx + 1].startsWith('--')) {
        staleAfterSpec = args[staleIdx + 1];
      }
    }

    const valueFlags = new Set(['--bundle', '--by', '--actor', '--stale-after', '--telemetry']);
    const targets = [];
    for (let i = 0; i < args.length; i++) {
      const tok = args[i];
      if (valueFlags.has(tok)) {
        i++;
        continue;
      }
      if (tok === '--verify' || tok === '--concept') {
        if (args[i + 1] && !args[i + 1].startsWith('--')) {
          targets.push(args[i + 1]);
          i++;
        }
        continue;
      }
      if (!tok.startsWith('--')) {
        targets.push(tok);
      }
    }

    if (targets.length === 0 && !allStale && !allConcepts) {
      const msg = 'Error: Specify at least one concept path (e.g. --verify concepts/auth.md), --all-stale, or --all.';
      if (isJson) {
        console.log(JSON.stringify({ success: false, error: msg }));
      } else {
        console.error(msg);
      }
      process.exit(1);
    }

    try {
      const verifyResult = verifyConcepts({
        bundleRoot,
        workspaceRoot,
        targets,
        allStale,
        allConcepts,
        verify: hasVerifyFlag,
        byActor,
        staleAfterSpec
      });

      let lintPassed = true;
      const siblingLintScript = path.resolve(__dirname, '..', '..', 'okf-lint', 'scripts', 'lint.js');
      const workspaceLintScript = path.join(workspaceRoot, 'okf-lint', 'scripts', 'lint.js');
      const lintScript = fs.existsSync(siblingLintScript) ? siblingLintScript : workspaceLintScript;
      if (fs.existsSync(lintScript)) {
        try {
          execFileSync(process.execPath, [lintScript, '--bundle', bundleRoot, '--drift'], {
            cwd: workspaceRoot,
            stdio: 'ignore',
            env: { ...process.env, OKF_INTERNAL_CALL: '1' }
          });
          lintPassed = true;
        } catch (e) {
          lintPassed = false;
        }
      }
      verifyResult.lintPassed = lintPassed;

      if (isJson) {
        console.log(JSON.stringify(verifyResult, null, 2));
      } else {
        console.log(`OKF Concept Verification Complete ✓`);
        console.log(`----------------------------------------`);
        if (hasVerifyFlag) {
          console.log(`Verifier Actor:        ${verifyResult.verifierActor}`);
          console.log(`Verified At:           ${verifyResult.verifiedAt}`);
        }
        console.log(`Concepts Updated:      ${verifyResult.verifiedCount}`);
        for (const r of verifyResult.results) {
          const tierPart = r.trustTier ? ` [Trust Tier: ${r.trustTier}]` : '';
          const stalePart = r.staleAfter ? ` (stale_after: ${r.staleAfter})` : '';
          console.log(`  - ${r.file}${tierPart}${stalePart}`);
        }
        console.log(`Log recorded:          ${verifyResult.logUpdated ? 'Yes' : 'No'}`);
        console.log(`Lint verification:     ${lintPassed ? 'Passed' : 'Failed'}`);
        console.log(`----------------------------------------`);
      }
      return;
    } catch (err) {
      if (isJson) {
        console.log(JSON.stringify({ success: false, error: err.message }));
      } else {
        console.error(`Error: ${err.message}`);
      }
      process.exit(1);
    }
  }

  if (args.includes('--evaluate')) {
    const telPath = resolveTelemetryPath(args) || path.join(os.homedir(), '.okf', 'telemetry.jsonl');
    if (args.includes('--reset')) {
      try {
        const dir = path.dirname(telPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(telPath, '', 'utf8');
      } catch (e) {}
      if (isJson) {
        console.log(JSON.stringify({ success: true, reset: true, telemetryPath: telPath }, null, 2));
      } else {
        console.log('✓ OKF telemetry log cleared.');
      }
      return;
    }

    const evalIdx = args.indexOf('--evaluate');
    let conversationId = null;
    if (args[evalIdx + 1] && !args[evalIdx + 1].startsWith('--')) {
      conversationId = args[evalIdx + 1];
    }
    const brainIdx = args.indexOf('--brain-dir');
    const brainDir = (brainIdx !== -1 && args[brainIdx + 1]) ? path.resolve(args[brainIdx + 1]) : undefined;
    const report = evaluateSkillsPerformance({ conversationId, brainDir, telemetryPath: telPath });
    if (isJson) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    const c = report.conversation;
    const t = report.telemetry;
    console.log('==========================================================');
    console.log(`OKF Skill Self-Improvement Report${c.conversationId ? ` (Conversation: ${c.conversationId})` : ''}`);
    console.log('==========================================================');
    if (c.warning) {
      console.log(`⚠️  Warning:          ${c.warning}`);
    }
    if (c.found && c.transcriptFormat !== 'unrecognized' && c.transcriptFormat !== 'empty') {
      console.log(`Session Metrics:     ${c.stepCount} steps | ${c.userTurnCount} user turns | ${c.durationMinutes} min${c.transcriptFormat ? ` | Format: ${c.transcriptFormat}` : ''}`);
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
    } else {
      console.log('Transcript:          No matching conversation transcript found.');
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
    return;
  }

  let actor = 'process:okf-maintain';
  const actorIdx = args.indexOf('--actor');
  if (actorIdx !== -1 && args[actorIdx + 1]) {
    actor = args[actorIdx + 1];
  }

  const { workspaceRoot, bundleRoot } = resolveWorkspaceAndBundle(args);

  if (!fs.existsSync(bundleRoot)) {
    const otherBranches = findBundlesOnOtherBranches(workspaceRoot);
    let err = `Error: OKF bundle not found at docs/okf or okf. Path checked: ${bundleRoot}`;
    if (otherBranches.length > 0) {
      const first = otherBranches[0];
      err += `\nHint: An OKF bundle exists on branch '${first.branch}' at '${first.bundlePath}/'. To bring it onto this branch, run: git checkout ${first.branch} -- ${first.bundlePath}`;
    }
    if (isJson) {
      console.log(JSON.stringify({ success: false, error: err, otherBranches }));
    } else {
      console.error(err);
    }
    process.exit(1);
  }

  // Auto-sync index.html and skill mirrors when running inside the okf-skills repository
  const repoSyncScript = path.join(workspaceRoot, 'scripts', 'sync-skills.js');
  if (!isCheckMode && fs.existsSync(repoSyncScript) && fs.existsSync(path.join(workspaceRoot, 'index.html'))) {
    try {
      execFileSync(process.execPath, [repoSyncScript], { cwd: workspaceRoot, stdio: 'ignore' });
    } catch (e) {}
  }

  const conceptFiles = walkConceptFiles(bundleRoot);
  const healedAssetConcepts = !isCheckMode ? healStaleHashedAssetBindings(conceptFiles, workspaceRoot, bundleRoot) : [];
  const documentedResources = new Set();
  const driftedConcepts = [];
  const staleConcepts = [];
  const allConceptRecords = [];

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
      const local = resolveResourceLocalPath(fm.resource, workspaceRoot, bundleRoot);
      if (local) {
        documentedResources.add(path.relative(workspaceRoot, local).replace(/\\/g, '/').toLowerCase());
        documentedResources.add(path.resolve(local).toLowerCase());
        resourcesToCheck.push({ path: local, label: path.basename(local) });
      }
    }
    if (Array.isArray(fm.sources)) {
      fm.sources.forEach(src => {
        const rawResource = typeof src === 'string' ? src : (src && src.resource);
        if (rawResource && !/^https?:\/\//i.test(rawResource)) {
          const local = resolveResourceLocalPath(rawResource, workspaceRoot, bundleRoot);
          if (local) {
            documentedResources.add(path.relative(workspaceRoot, local).replace(/\\/g, '/').toLowerCase());
            documentedResources.add(path.resolve(local).toLowerCase());
            const label = (src && typeof src === 'object' && src.title) ? src.title : path.basename(local);
            resourcesToCheck.push({ path: local, label });
          }
        }
      });
    }
    if (fm.computation) {
      const local = resolveResourceLocalPath(fm.computation, workspaceRoot, bundleRoot);
      if (local) {
        documentedResources.add(path.relative(workspaceRoot, local).replace(/\\/g, '/').toLowerCase());
        documentedResources.add(path.resolve(local).toLowerCase());
        resourcesToCheck.push({ path: local, label: path.basename(local) });
      }
    }
    if (fm.executor && fm.executor.resource) {
      const local = resolveResourceLocalPath(fm.executor.resource, workspaceRoot, bundleRoot);
      if (local) {
        documentedResources.add(path.relative(workspaceRoot, local).replace(/\\/g, '/').toLowerCase());
        documentedResources.add(path.resolve(local).toLowerCase());
        resourcesToCheck.push({ path: local, label: path.basename(local) });
      }
    }
    if (fm.attester && fm.attester.resource) {
      const local = resolveResourceLocalPath(fm.attester.resource, workspaceRoot, bundleRoot);
      if (local) {
        documentedResources.add(path.relative(workspaceRoot, local).replace(/\\/g, '/').toLowerCase());
        documentedResources.add(path.resolve(local).toLowerCase());
        resourcesToCheck.push({ path: local, label: path.basename(local) });
      }
    }

    const lastModified = fm.timestamp || (fm.generated && fm.generated.at);
    const conceptTime = lastModified ? new Date(lastModified) : null;
    const effectiveConceptTime = getEffectiveConceptTime(cFile, lastModified, workspaceRoot);
    allConceptRecords.push({
      file: relConcept,
      fullPath: cFile,
      title: fm.title || path.basename(cFile, '.md'),
      status: fm.status || 'stable',
      absKey: path.resolve(cFile).toLowerCase(),
      conceptTimeIso: (conceptTime && !isNaN(conceptTime.getTime())) ? conceptTime.toISOString() : null,
      resourcesToCheck
    });

    if (effectiveConceptTime && !isNaN(effectiveConceptTime.getTime())) {
      for (const res of resourcesToCheck) {
        if (fs.existsSync(res.path) && !isReservedBundleFile(res.path, bundleRoot)) {
          if (isCoModifiedInLatestCommit(cFile, res.path, workspaceRoot)) {
            continue;
          }
          const gitTimeStr = getResourceEffectiveModifiedISO(res.path, workspaceRoot, bundleRoot);
          if (gitTimeStr) {
            const gitTime = new Date(gitTimeStr);
            if (gitTime > effectiveConceptTime) {
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

  // Propagate drift transitively when Concept B references Concept A in resource/sources and Concept A is drifted
  for (const hc of healedAssetConcepts) {
    if (!driftedConcepts.some(d => d.file === hc.file)) {
      driftedConcepts.push({
        file: hc.file,
        fullPath: hc.fullPath,
        resource: hc.resource,
        gitTime: new Date().toISOString(),
        conceptTime: new Date(0).toISOString()
      });
    }
  }
  const driftedByAbsKey = new Map(driftedConcepts.map(d => [path.resolve(d.fullPath).toLowerCase(), d]));
  let addedTransitive = true;
  while (addedTransitive) {
    addedTransitive = false;
    for (const rec of allConceptRecords) {
      if (driftedByAbsKey.has(rec.absKey)) continue;
      for (const res of rec.resourcesToCheck) {
        const resKey = path.resolve(res.path).toLowerCase();
        if (driftedByAbsKey.has(resKey)) {
          const upstream = driftedByAbsKey.get(resKey);
          const transDrift = {
            file: rec.file,
            fullPath: rec.fullPath,
            resource: res.label,
            gitTime: upstream.gitTime,
            conceptTime: rec.conceptTimeIso || upstream.conceptTime
          };
          driftedConcepts.push(transDrift);
          driftedByAbsKey.set(rec.absKey, transDrift);
          addedTransitive = true;
          break;
        }
      }
    }
  }

  // 2. Scan workspace for undocumented frontier files
  const frontierList = scanWorkspaceFiles(workspaceRoot, workspaceRoot, documentedResources, [], null, bundleRoot);

  // Check if index.md has unlisted frontier files or unindexed active concepts
  const indexPath = path.join(bundleRoot, 'index.md');
  const missingFrontierInIndex = [];
  if (fs.existsSync(indexPath)) {
    const bundleMarkdownLower = collectBundleMarkdownLower(bundleRoot);
    for (const f of frontierList) {
      if (!isAcknowledgedInBundle(f.path, bundleMarkdownLower)) {
        missingFrontierInIndex.push(f.path);
      }
    }
  }
  const unindexedRecords = findUnindexedConcepts(indexPath, allConceptRecords);
  const unindexedConcepts = unindexedRecords.map(r => r.file);

  // 3. Inspect steering notice files across all supported agents
  const steeringFilesToCheck = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', '.windsurfrules', '.clinerules', 'GEMINI.md'];
  const outdatedSteeringFiles = [];
  for (const sName of steeringFilesToCheck) {
    const sPath = path.join(workspaceRoot, sName);
    const res = inspectAndSyncSteeringFile(sPath, workspaceRoot, bundleRoot, TARGET_STEERING_VERSION, true);
    if (res.outdated) {
      outdatedSteeringFiles.push(sName);
    }
  }

  if (isCheckMode) {
    const clean =
      driftedConcepts.length === 0 &&
      missingFrontierInIndex.length === 0 &&
      unindexedConcepts.length === 0 &&
      outdatedSteeringFiles.length === 0;
    if (isJson) {
      console.log(JSON.stringify({
        success: clean,
        inSync: clean,
        bundleRoot,
        drifted: driftedConcepts,
        stale: staleConcepts,
        unindexedFrontier: missingFrontierInIndex,
        unindexedConcepts,
        outdatedSteering: outdatedSteeringFiles
      }, null, 2));
    } else {
      console.log(`OKF Maintenance Audit: ${bundleRoot}`);
      console.log(`----------------------------------------`);
      console.log(`Concepts checked:    ${conceptFiles.length}`);
      console.log(`Drifted concepts:    ${driftedConcepts.length}`);
      console.log(`Stale concepts:      ${staleConcepts.length}`);
      console.log(`Unindexed concepts:  ${unindexedConcepts.length}`);
      console.log(`Unindexed frontier:  ${missingFrontierInIndex.length}`);
      console.log(`Outdated steering:   ${outdatedSteeringFiles.length}`);
      console.log(`----------------------------------------`);
      if (driftedConcepts.length > 0) {
        console.log(`Drifted concepts:`);
        driftedConcepts.forEach(d => console.log(`  - ${d.file} (resource ${d.resource} updated on ${d.gitTime})`));
      }
      if (unindexedConcepts.length > 0) {
        console.log(`Unindexed active concepts:`);
        unindexedConcepts.forEach(c => console.log(`  - ${c}`));
      }
      if (missingFrontierInIndex.length > 0) {
        console.log(`Unindexed frontier files:`);
        missingFrontierInIndex.forEach(f => console.log(`  - ${f}`));
      }
      if (outdatedSteeringFiles.length > 0) {
        console.log(`Outdated steering files:`);
        outdatedSteeringFiles.forEach(s => console.log(`  - ${s} (outdated or missing Pre-Work / Pre-Completion Gate; run okf-maintain to sync)`));
      }
    }
    process.exit(clean ? 0 : 1);
  }

  // 3. Execution / Sync Mode
  const logEntries = [];
  const updatedFiles = [];

  // 3a. Auto-sync steering notice files first so any concept binding AGENTS.md gets a newer timestamp
  const updatedSteering = [];
  for (const sName of steeringFilesToCheck) {
    const sPath = path.join(workspaceRoot, sName);
    const res = inspectAndSyncSteeringFile(sPath, workspaceRoot, bundleRoot, TARGET_STEERING_VERSION, false);
    if (res.updated) {
      updatedSteering.push(sName);
    }
  }
  if (updatedSteering.length > 0) {
    logEntries.push(`Synchronized steering notice in \`${updatedSteering.join(', ')}\` to v${TARGET_STEERING_VERSION}.`);
  }

  const syncDate = new Date();
  const nowISO = syncDate.toISOString();
  const dateStr = nowISO.slice(0, 10);

  // 3b. Update timestamps for drifted concepts (and align mtime to syncDate so transitive concept checks never see mtime > generated.at)
  const updatedConceptPaths = [];
  for (const drift of driftedConcepts) {
    const ok = updateConceptTimestamp(drift.fullPath, nowISO, actor, syncDate);
    if (ok) {
      updatedFiles.push(drift.file);
      updatedConceptPaths.push(drift.fullPath);
    }
  }
  for (const fullP of updatedConceptPaths) {
    try {
      fs.utimesSync(fullP, syncDate, syncDate);
    } catch (e) {}
  }
  if (updatedFiles.length > 0) {
    logEntries.push(`Synchronized timestamp for ${updatedFiles.length} drifted concept(s): ${updatedFiles.join(', ')}.`);
  }

  // 3c. Auto-index unindexed active concepts and update index.md frontier
  let conceptsIndexed = false;
  let indexUpdated = false;
  let frontierDelta = { updated: false, added: 0, removed: 0, alreadyListed: 0 };
  if (fs.existsSync(indexPath)) {
    conceptsIndexed = updateIndexConcepts(indexPath, unindexedRecords);
    if (conceptsIndexed) {
      logEntries.push(`Indexed ${unindexedRecords.length} active concept(s) in \`index.md\`: ${unindexedConcepts.join(', ')}.`);
    }
    frontierDelta = updateIndexFrontier(indexPath, frontierList, documentedResources, workspaceRoot);
    indexUpdated = Boolean(frontierDelta && frontierDelta.updated);
    if (indexUpdated) {
      logEntries.push(
        `Synchronized workspace frontier mapping in \`index.md\` (+${frontierDelta.added} new, -${frontierDelta.removed} removed, ${frontierDelta.alreadyListed} already listed; ${frontierList.length} undocumented files mapped).`
      );
    }
  }

  // 3d. Record in log.md
  const logPath = path.join(bundleRoot, 'log.md');
  let logUpdated = false;
  if (logEntries.length > 0 && fs.existsSync(logPath)) {
    logUpdated = appendLogEntry(logPath, logEntries, dateStr);
  }

  // 3e. Regenerate visualizer only when explicitly requested via --viz
  let vizGenerated = false;
  const siblingVizScript = path.resolve(__dirname, '..', '..', 'okf-visualize', 'scripts', 'visualize.js');
  const workspaceVizScript = path.join(workspaceRoot, 'okf-visualize', 'scripts', 'visualize.js');
  const vizScript = fs.existsSync(siblingVizScript) ? siblingVizScript : workspaceVizScript;
  if (withViz && fs.existsSync(vizScript)) {
    try {
      execFileSync(process.execPath, [vizScript, '--bundle', bundleRoot, '--no-open'], {
        cwd: workspaceRoot,
        stdio: 'ignore',
        env: { ...process.env, OKF_INTERNAL_CALL: '1' }
      });
      vizGenerated = true;
    } catch (e) {}
  }

  // 3f. Verify conformance in-process via okf-lint if available (check sibling skill dir first, then workspaceRoot)
  let lintPassed = true;
  const siblingLintScript = path.resolve(__dirname, '..', '..', 'okf-lint', 'scripts', 'lint.js');
  const workspaceLintScript = path.join(workspaceRoot, 'okf-lint', 'scripts', 'lint.js');
  const lintScript = fs.existsSync(siblingLintScript) ? siblingLintScript : workspaceLintScript;
  if (fs.existsSync(lintScript)) {
    try {
      const lintMod = require(lintScript);
      if (lintMod && typeof lintMod.scanAndLint === 'function') {
        if (typeof lintMod.resetGitCaches === 'function') lintMod.resetGitCaches();
        const lintRes = lintMod.scanAndLint(bundleRoot, bundleRoot, workspaceRoot, false, false);
        lintPassed = Boolean(lintRes && Array.isArray(lintRes.errors) && lintRes.errors.length === 0);
      } else {
        execFileSync(process.execPath, [lintScript, '--bundle', bundleRoot], {
          cwd: workspaceRoot,
          stdio: 'ignore',
          env: { ...process.env, OKF_INTERNAL_CALL: '1' }
        });
        lintPassed = true;
      }
    } catch (e) {
      lintPassed = false;
    }
  }

  const nudgeLine = checkSessionAnomaliesForNudge(workspaceRoot, args);
  const durationMs = Date.now() - startTime;
  const anomalies = [];
  if (durationMs > 2000) anomalies.push('slow_exec');
  if (!lintPassed) anomalies.push('lint_error');

  if (isJson) {
    console.log(JSON.stringify({
      success: true,
      bundleRoot,
      updatedConcepts: updatedFiles,
      indexedConcepts: conceptsIndexed ? unindexedConcepts : [],
      indexFrontierUpdated: indexUpdated,
      frontierDelta,
      steeringUpdated: updatedSteering,
      logUpdated,
      vizGenerated,
      lintPassed
    }, null, 2));
  } else {
    const frontierSummary = indexUpdated
      ? `Yes (+${frontierDelta.added} new, -${frontierDelta.removed} removed, ${frontierDelta.alreadyListed} already listed)`
      : 'Up to date';
    console.log(`OKF Maintenance Sync Complete 🎉`);
    console.log(`----------------------------------------`);
    console.log(`Concepts synchronized: ${updatedFiles.length}`);
    console.log(`Concepts indexed:      ${conceptsIndexed ? unindexedConcepts.length : 'Up to date'}`);
    console.log(`Frontier updated:       ${frontierSummary}`);
    console.log(`Steering updated:       ${updatedSteering.length > 0 ? updatedSteering.join(', ') : 'Up to date'}`);
    console.log(`Log recorded:           ${logUpdated ? 'Yes' : 'Up to date'}`);
    if (withViz) console.log(`Visualization updated:  ${vizGenerated ? 'Yes' : 'N/A'}`);
    console.log(`Lint verification:      ${lintPassed ? 'Passed' : 'Failed'}`);
    console.log(`----------------------------------------`);
    if (nudgeLine) {
      console.log(nudgeLine);
    }
  }

  recordTelemetry({
    skill: 'okf-maintain',
    workspaceRoot,
    mode: 'sync',
    updatedCount: updatedFiles.length,
    frontierCount: frontierList.length,
    lintPassed,
    durationMs,
    anomalies
  }, args);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseFrontmatter,
  inspectAndSyncSteeringFile,
  buildSteeringDirectivesBlock,
  resolveSkillsBase,
  findUnindexedConcepts,
  updateIndexConcepts,
  getRepoCommitTimeMap,
  recordTelemetry,
  evaluateSkillsPerformance,
  updateConceptVerification,
  verifyConcepts
};
