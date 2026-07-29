const fs = require('fs');
const path = require('path');

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
      fm[key] = val.startsWith('[') ? val.slice(1, -1).split(',').map(t => t.trim()) : [val];
    } else {
      fm[key] = val;
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
      if (c.frontmatter.resource) {
        const resPath = resolveResourceLocalPath(c.frontmatter.resource, workspaceRoot);
        if (resPath) {
          const normalizedRes = path.normalize(resPath);
          // Match if it's the exact same file, or if the resource is a parent folder of the target file
          if (normalizedTarget === normalizedRes || normalizedTarget.startsWith(normalizedRes + path.sep)) {
            matched.push(c);
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
    console.log(`----------------------------------------`);
    console.log(c.body.trim());
    console.log(`\n========================================\n`);
  }
}

if (require.main === module) {
  main();
}
