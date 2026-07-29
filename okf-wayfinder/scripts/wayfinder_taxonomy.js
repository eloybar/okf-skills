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

/**
 * Recursively scans files in directory to collect OKF metadata.
 */
function scanBundleTaxonomy(dir, bundleRoot, taxonomy = { types: new Set(), tags: new Set() }) {
  if (!fs.existsSync(dir)) return taxonomy;
  
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      scanBundleTaxonomy(fullPath, bundleRoot, taxonomy);
    } else if (stat.isFile() && file.endsWith('.md')) {
      const lower = file.toLowerCase();
      if (lower === 'index.md' || lower === 'log.md') continue;
      
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const fm = parseFrontmatter(content);
        if (fm && fm.type) {
          taxonomy.types.add(fm.type);
          if (Array.isArray(fm.tags)) {
            fm.tags.forEach(t => taxonomy.tags.add(t));
          }
        }
      } catch (err) {
        // Fail silently for individual read errors
      }
    }
  }
  return taxonomy;
}

function main() {
  // Check common bundle roots: ./docs/okf or ./okf
  let bundlePath = path.resolve(process.cwd(), 'docs/okf');
  if (!fs.existsSync(bundlePath)) {
    bundlePath = path.resolve(process.cwd(), 'okf');
  }

  if (!fs.existsSync(bundlePath)) {
    console.error(JSON.stringify({ error: `OKF bundle root not found in ${process.cwd()}` }));
    process.exit(1);
  }
  
  const taxonomy = scanBundleTaxonomy(bundlePath, bundlePath);
  
  console.log(JSON.stringify({
    success: true,
    bundlePath,
    types: Array.from(taxonomy.types),
    tags: Array.from(taxonomy.tags)
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { scanBundleTaxonomy };
