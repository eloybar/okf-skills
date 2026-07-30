const fs = require('fs');
const path = require('path');

/**
 * Parses frontmatter YAML block to extract key-value pairs.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  
  const fmText = match[1];
  const fm = {};
  const lines = fmText.split(/\r?\n/);
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    let val = line.slice(colonIndex + 1).trim();

    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    if (key === 'tags') {
      if (val.startsWith('[') && val.endsWith(']')) {
        fm[key] = val.slice(1, -1).split(',').map(t => t.trim().replace(/^['"]|['"]$/g, ''));
      } else {
        fm[key] = [val];
      }
    } else {
      fm[key] = val;
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
          if (fm.resource) {
            const resolved = resolveResourceLocalPath(fm.resource, workspaceRoot);
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
 * Recursively scans the workspace to find files that do not have associated concepts.
 */
function scanWorkspace(dir, workspaceRoot, documentedResources, results = []) {
  if (!fs.existsSync(dir)) return results;
  
  const files = fs.readdirSync(dir);
  const ignores = ['.git', 'node_modules', '.agents', '.claude', 'agent', 'docs', 'tmp'];
  
  for (const file of files) {
    if (ignores.includes(file)) continue;
    
    const fullPath = path.join(dir, file);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch (e) {
      continue;
    }
    
    if (stat.isDirectory()) {
      scanWorkspace(fullPath, workspaceRoot, documentedResources, results);
    } else if (stat.isFile()) {
      const normalized = path.normalize(fullPath);
      if (!documentedResources.has(normalized)) {
        const relPath = path.relative(workspaceRoot, normalized).replace(/\\/g, '/');
        
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
