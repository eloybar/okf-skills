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
  visualize: path.resolve(__dirname, '../okf-visualize/scripts/visualize.js'),
  upgrade: path.resolve(__dirname, '../okf-upgrade/scripts/upgrade.js')
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

  // === STEP 9: TEST OKF v0.2 FEATURES ===
  console.log('Step 9: Testing OKF v0.2 specification ingestion...');

  // 9a. Create v2 mock code file
  const mockV2CodeFile = path.join(tempDir, 'src', 'v2_code.js');
  fs.writeFileSync(mockV2CodeFile, 'console.log("v2 code");');

  // 9b. Create v2 concept using generated.at and sources
  const v2ConceptFile = path.join(bundleRoot, 'concepts', 'v2_concept.md');
  const v2InitISO = new Date(Date.now() - 50000).toISOString(); // 50 seconds ago
  fs.writeFileSync(v2ConceptFile, `---
type: Concept
title: V2 User Authentication
description: V2 authentication logic using sources.
status: stable
stale_after: 2030-01-01
resource: file:///${mockV2CodeFile.replace(/\\/g, '/')}
generated:
  by: human:bob
  at: ${v2InitISO}
sources:
  - id: v2code
    resource: file:///${mockV2CodeFile.replace(/\\/g, '/')}
    title: V2 Code Source
    author: human:bob
---

V2 authentication description.
`);

  // Commit these
  execSync('git add . && git commit -m "feat: add v2 auth concept and code"', { cwd: tempDir, stdio: 'ignore' });

  // 9c. Verify okf-query resolves via sources resource list
  const queryV2Result = execSync(`node "${scripts.query}" --file "src/v2_code.js"`, { cwd: tempDir }).toString();
  assert.ok(queryV2Result.includes('V2 User Authentication'), 'Query script should match concept via source resource path');
  console.log('✓ Query successfully resolved concept via sources.resource.');

  // 9d. Modify v2 code to trigger drift comparing against generated.at
  execSync('node -e "setTimeout(() => {}, 1000)"');
  fs.writeFileSync(mockV2CodeFile, 'console.log("v2 code updated");');
  execSync('git add . && git commit -m "fix: update v2 code"', { cwd: tempDir, stdio: 'ignore' });

  const lintV2Output = execSync(`node "${scripts.lint}" --drift`, { cwd: tempDir }).toString();
  assert.ok(lintV2Output.includes('Warning: Concept drift detected'), 'Linter should detect drift using generated.at fallback');
  console.log('✓ Linter successfully detected drift using generated.at.');

  // 9e. Create Attested Computation concept and verify dependency validation
  const attestedConceptFile = path.join(bundleRoot, 'concepts', 'attested.md');
  fs.writeFileSync(attestedConceptFile, `---
type: Attested Computation
title: Sanctioned Calculation
runtime: bigquery
computation: file:///src/attested_comp.sql
executor:
  resource: file:///src/run-executor.js
  receipt: [job_id]
attester:
  resource: file:///src/run-attester.js
---
`);

  // Running the linter now should throw errors because the referenced script files do not exist
  try {
    execSync(`node "${scripts.lint}"`, { cwd: tempDir, stdio: 'pipe' });
    assert.fail('Linter should have failed due to missing Attested Computation resource files');
  } catch (e) {
    if (e.name === 'AssertionError') throw e;
    const stdoutStr = e.stdout ? e.stdout.toString() : '';
    const stderrStr = e.stderr ? e.stderr.toString() : '';
    const errOutput = stdoutStr + stderrStr;
    assert.ok(errOutput.includes('Error: Attested Computation'), 'Should report missing Attested Computation dependencies');
    console.log('✓ Linter successfully caught missing Attested Computation script dependencies.');
  }

  // Write mock dependency files so the linter succeeds
  fs.writeFileSync(path.join(tempDir, 'src', 'attested_comp.sql'), 'SELECT 1;');
  fs.writeFileSync(path.join(tempDir, 'src', 'run-executor.js'), 'console.log("exec");');
  fs.writeFileSync(path.join(tempDir, 'src', 'run-attester.js'), 'console.log("attest");');

  // Verify linter now succeeds
  const lintV2SuccessOutput = execSync(`node "${scripts.lint}"`, { cwd: tempDir }).toString();
  assert.ok(lintV2SuccessOutput.includes('OKF Linting Passed Successfully!'), 'Linter should pass once Attested Computation dependencies exist');
  console.log('✓ Linter successfully passed with resolved Attested Computation dependencies.');

  // Run visualization generation once more with v0.2 concepts
  execSync(`node "${scripts.visualize}" --bundle "${bundleRoot}"`, { cwd: tempDir });
  assert.ok(fs.existsSync(path.join(bundleRoot, 'viz.html')), 'viz.html should be successfully created');
  console.log('✓ Visualizer successfully executed with v0.2 concepts.');

  // === STEP 10: TEST OKF UPGRADE AUTO-FIX BARE LINKS ===
  console.log('Step 10: Testing OKF Upgrade auto-fixing of bare link labels...');

  // 10a. Create target concept with a title
  const targetConceptFile = path.join(bundleRoot, 'concepts', 'target_for_link.md');
  fs.writeFileSync(targetConceptFile, `---
type: Concept
title: Target Concept Display Title
description: A concept that other concepts link to.
timestamp: 2026-08-03T23:18:00Z
---

Body of target.
`);

  // 10b. Create a source concept with bare links in the body
  const sourceConceptFile = path.join(bundleRoot, 'concepts', 'source_with_links.md');
  fs.writeFileSync(sourceConceptFile, `---
type: Concept
title: Source Concept
description: A concept containing bare links.
timestamp: 2026-08-03T23:18:00Z
---

Here is a bare link to [target_for_link.md](/concepts/target_for_link.md) and a relative one [target_for_link.md](target_for_link.md).
And one inside a code block which should NOT be touched:
\`\`\`markdown
[target_for_link.md](/concepts/target_for_link.md)
\`\`\`
`);

  // 10c. Run okf-upgrade on the temp directory
  execSync(`node "${scripts.upgrade}"`, { cwd: tempDir, stdio: 'ignore' });

  // 10d. Verify the links were correctly updated
  const upgradedContent = fs.readFileSync(sourceConceptFile, 'utf8');
  assert.ok(upgradedContent.includes('[Target Concept Display Title](/concepts/target_for_link.md)'), 'Upgrade should fix bare absolute link');
  assert.ok(upgradedContent.includes('[Target Concept Display Title](target_for_link.md)'), 'Upgrade should fix bare relative link');
  assert.ok(upgradedContent.includes('\n[target_for_link.md](/concepts/target_for_link.md)\n'), 'Upgrade should NOT modify links inside code blocks');
  console.log('✓ Upgrade successfully auto-resolved bare link labels and skipped code blocks.');

  console.log('\n======================================');
  console.log('🎉 ALL LIFE CYCLE TEST CASES PASSED SUCCESSFULLY!');
  console.log('======================================');

} finally {
  // Cleanup temp files
  fs.rmSync(tempDir, { recursive: true, force: true });
}
