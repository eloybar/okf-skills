const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const assert = require('assert').strict;

const rootDir = path.resolve(__dirname, '..');
const courseDir = path.join(rootDir, 'docs', 'course');
const sandboxDir = path.join(courseDir, 'sandbox');

console.log('Running OKF Course & Sandbox verification tests...');

// 1. Verify sandbox bundle fixtures exist
const requiredSandboxFiles = [
  'okf/index.md',
  'okf/log.md',
  'okf/concepts/legacy-payment-service.md',
  'okf/concepts/expired-auth-flow.md',
  'okf/concepts/revenue-mrr-metric.md',
  'src/payments.js',
  'src/invoice-tax-engine.js'
];

for (const rel of requiredSandboxFiles) {
  const full = path.join(sandboxDir, rel);
  assert.ok(fs.existsSync(full), `Missing sandbox fixture: ${rel}`);
}

// 2. Verify okf-query works against sandbox Attested Computation and file resource
const queryScript = path.join(rootDir, 'okf-query', 'scripts', 'query.js');
const queryOut = execSync(
  `node "${queryScript}" --search "MRR"`,
  { cwd: sandboxDir }
).toString();
assert.ok(queryOut.includes('Monthly Recurring Revenue (MRR)'), 'Sandbox query should return MRR Attested Computation');
assert.ok(queryOut.includes('human-reviewed'), 'MRR concept in sandbox should have human-reviewed trust tier');

const fileQueryOut = execSync(
  `node "${queryScript}" --file "src/payments.js"`,
  { cwd: sandboxDir }
).toString();
assert.ok(fileQueryOut.includes('Legacy Payment Service'), 'Sandbox file query should match src/payments.js');

// 3. Verify wayfinder_taxonomy.js detects src/invoice-tax-engine.js in frontier
const taxonomyScript = path.join(rootDir, 'okf-wayfinder', 'scripts', 'wayfinder_taxonomy.js');
const taxOut = JSON.parse(execSync(`node "${taxonomyScript}"`, { cwd: sandboxDir }).toString());
assert.ok(taxOut.frontier.some(f => f.path === 'src/invoice-tax-engine.js'), 'Wayfinder taxonomy should detect undocumented src/invoice-tax-engine.js');

// 4. Verify okf-prune --dry-run detects expired-auth-flow.md without deleting it
const pruneScript = path.join(rootDir, 'okf-prune', 'scripts', 'prune.js');
const pruneRes = spawnSync(
  'node',
  [pruneScript, '--dry-run', '--json'],
  { cwd: sandboxDir, encoding: 'utf8' }
);
const pruneJson = JSON.parse(pruneRes.stdout);
assert.ok(pruneJson.candidates.some(c => c.relPath.includes('expired-auth-flow.md')), 'Prune dry-run should detect expired-auth-flow.md');
assert.ok(fs.existsSync(path.join(sandboxDir, 'okf', 'concepts', 'expired-auth-flow.md')), 'Dry-run must not delete sandbox file');

console.log('✓ Sandbox fixtures and CLI lab targets verified.');

// 5. Verify Syllabus & All 7 Modules exist and contain key educational content
const allCourseModules = [
  {
    file: 'README.md',
    keywords: ['Syllabus', 'Module 1', 'Module 3', 'OKF v0.2', 'sandbox']
  },
  {
    file: '01-why-okf-and-codebase-amnesia.md',
    keywords: ['Readable', 'Parseable', 'Diffable', 'Portable', 'index.md', 'log.md', 'Hands-On Lab', 'Agent Tutor Prompt', 'Knowledge Check']
  },
  {
    file: '02-concept-anatomy-and-wayfinder.md',
    keywords: ['type', 'wayfinder_taxonomy.js', 'Not yet specified', 'Hands-On Lab', 'Agent Tutor Prompt', 'Knowledge Check']
  },
  {
    file: '03-okf-v02-trust-provenance-and-attestation.md',
    keywords: ['sources', 'generated', 'verified', 'machine-confirmed', 'human-reviewed', 'stale_after', 'Attested Computation', 'okf-upgrade', 'Hands-On Lab', 'Agent Tutor Prompt', 'Knowledge Check']
  },
  {
    file: '04-steering-gates-and-context-injection.md',
    keywords: ['AGENTS.md', 'Pre-Work Grounding Gate', 'Grounding Citation', 'okf-query', 'OKF CONTEXT BLOCK', 'Hands-On Lab', 'Agent Tutor Prompt', 'Knowledge Check']
  },
  {
    file: '05-autonomous-upkeep-drift-and-visualization.md',
    keywords: ['Pre-Completion Verification Gate', 'okf-maintain', 'okf-lint', '--drift', 'okf-visualize', 'viz.html', 'Hands-On Lab', 'Agent Tutor Prompt', 'Knowledge Check']
  },
  {
    file: '06-pruning-hygiene-and-ci-gates.md',
    keywords: ['okf-prune', '--dry-run', 'archive', 'GitHub Actions', 'okf-test.yml', 'Hands-On Lab', 'Agent Tutor Prompt', 'Knowledge Check']
  },
  {
    file: '07-capstone-self-documenting-repo.md',
    keywords: ['Greenfield', 'Brownfield', 'Governance', 'human-reviewed', 'Capstone', 'Agent Tutor Prompt', 'Knowledge Check']
  }
];

for (const mod of allCourseModules) {
  const fullPath = path.join(courseDir, mod.file);
  assert.ok(fs.existsSync(fullPath), `Missing course file: docs/course/${mod.file}`);
  const content = fs.readFileSync(fullPath, 'utf8');
  for (const kw of mod.keywords) {
    assert.ok(content.includes(kw), `Course file docs/course/${mod.file} missing required topic: "${kw}"`);
  }
}

console.log('✓ Course Syllabus and all 7 Markdown Modules verified.');
