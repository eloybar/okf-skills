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
  return { frontmatter: fm, body };
}

function extractLinks(body, docDir, bundleRoot) {
  // Strip fenced code blocks and inline backticked code
  const stripped = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\r\n]+`/g, '');

  const linkRe = /\]\(([^)\s]+\.md)(?:#[A-Za-z0-9_\-]*)?\)/g;
  const out = [];
  const seen = new Set();
  const bundleRootResolved = path.resolve(bundleRoot);

  let match;
  while ((match = linkRe.exec(stripped)) !== null) {
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
    "Reference": "#10b981",
    "Attested Computation": "#f59e0b"
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
        size: size,
        status: c.status,
        stale_after: c.stale_after,
        verified: c.verified,
        generated: c.generated,
        sources: c.sources
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

    let sources = frontmatter.sources || [];
    if (!Array.isArray(sources)) {
      sources = [sources];
    }

    const links = extractLinks(body || '', path.dirname(mdPath), bundleRoot);
    for (const src of sources) {
      if (src && src.resource && (src.resource.startsWith('/') || src.resource.startsWith('./') || src.resource.startsWith('../'))) {
        let cleanTarget = src.resource;
        if (cleanTarget.startsWith('/')) {
          cleanTarget = cleanTarget.slice(1);
        } else {
          try {
            const docDir = path.dirname(mdPath);
            const resolved = path.resolve(docDir, cleanTarget);
            cleanTarget = path.relative(bundleRoot, resolved);
          } catch(e) {}
        }
        let rel = cleanTarget.split(path.sep).join('/');
        if (rel.endsWith('.md')) {
          rel = rel.slice(0, -3);
        }
        if (rel && !links.includes(rel)) {
          links.push(rel);
        }
      }
    }

    concepts.push({
      id: conceptId,
      type: String(frontmatter.type || 'Unknown'),
      title: String(frontmatter.title || conceptId),
      description: String(frontmatter.description || ''),
      resource: String(frontmatter.resource || ''),
      tags: tags.map(String),
      body: body || '',
      links_to: links,
      status: frontmatter.status || 'stable',
      stale_after: frontmatter.stale_after || '',
      verified: frontmatter.verified || [],
      generated: frontmatter.generated || {},
      sources: sources
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
