const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

function serializeFrontmatter(fm) {
  let lines = ['---'];
  for (const [key, value] of Object.entries(fm)) {
    if (key === 'generated' && typeof value === 'object' && value !== null) {
      lines.push('generated:');
      lines.push(`  by: ${value.by || 'human:unknown'}`);
      lines.push(`  at: ${value.at || new Date().toISOString()}`);
    } else if (key === 'verified') {
      if (Array.isArray(value)) {
        lines.push('verified:');
        value.forEach(v => {
          lines.push(`  - by: ${v.by}`);
          lines.push(`    at: ${v.at}`);
        });
      } else if (typeof value === 'object' && value !== null) {
        lines.push('verified:');
        lines.push(`  by: ${value.by}`);
        lines.push(`  at: ${value.at}`);
      }
    } else if (key === 'sources' && Array.isArray(value)) {
      lines.push('sources:');
      value.forEach(src => {
        lines.push(`  - id: ${src.id}`);
        lines.push(`    resource: ${src.resource}`);
        if (src.title) lines.push(`    title: "${src.title.replace(/"/g, '\\"')}"`);
        if (src.author) lines.push(`    author: ${src.author}`);
        if (src.usage_count) lines.push(`    usage_count: ${src.usage_count}`);
        if (src.last_modified) lines.push(`    last_modified: ${src.last_modified}`);
      });
    } else if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(', ')}]`);
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value)) {
        lines.push(`  ${k}: ${v}`);
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function walkConcepts(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkConcepts(fullPath, list);
    } else if (stat.isFile() && file.endsWith('.md')) {
      const lower = file.toLowerCase();
      if (lower === 'log.md') continue;
      list.push(fullPath);
    }
  }
  return list;
}

function getConceptBody(content) {
  return content.replace(/^---[\s\S]*?---\r?\n/, '');
}

function autoFixBareLinks(body, bundleRoot, currentFilePath) {
  // Split body by code blocks (```...```) to avoid modifying code blocks
  const parts = body.split(/(```[\s\S]*?```)/g);
  let modified = false;

  for (let i = 0; i < parts.length; i++) {
    // If the part is a code block, skip it
    if (parts[i].startsWith('```')) {
      continue;
    }

    // Replace links in non-code parts
    parts[i] = parts[i].replace(/\[([^\]]*)\]\(([^)\s]+\.md)(#[A-Za-z0-9_\-]*)?\)/g, (match, label, target, hash) => {
      const labelLower = label.trim().toLowerCase();
      const targetName = path.basename(target).toLowerCase();
      const isBare = !label.trim() ||
                     labelLower === targetName ||
                     labelLower === target.toLowerCase() ||
                     labelLower.endsWith('.md') ||
                     labelLower.startsWith('/') ||
                     /^https?:\/\//i.test(label);
      
      if (isBare) {
        let targetPath;
        if (target.startsWith('/')) {
          targetPath = path.join(bundleRoot, target.slice(1));
        } else {
          targetPath = path.join(path.dirname(currentFilePath), target);
        }

        if (fs.existsSync(targetPath)) {
          try {
            const targetContent = fs.readFileSync(targetPath, 'utf8');
            const targetFm = parseFrontmatter(targetContent);
            if (targetFm && targetFm.title) {
              modified = true;
              const cleanHash = hash || '';
              console.log(`[+] ${path.basename(currentFilePath)}: Auto-fixed bare link [${label}](${target}${cleanHash}) -> [${targetFm.title}](${target}${cleanHash})`);
              return `[${targetFm.title}](${target}${cleanHash})`;
            }
          } catch (e) {
            // Ignore errors reading target file
          }
        }
      }
      return match;
    });
  }

  return { newBody: parts.join(''), modified };
}

function main() {
  const args = process.argv.slice(2);
  let user = process.env.USER || process.env.USERNAME || 'unknown';
  const userIdx = args.indexOf('--user');
  if (userIdx !== -1 && args[userIdx + 1]) {
    user = args[userIdx + 1];
  }

  const workspaceRoot = process.cwd();
  let bundleRoot = path.join(workspaceRoot, 'docs', 'okf');
  if (!fs.existsSync(bundleRoot)) {
    bundleRoot = path.join(workspaceRoot, 'okf');
  }

  if (!fs.existsSync(bundleRoot)) {
    console.error(`Error: OKF bundle root not found.`);
    process.exit(1);
  }

  console.log(`Starting OKF upgrade to Version 0.2 in: ${bundleRoot}`);
  console.log(`Target User Actor: human:${user}`);
  console.log(`----------------------------------------`);

  const mdFiles = walkConcepts(bundleRoot);
  let conceptsUpgraded = 0;
  let indexUpgraded = false;

  for (const mdPath of mdFiles) {
    const relativePath = path.relative(bundleRoot, mdPath).replace(/\\/g, '/');
    const content = fs.readFileSync(mdPath, 'utf8');
    const fm = parseFrontmatter(content);
    let body = getConceptBody(content);

    // Special Case: Root index.md (or index.md files)
    if (path.basename(mdPath).toLowerCase() === 'index.md') {
      const isRootIndex = path.resolve(mdPath) === path.resolve(path.join(bundleRoot, 'index.md'));
      if (isRootIndex) {
        const rootFm = fm || {};
        if (rootFm.okf_version !== '0.2') {
          rootFm.okf_version = '0.2';
          const newFmText = serializeFrontmatter(rootFm);
          fs.writeFileSync(mdPath, newFmText + '\n\n' + body.trim() + '\n', 'utf8');
          console.log(`[+] Upgraded root index.md with okf_version: "0.2"`);
          indexUpgraded = true;
        }
      }
      continue;
    }

    if (!fm) {
      console.warn(`[!] Skipping ${relativePath}: no frontmatter found.`);
      continue;
    }

    let modified = false;

    // 1. Upgrade timestamp -> generated
    if (fm.timestamp && !fm.generated) {
      fm.generated = {
        by: `human:${user}`,
        at: fm.timestamp
      };
      delete fm.timestamp;
      modified = true;
      console.log(`[+] ${relativePath}: Converted timestamp to generated.at`);
    }

    // 2. Upgrade body Citations -> frontmatter sources
    const citationsRegex = /(?:^|\r?\n)(#+\s*Citations\s*\r?\n)([\s\S]*?)(?=\r?\n#+|$)/i;
    const citationsMatch = body.match(citationsRegex);
    if (citationsMatch) {
      const citationsText = citationsMatch[2];
      const lines = citationsText.split(/\r?\n/);
      let sources = fm.sources || [];
      if (!Array.isArray(sources)) {
        sources = sources ? [sources] : [];
      }

      let sourceCount = sources.length;
      let matchedAnyCitations = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Match markdown link: - [Title](URL) or * [Title](URL)
        const linkMatch = trimmed.match(/^[\-\*]\s*\[([^\]]+)\]\(([^)]+)\)/);
        // Match raw URL/text: - URL or * URL
        const rawMatch = trimmed.match(/^[\-\*]\s*([^\s]+)/);

        if (linkMatch) {
          sourceCount++;
          sources.push({
            id: `src-${sourceCount}`,
            resource: linkMatch[2].trim(),
            title: linkMatch[1].trim()
          });
          matchedAnyCitations = true;
        } else if (rawMatch) {
          sourceCount++;
          sources.push({
            id: `src-${sourceCount}`,
            resource: rawMatch[1].trim(),
            title: undefined
          });
          matchedAnyCitations = true;
        }
      }

      if (matchedAnyCitations) {
        fm.sources = sources;
        // Strip the Citations section from the body
        body = body.replace(citationsRegex, '').trim();
        modified = true;
        console.log(`[+] ${relativePath}: Migrated citations list to frontmatter sources`);
      }
    }

    // 3. Auto-fix bare links in body
    const fixResult = autoFixBareLinks(body, bundleRoot, mdPath);
    if (fixResult.modified) {
      body = fixResult.newBody;
      modified = true;
    }

    if (modified) {
      const newFmText = serializeFrontmatter(fm);
      fs.writeFileSync(mdPath, newFmText + '\n\n' + body.trim() + '\n', 'utf8');
      conceptsUpgraded++;
    }
  }

  console.log(`----------------------------------------`);
  console.log(`Upgrade complete!`);
  console.log(`Concepts modified: ${conceptsUpgraded}`);
  console.log(`Root index updated: ${indexUpgraded ? 'Yes' : 'No'}`);
  console.log(`----------------------------------------`);

  // Run lint check post-upgrade
  const linterScript = path.join(__dirname, '../../okf-lint/scripts/lint.js');
  if (fs.existsSync(linterScript)) {
    console.log(`Running lint verification post-upgrade...`);
    try {
      execSync(`node "${linterScript}"`, { stdio: 'inherit' });
    } catch (e) {
      console.error(`Post-upgrade lint check failed. Please resolve errors manually.`);
    }
  }
}

if (require.main === module) {
  main();
}
