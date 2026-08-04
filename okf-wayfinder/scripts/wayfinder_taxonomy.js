const fs = require('fs');
const path = require('path');

/**
 * Parses frontmatter YAML block to extract key-value pairs.
 */
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const matchIndent = line.match(/^(\s*)/);
    const indent = matchIndent ? matchIndent[1].length : 0;
    const colonIndex = line.indexOf(':');

    // Handle multiline lists (e.g., sources list)
    if (line.trim().startsWith('-')) {
      if (currentKey) {
        if (!Array.isArray(fm[currentKey])) {
          fm[currentKey] = [];
        }
        const arrayVal = line.trim().slice(1).trim();
        if (arrayVal) {
          fm[currentKey].push(parseInlineValue(arrayVal));
        } else {
          // Indented list object parsing
          const obj = {};
          let j = i + 1;
          while (j < lines.length) {
            const subLine = lines[j];
            const subIndentMatch = subLine.match(/^(\s*)/);
            const subIndent = subIndentMatch ? subIndentMatch[1].length : 0;
            if (subIndent <= indent) break;
            
            const subColonIndex = subLine.indexOf(':');
            if (subColonIndex !== -1) {
              const k = subLine.slice(0, subColonIndex).trim();
              let v = subLine.slice(subColonIndex + 1).trim();
              if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                v = v.slice(1, -1);
              }
              obj[k] = v;
            }
            j++;
          }
          fm[currentKey].push(obj);
          i = j - 1;
        }
      }
      continue;
    }

    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let val = line.slice(colonIndex + 1).trim();

    if (indent === 0) {
      currentKey = key;
      if (val === '') {
        fm[key] = {};
      } else {
        fm[key] = parseInlineValue(val);
      }
    } else {
      if (fm[currentKey] && typeof fm[currentKey] === 'object') {
        fm[currentKey][key] = parseInlineValue(val);
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

/**
 * Recursively scans files in directory to collect OKF metadata.
 */
function scanBundleTaxonomy(dir, bundleRoot, workspaceRoot, taxonomy = { types: new Set(), tags: new Set(), resources: new Set() }) {
  if (!fs.existsSync(dir)) return taxonomy;
  
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      scanBundleTaxonomy(fullPath, bundleRoot, workspaceRoot, taxonomy);
    } else if (stat.isFile() && file.endsWith('.md')) {
      const lower = file.toLowerCase();
      if (lower === 'index.md' || lower === 'log.md') continue;
      
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const fm = parseFrontmatter(content);
        if (fm) {
          if (fm.type) {
            taxonomy.types.add(fm.type);
          }
          if (Array.isArray(fm.tags)) {
            fm.tags.forEach(t => taxonomy.tags.add(t));
          }
          const resources = [];
          if (fm.resource) {
            resources.push(fm.resource);
          }
          if (Array.isArray(fm.sources)) {
            fm.sources.forEach(src => {
              if (src.resource) {
                resources.push(src.resource);
              }
            });
          }
          for (const res of resources) {
            const resolved = resolveResourceLocalPath(res, workspaceRoot);
            if (resolved) {
              taxonomy.resources.add(resolved);
            }
          }
        }
      } catch (err) {
        // Fail silently for individual read errors
      }
    }
  }
  return taxonomy;
}

/**
 * Reads .gitignore file and compiles patterns to RegExp rules.
 */
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
        
        // Escape regex special chars except * and ?
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

/**
 * Recursively scans the workspace to find files that do not have associated concepts.
 */
function scanWorkspace(dir, workspaceRoot, documentedResources, results = [], gitignorePatterns = null) {
  if (!fs.existsSync(dir)) return results;
  
  if (gitignorePatterns === null) {
    gitignorePatterns = loadGitignorePatterns(workspaceRoot);
  }
  
  const files = fs.readdirSync(dir);
  const ignores = ['.git', 'node_modules', '.agents', '.claude', 'agent', 'docs', 'tmp'];
  
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
      scanWorkspace(fullPath, workspaceRoot, documentedResources, results, gitignorePatterns);
    } else if (stat.isFile()) {
      const normalized = path.normalize(fullPath);
      if (!documentedResources.has(normalized)) {
        // Skip common auxiliary files that do not warrant dedicated concept maps
        if (file !== 'skills-lock.json' && file !== '.gitignore' && file !== 'LICENSE') {
          results.push({
            path: relPath,
            absolutePath: normalized
          });
        }
      }
    }
  }
  return results;
}

function main() {
  const workspaceRoot = process.cwd();
  let bundlePath = path.resolve(workspaceRoot, 'docs/okf');
  if (!fs.existsSync(bundlePath)) {
    bundlePath = path.resolve(workspaceRoot, 'okf');
  }

  if (!fs.existsSync(bundlePath)) {
    console.error(JSON.stringify({ error: `OKF bundle root not found in ${workspaceRoot}` }));
    process.exit(1);
  }
  
  const taxonomy = { types: new Set(), tags: new Set(), resources: new Set() };
  scanBundleTaxonomy(bundlePath, bundlePath, workspaceRoot, taxonomy);
  
  // Scan for undocumented files (the frontier)
  const frontier = scanWorkspace(workspaceRoot, workspaceRoot, taxonomy.resources);
  
  console.log(JSON.stringify({
    success: true,
    bundlePath,
    types: Array.from(taxonomy.types),
    tags: Array.from(taxonomy.tags),
    frontier: frontier
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { scanBundleTaxonomy, scanWorkspace };
