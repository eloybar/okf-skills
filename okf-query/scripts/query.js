const fs = require('fs');
const path = require('path');

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
        if (colonIdx !== -1) {
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

function resolveResourceLocalPath(resourceUri, workspaceRoot) {
  if (!resourceUri) return null;
  let localPath = resourceUri.replace(/^file:\/\/\/?/, '');
  if (path.isAbsolute(localPath)) {
    return path.normalize(localPath);
  }
  return path.normalize(path.join(workspaceRoot, localPath));
}

function scanConcepts(dir, bundleRoot, workspaceRoot, matches = []) {
  if (!fs.existsSync(dir)) return matches;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
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

function main() {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('--file');
  const searchIndex = args.indexOf('--search');

  if (fileIndex === -1 && searchIndex === -1) {
    console.error('Usage: node okf-query/scripts/query.js --file <path> OR --search <keyword>');
    process.exit(1);
  }

  const workspaceRoot = process.cwd();
  let bundleRoot = path.join(workspaceRoot, 'docs', 'okf');
  if (!fs.existsSync(bundleRoot)) {
    bundleRoot = path.join(workspaceRoot, 'okf');
  }

  if (!fs.existsSync(bundleRoot)) {
    console.error(`Error: OKF bundle not found.`);
    process.exit(1);
  }

  const allConcepts = scanConcepts(bundleRoot, bundleRoot, workspaceRoot);
  const matched = [];

  if (fileIndex !== -1) {
    const targetFile = path.resolve(workspaceRoot, args[fileIndex + 1]);
    const normalizedTarget = path.normalize(targetFile);

    for (const c of allConcepts) {
      const resourceUris = [];
      if (c.frontmatter.resource) {
        resourceUris.push(c.frontmatter.resource);
      }
      if (Array.isArray(c.frontmatter.sources)) {
        for (const src of c.frontmatter.sources) {
          if (src.resource) {
            resourceUris.push(src.resource);
          }
        }
      }

      for (const uri of resourceUris) {
        const resPath = resolveResourceLocalPath(uri, workspaceRoot);
        if (resPath) {
          const normalizedRes = path.normalize(resPath);
          // Match if it's the exact same file, or if the resource is a parent folder of the target file
          if (normalizedTarget === normalizedRes || normalizedTarget.startsWith(normalizedRes + path.sep)) {
            matched.push(c);
            break;
          }
        }
      }
    }
  } else if (searchIndex !== -1) {
    const keyword = args[searchIndex + 1].toLowerCase();
    for (const c of allConcepts) {
      const title = (c.frontmatter.title || '').toLowerCase();
      const desc = (c.frontmatter.description || '').toLowerCase();
      const type = (c.frontmatter.type || '').toLowerCase();
      const tags = (c.frontmatter.tags || []).map(t => t.toLowerCase());
      const body = c.body.toLowerCase();

      if (
        title.includes(keyword) ||
        desc.includes(keyword) ||
        type.includes(keyword) ||
        tags.some(t => t.includes(keyword)) ||
        body.includes(keyword)
      ) {
        matched.push(c);
      }
    }
  }

  if (matched.length === 0) {
    console.log('No matching OKF concepts found.');
    return;
  }

  // Format and output matched concepts
  console.log(`=== OKF CONTEXT BLOCK (${matched.length} concept(s) found) ===\n`);
  for (const c of matched) {
    console.log(`[Concept: ${c.frontmatter.title || c.relativePath}]`);
    console.log(`Type:        ${c.frontmatter.type}`);
    if (c.frontmatter.description) console.log(`Description: ${c.frontmatter.description}`);
    if (c.frontmatter.resource)    console.log(`Resource:    ${c.frontmatter.resource}`);
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
    console.log(c.body.trim());
    console.log(`\n========================================\n`);
  }
}

if (require.main === module) {
  main();
}
