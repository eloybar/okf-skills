const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

function extractLinks(content) {
  // Strip fenced code blocks and inline backticked code
  const stripped = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\r\n]+`/g, '');

  const links = [];
  const linkRe = /\]\(([^)\s]+\.md)(?:#[A-Za-z0-9_\-]*)?\)/g;
  let match;
  while ((match = linkRe.exec(stripped)) !== null) {
    links.push(match[1]);
  }
  return links;
}

function getGitLastModifiedISO(filePath) {
  try {
    const cleanPath = filePath.replace(/\\/g, '/');
    const stdout = execSync(`git log -1 --format="%aI" -- "${cleanPath}"`, { stdio: ['pipe', 'pipe', 'ignore'] });
    return stdout.toString().trim();
  } catch (e) {
    return null;
  }
}

function resolveResourceLocalPath(resourceUri, workspaceRoot) {
  if (!resourceUri) return null;
  // Convert file:///D:/path/to/file to local D:/path/to/file
  let localPath = resourceUri.replace(/^file:\/\/\/?/, '');
  if (path.isAbsolute(localPath)) {
    return path.normalize(localPath);
  }
  // Otherwise try resolving relative to workspaceRoot
  return path.normalize(path.join(workspaceRoot, localPath));
}

function scanAndLint(dir, bundleRoot, workspaceRoot, checkDrift, results = { errors: [], warnings: [], filesChecked: 0 }) {
  if (!fs.existsSync(dir)) return results;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanAndLint(fullPath, bundleRoot, workspaceRoot, checkDrift, results);
    } else if (stat.isFile() && file.endsWith('.md')) {
      if (file === 'index.md' || file === 'log.md') continue;
      results.filesChecked++;
      const relativePath = path.relative(bundleRoot, fullPath).replace(/\\/g, '/');
      const content = fs.readFileSync(fullPath, 'utf8');
      const fm = parseFrontmatter(content);

      // 1. Conformance check
      if (!fm) {
        results.errors.push(`[${relativePath}] Error: Missing or unparseable YAML frontmatter block.`);
        continue;
      }
      if (!fm.type) {
        results.errors.push(`[${relativePath}] Error: YAML frontmatter missing 'type' key.`);
      }

      // 2. Link Integrity check
      const links = extractLinks(content);
      for (const link of links) {
        let targetPath;
        if (link.startsWith('/')) {
          targetPath = path.join(bundleRoot, link.slice(1));
        } else {
          targetPath = path.join(path.dirname(fullPath), link);
        }
        if (!fs.existsSync(targetPath)) {
          results.errors.push(`[${relativePath}] Error: Broken concept link to '${link}'. Target does not exist.`);
        }
      }

      // 3. Concept Drift check
      if (checkDrift && fm.resource && fm.timestamp) {
        const resolvedPath = resolveResourceLocalPath(fm.resource, workspaceRoot);
        if (resolvedPath && fs.existsSync(resolvedPath)) {
          const gitTimeStr = getGitLastModifiedISO(resolvedPath);
          if (gitTimeStr) {
            const gitTime = new Date(gitTimeStr);
            const conceptTime = new Date(fm.timestamp);
            if (gitTime > conceptTime) {
              results.warnings.push(`[${relativePath}] Warning: Concept drift detected. Resource file '${path.basename(resolvedPath)}' was modified on ${gitTime.toISOString()} but the concept's timestamp is ${conceptTime.toISOString()}. Run okf-maintain to sync.`);
            }
          }
        }
      }
    }
  }
  return results;
}

function main() {
  const args = process.argv.slice(2);
  const checkDrift = args.includes('--drift');
  
  const workspaceRoot = process.cwd();
  let bundleRoot = path.join(workspaceRoot, 'docs', 'okf');
  if (!fs.existsSync(bundleRoot)) {
    bundleRoot = path.join(workspaceRoot, 'okf');
  }

  if (!fs.existsSync(bundleRoot)) {
    console.error(`Error: OKF bundle not found in docs/okf or okf. Checked path: ${bundleRoot}`);
    process.exit(1);
  }

  console.log(`Starting OKF Linting in: ${bundleRoot}`);
  if (checkDrift) {
    console.log(`Git-based concept drift analysis enabled (--drift)`);
  }
  console.log(`----------------------------------------`);

  const results = scanAndLint(bundleRoot, bundleRoot, workspaceRoot, checkDrift);

  console.log(`Files checked: ${results.filesChecked}`);
  console.log(`Errors found:  ${results.errors.length}`);
  console.log(`Warnings:      ${results.warnings.length}`);
  console.log(`----------------------------------------`);

  if (results.warnings.length > 0) {
    console.log(`Warnings:`);
    results.warnings.forEach(w => console.log(`  ${w}`));
    console.log(`----------------------------------------`);
  }

  if (results.errors.length > 0) {
    console.log(`Errors (Build Failure):`);
    results.errors.forEach(e => console.error(`  ${e}`));
    console.log(`----------------------------------------`);
    process.exit(1);
  }

  console.log(`OKF Linting Passed Successfully! 🎉`);
}

if (require.main === module) {
  main();
}
