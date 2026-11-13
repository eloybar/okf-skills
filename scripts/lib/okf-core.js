const fs = require('fs');
const path = require('path');

// === BEGIN OKF SHARED CORE (AUTO-SYNCED FROM scripts/lib/okf-core.js) ===
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;

  const yamlText = match[1];
  const result = {};
  const lines = yamlText.split(/\r?\n/);

  function unquote(s) {
    s = s.trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;
  }

  function splitByTopLevelComma(str) {
    const parts = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if ((ch === '"' || ch === "'") && (i === 0 || str[i - 1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = ch;
        } else if (ch === quoteChar) {
          inQuotes = false;
        }
      }
      if (ch === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  function parseInlineObject(str) {
    const inner = str.slice(1, -1).trim();
    if (!inner) return {};
    const obj = {};
    for (const part of splitByTopLevelComma(inner)) {
      const cIdx = part.indexOf(':');
      if (cIdx !== -1) {
        const k = part.slice(0, cIdx).trim();
        const v = unquote(part.slice(cIdx + 1));
        obj[k] = v;
      }
    }
    return obj;
  }

  let currentKey = null;
  let currentList = null;
  let currentMap = null;
  let currentListObj = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = rawLine.search(/\S/);

    // Top-level key
    if (indent === 0) {
      currentList = null;
      currentMap = null;
      currentListObj = null;

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      let val = trimmed.slice(colonIdx + 1).trim();
      currentKey = key;

      if (!val) {
        result[key] = null;
      } else if (val.startsWith('[') && val.endsWith(']')) {
        const inner = val.slice(1, -1).trim();
        result[key] = inner ? splitByTopLevelComma(inner).map(unquote).filter(Boolean) : [];
      } else if (val.startsWith('{') && val.endsWith('}')) {
        result[key] = parseInlineObject(val);
      } else {
        result[key] = unquote(val);
      }
    } else if (currentKey) {
      // Indented under currentKey
      if (trimmed.startsWith('-')) {
        if (!Array.isArray(result[currentKey])) {
          result[currentKey] = [];
        }
        currentList = result[currentKey];
        currentMap = null;

        const afterDash = trimmed.slice(1).trim();
        if (!afterDash) {
          currentListObj = {};
          currentList.push(currentListObj);
        } else if (afterDash.startsWith('{') && afterDash.endsWith('}')) {
          currentListObj = null;
          currentList.push(parseInlineObject(afterDash));
        } else {
          const colonIdx = afterDash.indexOf(':');
          const looksLikeKeyVal = colonIdx !== -1 && !afterDash.startsWith('"') && !afterDash.startsWith("'") && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(afterDash);
          if (looksLikeKeyVal) {
            currentListObj = {};
            const k = afterDash.slice(0, colonIdx).trim();
            const v = unquote(afterDash.slice(colonIdx + 1));
            currentListObj[k] = v;
            currentList.push(currentListObj);
          } else {
            currentListObj = null;
            currentList.push(unquote(afterDash));
          }
        }
      } else {
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx !== -1) {
          const k = trimmed.slice(0, colonIdx).trim();
          const v = unquote(trimmed.slice(colonIdx + 1));

          if (currentListObj) {
            if (v.startsWith('[') && v.endsWith(']')) {
              const inner = v.slice(1, -1).trim();
              currentListObj[k] = inner ? splitByTopLevelComma(inner).map(unquote).filter(Boolean) : [];
            } else {
              currentListObj[k] = v;
            }
          } else {
            if (!result[currentKey] || typeof result[currentKey] !== 'object' || Array.isArray(result[currentKey])) {
              result[currentKey] = {};
            }
            currentMap = result[currentKey];
            if (v.startsWith('[') && v.endsWith(']')) {
              const inner = v.slice(1, -1).trim();
              currentMap[k] = inner ? splitByTopLevelComma(inner).map(unquote).filter(Boolean) : [];
            } else {
              currentMap[k] = v;
            }
          }
        }
      }
    }
  }

  return result;
}

function getConceptBody(content) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  if (!match) return content;
  return content.slice(match[0].length).trim();
}

function serializeFrontmatter(fm) {
  let out = '---\n';

  function formatScalar(val) {
    if (val === undefined || val === null) return '';
    const str = String(val);
    if (str.includes(':') || str.includes('#') || str.includes('[') || str.includes(']') || str.includes('{') || str.includes('}') || str.includes(',')) {
      if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('file://') || str.startsWith('bigquery://')) {
        if (!str.includes(',') && !str.includes('#') && !str.includes(' ')) return str;
      }
      return `"${str.replace(/"/g, '\\"')}"`;
    }
    return str;
  }

  const orderedKeys = [
    'okf_version', 'type', 'title', 'description', 'resource', 'tags',
    'status', 'stale_after', 'archived_at', 'generated', 'verified',
    'sources', 'usage_window', 'runtime', 'parameters', 'computation', 'executor', 'attester'
  ];

  const allKeys = Array.from(new Set([...orderedKeys, ...Object.keys(fm)]));

  for (const key of allKeys) {
    if (!(key in fm) || fm[key] === undefined || fm[key] === null) continue;
    const val = fm[key];

    if (key === 'tags' && Array.isArray(val)) {
      out += `tags: [${val.map(formatScalar).join(', ')}]\n`;
    } else if (Array.isArray(val)) {
      if (val.length === 0) continue;
      out += `${key}:\n`;
      for (const item of val) {
        if (typeof item === 'object' && item !== null) {
          const entries = Object.entries(item).filter(([, v]) => v !== undefined && v !== null);
          if (entries.length === 0) continue;
          const [firstK, firstV] = entries[0];
          const firstFormatted = Array.isArray(firstV)
            ? `[${firstV.map(formatScalar).join(', ')}]`
            : formatScalar(firstV);
          out += `  - ${firstK}: ${firstFormatted}\n`;
          for (let idx = 1; idx < entries.length; idx++) {
            const [k, v] = entries[idx];
            if (Array.isArray(v)) {
              out += `    ${k}: [${v.map(formatScalar).join(', ')}]\n`;
            } else {
              out += `    ${k}: ${formatScalar(v)}\n`;
            }
          }
        } else {
          out += `  - ${formatScalar(item)}\n`;
        }
      }
    } else if (typeof val === 'object') {
      out += `${key}:\n`;
      for (const [k, v] of Object.entries(val)) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) {
          out += `  ${k}: [${v.map(formatScalar).join(', ')}]\n`;
        } else {
          out += `  ${k}: ${formatScalar(v)}\n`;
        }
      }
    } else {
      out += `${key}: ${formatScalar(val)}\n`;
    }
  }

  out += '---';
  return out;
}

function resolveResourceLocalPath(resourceUri, workspaceRoot, bundleRoot) {
  if (!resourceUri || typeof resourceUri !== 'string') return null;
  const trimmed = resourceUri.trim();
  if (!trimmed) return null;

  // Ignore non-file URI schemes (e.g. bigquery://, gs://, https://, http://, s3://, postgres://, urn:)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) && !trimmed.startsWith('file://')) {
    return null;
  }
  if (/^(urn|mailto|tel|data):/i.test(trimmed)) {
    return null;
  }
  // Ignore free-text scope descriptors (OKF v0.2 §5.1)
  if (/\s+\((?:excluding|including)\b/i.test(trimmed)) {
    return null;
  }

  let localPath = trimmed;
  if (localPath.startsWith('file:///')) {
    localPath = localPath.slice(8);
    if (process.platform !== 'win32' && !localPath.startsWith('/')) {
      localPath = '/' + localPath;
    }
  } else if (localPath.startsWith('file://')) {
    localPath = localPath.slice(7);
  }

  localPath = decodeURIComponent(localPath);

  if (path.isAbsolute(localPath)) {
    if (fs.existsSync(localPath)) {
      return path.normalize(localPath);
    }
    const relFromRoot = localPath.replace(/^[/\\]+/, '');
    if (bundleRoot) {
      const bundleCandidate = path.normalize(path.join(bundleRoot, relFromRoot));
      if (fs.existsSync(bundleCandidate)) {
        return bundleCandidate;
      }
    }
    return path.normalize(path.join(workspaceRoot, relFromRoot));
  }

  const wsCandidate = path.normalize(path.join(workspaceRoot, localPath));
  if (fs.existsSync(wsCandidate)) {
    return wsCandidate;
  }
  if (bundleRoot) {
    const bundleRelCandidate = path.normalize(path.join(bundleRoot, localPath));
    if (fs.existsSync(bundleRelCandidate)) {
      return bundleRelCandidate;
    }
  }
  return wsCandidate;
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

function normalizeActor(actorStr) {
  if (!actorStr || typeof actorStr !== 'string') return actorStr;
  const trimmed = actorStr.trim();
  if (trimmed.startsWith('agent:')) {
    return trimmed.slice('agent:'.length);
  }
  return trimmed;
}

const ROOT_HYGIENE_FILES = new Set([
  '.gitignore', '.gitattributes', '.gitmodules', '.editorconfig',
  '.nvmrc', '.node-version', '.npmrc', '.yarnrc', '.yarnrc.yml',
  '.prettierignore', '.eslintignore', '.dockerignore', '.stylelintignore',
  'license', 'license.md', 'license.txt', 'skills-lock.json'
]);

function isRootHygieneFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const cleaned = filePath.trim().replace(/\\/g, '/').replace(/^\.?\//, '');
  if (!cleaned) return false;
  const base = path.basename(cleaned).toLowerCase();
  return ROOT_HYGIENE_FILES.has(base);
}

function computeTrustTier(fm) {
  if (!fm || !fm.verified) return 'unverified';
  const verifications = Array.isArray(fm.verified) ? fm.verified : [fm.verified];
  if (verifications.length === 0) return 'unverified';
  const hasValidVerifier = verifications.some(v => v && v.by);
  if (!hasValidVerifier) return 'unverified';
  const hasHuman = verifications.some(v => v && v.by && String(v.by).startsWith('human:'));
  return hasHuman ? 'human-reviewed' : 'machine-confirmed';
}
// === END OKF SHARED CORE ===

module.exports = {
  parseFrontmatter,
  getConceptBody,
  serializeFrontmatter,
  resolveResourceLocalPath,
  collectConceptResourceUris,
  normalizeActor,
  ROOT_HYGIENE_FILES,
  isRootHygieneFile,
  computeTrustTier
};
