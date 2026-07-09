const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--bundle' && process.argv[i + 1]) {
      args.bundle = path.resolve(process.argv[i + 1]);
      i++;
    } else if (process.argv[i] === '--out' && process.argv[i + 1]) {
      args.out = path.resolve(process.argv[i + 1]);
      i++;
    }
  }
  return args;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const fmText = match[1];
  const body = content.slice(match[0].length).trim();
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
  return { frontmatter: fm, body };
}

function extractLinks(body, docDir, bundleRoot) {
  const linkRe = /\]\(([^)\s]+\.md)(?:#[A-Za-z0-9_\-]*)?\)/g;
  const out = [];
  const seen = new Set();
  const bundleRootResolved = path.resolve(bundleRoot);

  let match;
  while ((match = linkRe.exec(body)) !== null) {
    const target = match[1];
    if (target.includes('://')) {
      continue;
    }
    try {
      let resolvedPath;
      if (target.startsWith('/')) {
        resolvedPath = path.join(bundleRootResolved, target);
      } else {
        resolvedPath = path.resolve(docDir, target);
      }
      const relative = path.relative(bundleRootResolved, resolvedPath);
      let rel = relative.split(path.sep).join('/');
      if (rel.endsWith('.md')) {
        rel = rel.slice(0, -3);
      }
      if (rel && !seen.has(rel)) {
        seen.add(rel);
        out.push(rel);
      }
    } catch (e) {
      // Ignore resolving errors
    }
  }
  return out;
}

function walkConcepts(dir, bundleRoot, list = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkConcepts(fullPath, bundleRoot, list);
    } else if (stat.isFile() && file.endsWith('.md')) {
      const lowerFile = file.toLowerCase();
      if (lowerFile === 'index.md' || lowerFile === 'log.md') {
        continue;
      }
      list.push(fullPath);
    }
  }
  return list;
}

function buildGraph(concepts) {
  const ids = new Set(concepts.map(c => c.id));
  const TYPE_PALETTE = {
    "BigQuery Dataset": "#8b5cf6",
    "BigQuery Table": "#3b82f6",
    "Reference": "#10b981"
  };
  const DEFAULT_NODE_COLOR = "#94a3b8";

  const nodes = concepts.map(c => {
    const color = TYPE_PALETTE[c.type] || DEFAULT_NODE_COLOR;
    const size = 30 + Math.min(60, Math.floor(c.body.length / 200));
    return {
      data: {
        id: c.id,
        label: c.title || c.id,
        type: c.type,
        description: c.description,
        resource: c.resource,
        tags: c.tags,
        color: color,
        size: size
      }
    };
  });

  const edges = [];
  const seenEdges = new Set();

  for (const c of concepts) {
    for (const target of c.links_to) {
      if (target === c.id || !ids.has(target)) {
        continue;
      }
      const key = `${c.id}__${target}`;
      if (seenEdges.has(key)) {
        continue;
      }
      seenEdges.add(key);
      edges.push({
        data: {
          id: `${c.id}__${target}`,
          source: c.id,
          target: target
        }
      });
    }
  }

  const bodies = {};
  for (const c of concepts) {
    bodies[c.id] = c.body;
  }

  const types = Array.from(new Set(concepts.map(c => c.type))).sort();

  return {
    nodes,
    edges,
    bodies,
    types,
    palette: TYPE_PALETTE
  };
}

function main() {
  const args = parseArgs();
  if (!args.bundle) {
    console.error('Error: Missing required argument --bundle');
    process.exit(1);
  }
  
  const bundleRoot = args.bundle;
  const outPath = args.out || path.join(bundleRoot, 'viz.html');

  if (!fs.existsSync(bundleRoot) || !fs.statSync(bundleRoot).isDirectory()) {
    console.error(`Error: Bundle directory not found: ${bundleRoot}`);
    process.exit(1);
  }

  const mdFiles = walkConcepts(bundleRoot, bundleRoot);
  const concepts = [];

  for (const mdPath of mdFiles) {
    const content = fs.readFileSync(mdPath, 'utf8');
    const relativePath = path.relative(bundleRoot, mdPath);
    let conceptId = relativePath.split(path.sep).join('/');
    if (conceptId.endsWith('.md')) {
      conceptId = conceptId.slice(0, -3);
    }

    const { frontmatter, body } = parseFrontmatter(content);
    if (!frontmatter.type) {
      // Conformance check: OKF documents must contain a type field
      continue;
    }

    let tags = frontmatter.tags || [];
    if (!Array.isArray(tags)) {
      tags = [String(tags)];
    }

    concepts.push({
      id: conceptId,
      type: String(frontmatter.type || 'Unknown'),
      title: String(frontmatter.title || conceptId),
      description: String(frontmatter.description || ''),
      resource: String(frontmatter.resource || ''),
      tags: tags.map(String),
      body: body || '',
      links_to: extractLinks(body || '', path.dirname(mdPath), bundleRoot)
    });
  }

  const graph = buildGraph(concepts);
  const templateDir = path.dirname(__dirname);
  const templatePath = path.join(templateDir, 'templates', 'viz.html');
  const cssPath = path.join(templateDir, 'static', 'viz.css');
  const jsPath = path.join(templateDir, 'static', 'viz.js');

  const template = fs.readFileSync(templatePath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const name = path.basename(bundleRoot);

  const html = template
    .replace('/*__VIZ_CSS__*/', () => css)
    .replace('/*__VIZ_JS__*/', () => js)
    .replace('__BUNDLE_NAME__', () => JSON.stringify(name))
    .replace('__BUNDLE_DATA__', () => JSON.stringify(graph));

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');

  console.log(JSON.stringify({
    success: true,
    concepts: concepts.length,
    edges: graph.edges.length,
    bytes: Buffer.byteLength(html, 'utf8'),
    output: outPath
  }));
}

main();
