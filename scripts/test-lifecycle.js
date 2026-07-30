const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const assert = require('assert').strict;

// 1. Setup temporary sandbox
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-lifecycle-test-'));
console.log(`Setting up sandbox workspace: ${tempDir}`);

// Copy scripts to sandbox
const scripts = {
  taxonomy: path.resolve(__dirname, '../okf-wayfinder/scripts/wayfinder_taxonomy.js'),
  lint: path.resolve(__dirname, '../okf-lint/scripts/lint.js'),
  query: path.resolve(__dirname, '../okf-query/scripts/query.js'),
  visualize: path.resolve(__dirname, '../okf-visualize/scripts/visualize.js')
};

// Initialize Git inside the sandbox (needed for drift checks)
execSync('git init', { cwd: tempDir, stdio: 'ignore' });
execSync('git config user.name "Test Bot"', { cwd: tempDir, stdio: 'ignore' });
execSync('git config user.email "bot@test.com"', { cwd: tempDir, stdio: 'ignore' });

try {
  // === STEP 1: INITIALIZE BUNDLE ===
  console.log('Step 1: Initializing OKF bundle...');
  const bundleRoot = path.join(tempDir, 'docs', 'okf');
  fs.mkdirSync(bundleRoot, { recursive: true });
  fs.mkdirSync(path.join(bundleRoot, 'concepts'), { recursive: true });
  fs.writeFileSync(path.join(bundleRoot, 'index.md'), '# Index\n\n## Concepts and Skills\n');
  fs.writeFileSync(path.join(bundleRoot, 'log.md'), '# Change Log\n\nNewest changes recorded chronologically.\n');
  
  // Commit the initial bundle so git history has a base
  execSync('git add . && git commit -m "chore: bootstrap OKF"', { cwd: tempDir, stdio: 'ignore' });

  // === STEP 2: SCENARIO: CREATE UNDOCUMENTED CODE ===
  console.log('Step 2: Adding new code file and checking frontier...');
  const mockCodeFile = path.join(tempDir, 'src', 'auth.js');
  fs.mkdirSync(path.dirname(mockCodeFile), { recursive: true });
  fs.writeFileSync(mockCodeFile, 'function login() { return true; }');

  // Run taxonomy script to detect frontier
  const taxOutput = JSON.parse(execSync(`node "${scripts.taxonomy}"`, { cwd: tempDir }).toString());
  assert.ok(taxOutput.frontier.some(f => f.path === 'src/auth.js'), 'Frontier should detect src/auth.js as undocumented');
  console.log('✓ Frontier correctly detected the undocumented file.');

  // === STEP 3: CREATE CONCEPT MAP ===
  console.log('Step 3: Documenting the new concept...');
  const conceptFile = path.join(bundleRoot, 'concepts', 'auth.md');
  const nowISO = new Date().toISOString();
  fs.writeFileSync(conceptFile, `---
type: Concept
title: User Authentication
description: Core user authentication logic.
resource: file:///${mockCodeFile.replace(/\\/g, '/')}
tags: [security, auth]
timestamp: ${nowISO}
---

Authentication uses JWT tokens...
`);
  // Commit both files
  execSync('git add . && git commit -m "feat: introduce authentication"', { cwd: tempDir, stdio: 'ignore' });

  // === STEP 4: RETRIEVE CONTEXT (QUERY) ===
  console.log('Step 4: Querying for concept context...');
  const queryResult = execSync(`node "${scripts.query}" --file "src/auth.js"`, { cwd: tempDir }).toString();
  assert.ok(queryResult.includes('User Authentication'), 'Query script should retrieve the auth concept file matching the resource path');
  console.log('✓ Context query retrieved correct matching concept.');

  // === STEP 5: MUTATE CODE (TRIGGER DRIFT) ===
  console.log('Step 5: Modifying resource code to trigger concept drift...');
  
  // Wait a moment and then update code to guarantee git timestamp difference
  execSync('node -e "setTimeout(() => {}, 1000)"');
  fs.writeFileSync(mockCodeFile, 'function login() { return false; } // Updated logic');
  execSync('git add . && git commit -m "fix: change login default"', { cwd: tempDir, stdio: 'ignore' });

  // Run lint --drift (should warn about drift)
  const lintOutput = execSync(`node "${scripts.lint}" --drift`, { cwd: tempDir }).toString();
  assert.ok(lintOutput.includes('Warning: Concept drift detected'), 'Linter should warn that src/auth.js is newer than concept timestamp');
  console.log('✓ Linter successfully detected concept-resource drift.');

  // === STEP 6: AUTO-UPKEEP (MAINTAIN) ===
  console.log('Step 6: Simulating upkeep (updating concept timestamp)...');
  const updatedISO = new Date().toISOString();
  const updatedContent = fs.readFileSync(conceptFile, 'utf8').replace(nowISO, updatedISO);
  fs.writeFileSync(conceptFile, updatedContent);

  // === STEP 7: LINT VERIFICATION ===
  console.log('Step 7: Verifying linter clears after upkeep...');
  const lintOutputAfter = execSync(`node "${scripts.lint}" --drift`, { cwd: tempDir }).toString();
  assert.ok(lintOutputAfter.includes('OKF Linting Passed Successfully!'), 'Linter should pass with 0 warnings after update');
  console.log('✓ Linter successfully passed after upkeep.');

  // === STEP 8: VISUALIZATION ===
  console.log('Step 8: Generating visualization...');
  execSync(`node "${scripts.visualize}" --bundle "${bundleRoot}"`, { cwd: tempDir });
  assert.ok(fs.existsSync(path.join(bundleRoot, 'viz.html')), 'viz.html should be created');
  console.log('✓ Visualization HTML generated successfully.');

  console.log('\n======================================');
  console.log('🎉 ALL LIFE CYCLE TEST CASES PASSED SUCCESSFULLY!');
  console.log('======================================');

} finally {
  // Cleanup temp files
  fs.rmSync(tempDir, { recursive: true, force: true });
}
