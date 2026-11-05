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
  maintain: path.resolve(__dirname, '../okf-maintain/scripts/maintain.js'),
  query: path.resolve(__dirname, '../okf-query/scripts/query.js'),
  visualize: path.resolve(__dirname, '../okf-visualize/scripts/visualize.js'),
  upgrade: path.resolve(__dirname, '../okf-upgrade/scripts/upgrade.js'),
  prune: path.resolve(__dirname, '../okf-prune/scripts/prune.js')
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
  const querySubsystemResult = execSync(`node "${scripts.query}" --file "src/auth_helper.js"`, { cwd: tempDir }).toString();
  assert.ok(querySubsystemResult.includes('User Authentication'), 'Query script should match concept via enclosing directory');
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
  console.log('Step 6: Testing okf-maintain CLI script...');
  
  // 6a. Check mode detects drift
  try {
    execSync(`node "${scripts.maintain}" --check`, { cwd: tempDir, stdio: 'pipe' });
    assert.fail('okf-maintain --check should have failed when drift is present');
  } catch (e) {
    if (e.name === 'AssertionError') throw e;
    console.log('✓ okf-maintain --check correctly reported drift.');
  }

  // 6b. Sync mode resolves drift
  execSync(`node "${scripts.maintain}"`, { cwd: tempDir, stdio: 'ignore' });
  console.log('✓ okf-maintain --sync executed and refreshed concept.');

  // 6c. Verify multi-agent steering notice audit & auto-sync
  const mockClaudeFile = path.join(tempDir, 'CLAUDE.md');
  const mockCursorFile = path.join(tempDir, '.cursorrules');
  const mockWindsurfFile = path.join(tempDir, '.windsurfrules');

  fs.writeFileSync(mockClaudeFile, '# Claude Project\n\n## Knowledge Bundle / OKF\nOld steering notice.\n\n<!-- okf-steering-version: 1.7.0 -->\n');
  fs.writeFileSync(mockCursorFile, '# Cursor Rules\n\n## Knowledge Bundle / OKF\nOld cursor steering notice.\n\n<!-- okf-steering-version: 1.3.0 -->\n');
  fs.writeFileSync(mockWindsurfFile, '# Windsurf Rules\nNon-OKF rules content here.\n');

  // maintain --check should detect outdated steering in both files
  try {
    execSync(`node "${scripts.maintain}" --check --json`, { cwd: tempDir, stdio: 'pipe' });
    assert.fail('maintain --check should have failed when outdated steering files are present');
  } catch (e) {
    if (e.name === 'AssertionError') throw e;
    const checkJson = JSON.parse(e.stdout.toString());
    assert.ok(checkJson.outdatedSteering.includes('CLAUDE.md'), 'Outdated steering should include CLAUDE.md');
    assert.ok(checkJson.outdatedSteering.includes('.cursorrules'), 'Outdated steering should include .cursorrules');
    assert.ok(!checkJson.outdatedSteering.includes('.windsurfrules'), 'Unrelated .windsurfrules should not be flagged');
    console.log('✓ okf-maintain --check correctly caught multiple outdated steering notices and ignored non-OKF files.');
  }

  // lint should also flag both files
  const lintPre = JSON.parse(execSync(`node "${scripts.lint}" --json`, { cwd: tempDir }).toString());
  assert.ok(lintPre.warnings.some(w => w.includes('[CLAUDE.md] Warning: Steering notice')), 'Linter should warn on CLAUDE.md');
  assert.ok(lintPre.warnings.some(w => w.includes('[.cursorrules] Warning: Steering notice')), 'Linter should warn on .cursorrules');
  console.log('✓ okf-lint correctly audited multiple steering files.');

  // maintain --sync should auto-heal both files
  execSync(`node "${scripts.maintain}"`, { cwd: tempDir, stdio: 'ignore' });
  const patchedClaudeContent = fs.readFileSync(mockClaudeFile, 'utf8');
  assert.ok(patchedClaudeContent.includes('<!-- okf-steering-version: 1.8.2 -->'), 'maintain.js should bump CLAUDE.md steering tag to 1.8.2');
  assert.ok(patchedClaudeContent.includes('Semantic Concept & Source Binding Upkeep'), 'maintain.js should inject Step 1 Semantic Concept & Source Binding Upkeep in CLAUDE.md');
  assert.ok(patchedClaudeContent.includes('Model-Tier Routing'), 'maintain.js should inject Model-Tier Routing in CLAUDE.md');
  assert.ok(patchedClaudeContent.includes('Pre-Work Grounding Gate'), 'maintain.js should inject Pre-Work Gate in CLAUDE.md');
  assert.ok(patchedClaudeContent.includes('Pre-Completion Verification Gate'), 'maintain.js should inject Pre-Completion Gate in CLAUDE.md');

  const patchedCursorContent = fs.readFileSync(mockCursorFile, 'utf8');
  assert.ok(patchedCursorContent.includes('<!-- okf-steering-version: 1.8.2 -->'), 'maintain.js should bump .cursorrules steering tag to 1.8.2');
  assert.ok(patchedCursorContent.includes('Semantic Concept & Source Binding Upkeep'), 'maintain.js should inject Step 1 Semantic Concept & Source Binding Upkeep in .cursorrules');
  assert.ok(patchedCursorContent.includes('Model-Tier Routing'), 'maintain.js should inject Model-Tier Routing in .cursorrules');
  assert.ok(patchedCursorContent.includes('Pre-Work Grounding Gate'), 'maintain.js should inject Pre-Work Gate in .cursorrules');
  assert.ok(patchedCursorContent.includes('Pre-Completion Verification Gate'), 'maintain.js should inject Pre-Completion Gate in .cursorrules');

  const windsurfContent = fs.readFileSync(mockWindsurfFile, 'utf8');
  assert.strictEqual(windsurfContent, '# Windsurf Rules\nNon-OKF rules content here.\n', 'Non-OKF steering file should remain untouched');
  console.log('✓ okf-maintain --sync automatically auto-healed multiple steering notices without altering non-OKF files.');

  fs.unlinkSync(mockClaudeFile);
  fs.unlinkSync(mockCursorFile);
  fs.unlinkSync(mockWindsurfFile);

  // === STEP 7: LINT VERIFICATION ===
  console.log('Step 7: Verifying linter clears after upkeep via --json...');
  const lintJsonOutput = JSON.parse(execSync(`node "${scripts.lint}" --drift --json`, { cwd: tempDir }).toString());
  assert.equal(lintJsonOutput.success, true, 'Linter should report success: true');
  assert.equal(lintJsonOutput.driftCount, 0, 'Linter should report driftCount: 0');
  console.log('✓ Linter successfully verified with --json and passed after upkeep.');

  // === STEP 8: VISUALIZATION ===
  console.log('Step 8: Generating visualization...');
  assert.ok(!fs.existsSync(path.join(bundleRoot, 'viz.html')), 'okf-maintain should NOT create viz.html unless --viz or okf-visualize is called');
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

  // 9d-2. Test stale_after validation
  const staleTestFile = path.join(bundleRoot, 'concepts', 'stale_test.md');
  fs.writeFileSync(staleTestFile, `---
type: Concept
title: Stale Concept Test
stale_after: 2020-01-01T00:00:00Z
generated:
  by: human:tester
  at: 2020-01-01T00:00:00Z
---

This concept is expired.
`);
  const staleLintJson = JSON.parse(execSync(`node "${scripts.lint}" --json`, { cwd: tempDir }).toString());
  assert.ok(staleLintJson.staleCount > 0, 'Linter should report stale concepts');
  console.log('✓ Linter successfully flagged expired concept via stale_after.');
  fs.unlinkSync(staleTestFile);

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
  // === STEP 11: TEST ACTOR & LOG NORMALIZATION, LINK TOLERANCE, AND IDEMPOTENCY ===
  console.log('Step 11: Testing OKF v0.2 actor normalization, log.md normalization, and link tolerance...');

  // 11a. Create concept with agent: prefix
  const actorTestFile = path.join(bundleRoot, 'concepts', 'actor_test.md');
  fs.writeFileSync(actorTestFile, `---
type: Concept
title: Actor Normalization Test
generated:
  by: agent:Antigravity/3.5-Flash
  at: 2026-08-01T00:00:00Z
verified:
  - by: agent:test-bot/1.0
    at: 2026-08-02T00:00:00Z
---

Testing actor format.
`);

  // 11b. Write non-normalized headings in log.md
  const logFile = path.join(bundleRoot, 'log.md');
  fs.writeFileSync(logFile, `# Change Log

## 2026-08-24T20:08:00Z
- Entry one

## 2026-08-24T18:00:00Z
- Entry two
`);

  // 11c. Add concept with a broken link to test tolerance (§6.1)
  const brokenLinkFile = path.join(bundleRoot, 'concepts', 'broken_link_test.md');
  fs.writeFileSync(brokenLinkFile, `---
type: Concept
title: Broken Link Concept
generated:
  by: human:tester
  at: 2026-08-01T00:00:00Z
---

Here is a forward-looking link to [Future Concept](/concepts/nonexistent.md).
`);

  // Lint should pass without --strict-links (broken link is a warning, not an error)
  const lintPermissiveOutput = execSync(`node "${scripts.lint}"`, { cwd: tempDir }).toString();
  assert.ok(lintPermissiveOutput.includes('OKF Linting Passed Successfully!'), 'Linting should pass by default when broken links exist');
  assert.ok(lintPermissiveOutput.includes('Warning: Broken concept link to'), 'Broken link should be reported as warning');
  assert.ok(lintPermissiveOutput.includes('Warning: Log date heading'), 'Non-standard log heading should be flagged as warning');
  assert.ok(lintPermissiveOutput.includes('Warning: \'generated.by\' uses non-standard'), 'Non-standard actor should be flagged as warning');
  console.log('✓ Linter properly tolerated broken link and reported warnings for unnormalized actors and log headings.');

  // Lint should fail with --strict-links
  try {
    execSync(`node "${scripts.lint}" --strict-links`, { cwd: tempDir, stdio: 'pipe' });
    assert.fail('Linter should have failed with --strict-links');
  } catch (e) {
    if (e.name === 'AssertionError') throw e;
    console.log('✓ Linter failed as expected when run with --strict-links.');
  }

  // 11d. Run okf-upgrade to normalize actors and log.md
  execSync(`node "${scripts.upgrade}"`, { cwd: tempDir, stdio: 'ignore' });

  // Verify actor was normalized (agent: prefix removed)
  const normalizedActorContent = fs.readFileSync(actorTestFile, 'utf8');
  assert.ok(normalizedActorContent.includes('by: Antigravity/3.5-Flash'), 'Upgrade should strip agent: prefix from generated.by');
  assert.ok(normalizedActorContent.includes('by: test-bot/1.0'), 'Upgrade should strip agent: prefix from verified.by');
  console.log('✓ Actor format normalized to <producer>/<version>.');

  // Verify log.md was normalized to YYYY-MM-DD and merged
  const normalizedLogContent = fs.readFileSync(logFile, 'utf8').replace(/\r\n/g, '\n');
  assert.ok(normalizedLogContent.includes('## 2026-08-24\n- Entry one\n\n- Entry two'), 'Log headings should be normalized and merged under YYYY-MM-DD');
  console.log('✓ Log file normalized to standard YYYY-MM-DD headings.');

  // Clean up the broken link concept before final verification
  fs.unlinkSync(brokenLinkFile);

  // 11e. Verify idempotency: running okf-upgrade again should produce 0 modifications
  const secondUpgradeOutput = execSync(`node "${scripts.upgrade}"`, { cwd: tempDir }).toString();
  assert.ok(secondUpgradeOutput.includes('Concepts modified: 0'), 'Second run of upgrade should modify 0 concepts');
  assert.ok(secondUpgradeOutput.includes('Logs normalized:   0'), 'Second run of upgrade should normalize 0 logs');
  console.log('✓ okf-upgrade verified strictly idempotent on compliant bundle.');

  // === STEP 12: TEST OKF PRUNE (LIFECYCLE GARBAGE COLLECTION) ===
  console.log('Step 12: Testing OKF Prune (lifecycle garbage collection & archiving)...');

  // 12a. Create candidate concepts for pruning: stale, deprecated, ghost, orphan
  const stalePruneFile = path.join(bundleRoot, 'concepts', 'stale_prune.md');
  fs.writeFileSync(stalePruneFile, `---
type: Concept
title: Stale Concept
stale_after: 2020-01-01T00:00:00Z
generated:
  by: human:tester
  at: 2019-12-01T00:00:00Z
---
Expired concept content.
`);

  const deprecatedPruneFile = path.join(bundleRoot, 'concepts', 'deprecated_prune.md');
  fs.writeFileSync(deprecatedPruneFile, `---
type: Concept
title: Deprecated Feature
status: deprecated
generated:
  by: human:tester
  at: 2026-01-01T00:00:00Z
---
Deprecated feature documentation.
`);

  const ghostPruneFile = path.join(bundleRoot, 'concepts', 'ghost_prune.md');
  fs.writeFileSync(ghostPruneFile, `---
type: Concept
title: Ghost Resource Concept
resource: file:///src/non_existent_code.js
generated:
  by: human:tester
  at: 2026-01-01T00:00:00Z
---
Concept pointing to deleted source file.
`);

  const orphanPruneFile = path.join(bundleRoot, 'concepts', 'orphan_prune.md');
  fs.writeFileSync(orphanPruneFile, `---
type: Concept
title: Orphaned Concept
generated:
  by: human:tester
  at: 2026-01-01T00:00:00Z
---
Unreferenced isolated concept.
`);

  // Link stale, deprecated, and ghost in index.md so they have inbound links, leaving orphan as the unlinked one
  const currentIdxContent = fs.readFileSync(path.join(bundleRoot, 'index.md'), 'utf8');
  fs.writeFileSync(path.join(bundleRoot, 'index.md'), currentIdxContent + `
- [Stale Concept](/concepts/stale_prune.md)
- [Deprecated Feature](/concepts/deprecated_prune.md)
- [Ghost Resource Concept](/concepts/ghost_prune.md)
`);

  // 12b. Run okf-prune --check with filters and verify specific candidate detection
  function runPruneJson(extraArgs) {
    try {
      const out = execSync(`node "${scripts.prune}" ${extraArgs} --json`, { cwd: tempDir, stdio: ['pipe', 'pipe', 'pipe'] });
      return { code: 0, data: JSON.parse(out.toString()) };
    } catch (e) {
      if (e.stdout) {
        return { code: e.status || 1, data: JSON.parse(e.stdout.toString()) };
      }
      throw e;
    }
  }

  // Check --stale filter
  const staleCheck = runPruneJson('--check --stale');
  assert.equal(staleCheck.code, 1, 'Check with stale items should exit with code 1');
  assert.equal(staleCheck.data.totalPrunable, 1, 'Should detect exactly 1 stale concept');
  assert.equal(staleCheck.data.candidates[0].relPath, 'concepts/stale_prune.md');
  console.log('✓ okf-prune --check --stale correctly filtered expired concepts.');

  // Check --deprecated filter
  const depCheck = runPruneJson('--check --deprecated');
  assert.equal(depCheck.code, 1, 'Check with deprecated items should exit with code 1');
  assert.equal(depCheck.data.totalPrunable, 1, 'Should detect exactly 1 deprecated concept');
  assert.equal(depCheck.data.candidates[0].relPath, 'concepts/deprecated_prune.md');
  console.log('✓ okf-prune --check --deprecated correctly filtered deprecated concepts.');

  // Check --ghosts filter
  const ghostCheck = runPruneJson('--check --ghosts');
  assert.equal(ghostCheck.code, 1, 'Check with ghost items should exit with code 1');
  assert.ok(ghostCheck.data.candidates.some(c => c.relPath === 'concepts/ghost_prune.md'), 'Should detect ghost concept');
  console.log('✓ okf-prune --check --ghosts correctly filtered missing resource concepts.');

  // Check all candidates
  const allCheck = runPruneJson('--check');
  assert.equal(allCheck.code, 1, 'Check mode should exit with code 1 when candidates exist');
  assert.ok(allCheck.data.candidates.some(c => c.relPath === 'concepts/stale_prune.md'), 'Should include stale concept');
  assert.ok(allCheck.data.candidates.some(c => c.relPath === 'concepts/deprecated_prune.md'), 'Should include deprecated concept');
  assert.ok(allCheck.data.candidates.some(c => c.relPath === 'concepts/ghost_prune.md'), 'Should include ghost concept');
  assert.ok(allCheck.data.candidates.some(c => c.relPath === 'concepts/orphan_prune.md'), 'Should include orphan concept');
  console.log('✓ okf-prune --check correctly identified all prunable candidate categories.');

  // 12c. Run okf-prune in default archive mode
  const pruneOutput = runPruneJson('');
  assert.equal(pruneOutput.code, 0, 'Prune execution should succeed with exit code 0');
  assert.ok(fs.existsSync(path.join(bundleRoot, 'archive', 'concepts', 'stale_prune.md')), 'Stale concept should be moved to archive/');
  assert.ok(fs.existsSync(path.join(bundleRoot, 'archive', 'concepts', 'deprecated_prune.md')), 'Deprecated concept should be moved to archive/');
  assert.ok(fs.existsSync(path.join(bundleRoot, 'archive', 'concepts', 'ghost_prune.md')), 'Ghost concept should be moved to archive/');
  assert.ok(fs.existsSync(path.join(bundleRoot, 'archive', 'concepts', 'orphan_prune.md')), 'Orphan concept should be moved to archive/');
  assert.ok(!fs.existsSync(stalePruneFile), 'Original stale file should be removed from active concepts');

  // Verify archived file frontmatter has status: deprecated and archived_at
  const archivedStaleContent = fs.readFileSync(path.join(bundleRoot, 'archive', 'concepts', 'stale_prune.md'), 'utf8');
  assert.ok(archivedStaleContent.includes('status: deprecated'), 'Archived concept should have status: deprecated');
  assert.ok(archivedStaleContent.includes('archived_at:'), 'Archived concept should have archived_at timestamp');

  // Verify index.md updated with ## Archived Concepts
  const updatedIndex = fs.readFileSync(path.join(bundleRoot, 'index.md'), 'utf8');
  assert.ok(updatedIndex.includes('## Archived Concepts'), 'index.md should contain ## Archived Concepts section');
  assert.ok(updatedIndex.includes('/archive/concepts/stale_prune.md'), 'index.md should link to archived location');

  // Verify log.md updated with prune entry
  const updatedLog = fs.readFileSync(path.join(bundleRoot, 'log.md'), 'utf8');
  assert.ok(updatedLog.includes('Pruned (archived) concept'), 'log.md should record archived concepts');

  console.log('✓ okf-prune successfully archived concepts, updated index.md, and recorded changelog.');

  // 12d. Verify audit passes cleanly after pruning
  execSync(`node "${scripts.prune}" --check`, { cwd: tempDir });
  console.log('✓ okf-prune --check verified 0 prunable items remaining.');

  // 12e. Test --delete mode
  const deleteTestFile = path.join(bundleRoot, 'concepts', 'delete_target.md');
  fs.writeFileSync(deleteTestFile, `---
type: Concept
title: Delete Target
status: deprecated
---
Should be deleted.
`);
  const delOutput = runPruneJson('--delete --deprecated');
  assert.equal(delOutput.code, 0, 'Delete execution should succeed');
  assert.ok(!fs.existsSync(deleteTestFile), 'Target file should be deleted');
  console.log('✓ okf-prune --delete successfully removed target file.');

  // === STEP 13: TEST v1.7.0 PRE-COMPLETION DRIFT, SHORTHAND SOURCES & UNMAPPED DIRTY FILE GATE ===
  console.log('Step 13: Testing v1.7.0 working-tree drift, shorthand sources[], and unmapped dirty file gate...');

  // 13a. Create code file and concept using shorthand string array in sources:
  const shorthandCodeFile = path.join(tempDir, 'src', 'shorthand_sync.ts');
  fs.writeFileSync(shorthandCodeFile, 'export function syncCloud() { return true; }\n');

  // First run maintain so shorthand_sync.ts is in ## Not yet specified before concept binds it
  execSync(`node "${scripts.maintain}"`, { cwd: tempDir, stdio: 'ignore' });
  assert.ok(
    fs.readFileSync(path.join(bundleRoot, 'index.md'), 'utf8').includes('src/shorthand_sync.ts'),
    'shorthand_sync.ts should initially appear in ## Not yet specified'
  );

  const shorthandConceptFile = path.join(bundleRoot, 'concepts', 'shorthand_concept.md');
  const shorthandInitISO = new Date().toISOString();
  fs.writeFileSync(shorthandConceptFile, `---
type: Subsystem
title: Cloud Sync Service
description: Synchronizes local hub state with cloud storage.
generated:
  by: Antigravity/4.0
  at: ${shorthandInitISO}
sources:
  - src/shorthand_sync.ts
  - https://example.com/cloud-sync-spec
---

Handles cloud synchronization.
`);
  const idxBefore13 = fs.readFileSync(path.join(bundleRoot, 'index.md'), 'utf8');
  fs.writeFileSync(
    path.join(bundleRoot, 'index.md'),
    idxBefore13.replace('## Concepts and Skills\n', '## Concepts and Skills\n- [Cloud Sync Service](/concepts/shorthand_concept.md)\n')
  );

  // Run maintain to graduate src/shorthand_sync.ts out of ## Not yet specified
  execSync(`node "${scripts.maintain}"`, { cwd: tempDir, stdio: 'ignore' });
  const idxAfterGraduation = fs.readFileSync(path.join(bundleRoot, 'index.md'), 'utf8');
  const notYetSection = idxAfterGraduation.split('## Not yet specified')[1] || '';
  assert.ok(!notYetSection.includes('src/shorthand_sync.ts'), 'Shorthand sources entry should graduate file out of ## Not yet specified');
  console.log('✓ Shorthand string entry in sources[] graduated file out of ## Not yet specified.');

  // Query by --file and --search should both match via shorthand sources[]
  const queryShorthandFile = execSync(`node "${scripts.query}" --file "src/shorthand_sync.ts"`, { cwd: tempDir }).toString();
  assert.ok(queryShorthandFile.includes('Cloud Sync Service'), 'okf-query --file should match shorthand string entry in sources[]');
  const queryShorthandSearch = execSync(`node "${scripts.query}" --search "shorthand_sync.ts"`, { cwd: tempDir }).toString();
  assert.ok(queryShorthandSearch.includes('Cloud Sync Service'), 'okf-query --search should index shorthand string entry in sources[]');
  console.log('✓ okf-query --file and --search matched shorthand string entry in sources[].');

  // Commit clean state
  execSync('git add . && git commit -m "feat: add shorthand sync concept"', { cwd: tempDir, stdio: 'ignore' });

  // 13b. Modify src/shorthand_sync.ts in working tree WITHOUT git commit
  execSync('node -e "setTimeout(() => {}, 1100)"');
  fs.writeFileSync(shorthandCodeFile, 'export function syncCloud() { return false; } // uncommitted edit\n');

  // lint --drift MUST detect uncommitted working-tree drift
  const uncommittedDriftLint = execSync(`node "${scripts.lint}" --drift`, { cwd: tempDir }).toString();
  assert.ok(uncommittedDriftLint.includes('Warning: Concept drift detected'), 'okf-lint --drift should detect uncommitted working-tree edits');
  console.log('✓ okf-lint --drift detected uncommitted working-tree edit before git commit.');

  // maintain --check MUST also detect uncommitted working-tree drift
  let maintainCheckFailed = false;
  try {
    execSync(`node "${scripts.maintain}" --check`, { cwd: tempDir, stdio: 'pipe' });
  } catch (e) {
    maintainCheckFailed = true;
  }
  assert.ok(maintainCheckFailed, 'okf-maintain --check should fail when uncommitted working-tree drift exists');

  // maintain should sync the concept timestamp from working-tree mtime
  execSync(`node "${scripts.maintain}"`, { cwd: tempDir, stdio: 'ignore' });
  const postMaintainLint = JSON.parse(execSync(`node "${scripts.lint}" --drift --json`, { cwd: tempDir }).toString());
  assert.equal(postMaintainLint.driftCount, 0, 'okf-lint --drift should report 0 concept drift after maintain syncs working-tree mtime');
  console.log('✓ okf-maintain synced concept timestamp against uncommitted working-tree mtime.');

  // 13c. Create a new unmapped code file in a new subdirectory (and a non-code image asset)
  const unmappedCodeFile = path.join(tempDir, 'src', 'new_feature', 'unmapped_worker.ts');
  fs.mkdirSync(path.dirname(unmappedCodeFile), { recursive: true });
  fs.writeFileSync(unmappedCodeFile, 'export const worker = true;\n');
  const untrackedImageFile = path.join(tempDir, 'mobile_preview.jpeg');
  fs.writeFileSync(untrackedImageFile, 'fake-image-bytes');

  const unmappedLintJson = JSON.parse(execSync(`node "${scripts.lint}" --drift --json`, { cwd: tempDir }).toString());
  assert.ok(
    unmappedLintJson.warnings.some(w => w.includes("Modified workspace file 'src/new_feature/unmapped_worker.ts' is not bound to any OKF concept")),
    'okf-lint --drift should warn when a modified/added code file is not bound to any concept'
  );
  assert.ok(
    !unmappedLintJson.warnings.some(w => w.includes('mobile_preview.jpeg')),
    'okf-lint --drift should not warn on non-code image assets'
  );
  console.log('✓ okf-lint --drift warned on unmapped dirty code file and ignored non-code image asset.');

  // Bind src/new_feature/unmapped_worker.ts to shorthand_concept.md and verify warning clears
  const updatedShorthandConcept = fs.readFileSync(shorthandConceptFile, 'utf8').replace(
    '  - src/shorthand_sync.ts',
    '  - src/shorthand_sync.ts\n  - src/new_feature/unmapped_worker.ts'
  );
  fs.writeFileSync(shorthandConceptFile, updatedShorthandConcept);
  execSync(`node "${scripts.maintain}"`, { cwd: tempDir, stdio: 'ignore' });

  const finalLintJson = JSON.parse(execSync(`node "${scripts.lint}" --drift --json`, { cwd: tempDir }).toString());
  assert.equal(finalLintJson.errors.length, 0, 'Final lint should have 0 errors');
  assert.equal(finalLintJson.driftCount, 0, 'Final lint should have 0 drift warnings once dirty code file is bound');
  assert.ok(!finalLintJson.warnings.some(w => w.includes('unmapped_worker.ts')), 'Warning for unmapped_worker.ts should be cleared');
  console.log('✓ Unmapped dirty code file warning cleared once bound to concept sources[].');

  // === STEP 14: TEST OKF WAYFINDER v0.2 TELEMETRY, ATTESTED RESOURCE EXCLUSION & CLUSTERING ===
  console.log('Step 14: Testing okf-wayfinder v0.2 resource tracking, frontier clustering, and --inspect telemetry...');

  // 14a. Add an active Attested Computation concept and a multi-file undocumented module
  const activeAttestedFile = path.join(bundleRoot, 'concepts', 'active_attested.md');
  fs.writeFileSync(activeAttestedFile, `---
type: Attested Computation
title: Active Revenue Calculation
runtime: bigquery
computation: file:///src/attested_comp.sql
executor:
  resource: file:///src/run-executor.js
  receipt: [job_id]
attester:
  resource: file:///src/run-attester.js
---
Active attested computation.
`);

  const paymentsDir = path.join(tempDir, 'payments');
  fs.mkdirSync(paymentsDir, { recursive: true });
  fs.writeFileSync(path.join(paymentsDir, 'index.js'), "const sync = require('../src/shorthand_sync.ts');\nfunction chargeCard() { return true; }\nmodule.exports = { chargeCard };\n");
  fs.writeFileSync(path.join(paymentsDir, 'helper.js'), 'export function formatCents(c) { return c / 100; }\n');

  const wfOut = JSON.parse(execSync(`node "${scripts.taxonomy}" --bundle "${bundleRoot}"`, { cwd: tempDir }).toString());
  assert.equal(wfOut.layoutMode, 'nested', 'wayfinder should detect nested layout mode');
  assert.ok(wfOut.subdirectories.includes('/concepts'), 'wayfinder should list /concepts subdirectory');
  assert.ok(Array.isArray(wfOut.concepts) && wfOut.concepts.some(c => c.title === 'Cloud Sync Service'), 'wayfinder should list active concepts');
  assert.ok(!wfOut.concepts.some(c => c.title === 'Stale Concept'), 'wayfinder should ignore archived concepts in archive/');
  assert.ok(!wfOut.frontier.some(f => f.path === 'src/attested_comp.sql'), 'wayfinder should exclude Attested Computation computation file from frontier');
  assert.ok(!wfOut.frontier.some(f => f.path === 'src/run-executor.js'), 'wayfinder should exclude Attested Computation executor.resource from frontier');
  assert.ok(!wfOut.frontier.some(f => f.path === 'src/run-attester.js'), 'wayfinder should exclude Attested Computation attester.resource from frontier');

  const paymentsGroup = wfOut.frontierGroups.find(g => g.directory === 'payments');
  assert.ok(paymentsGroup, 'wayfinder should cluster payments/ files into frontierGroups');
  assert.equal(paymentsGroup.primaryCandidate, 'payments/index.js', 'wayfinder should rank index.js as primaryCandidate');
  assert.ok(paymentsGroup.companionFiles.includes('payments/helper.js'), 'wayfinder should include helper.js in companionFiles');
  console.log('✓ wayfinder_taxonomy.js tracked Attested Computation resources, skipped archive/, and clustered frontierGroups.');

  // 14b. Test --inspect telemetry on payments/index.js
  const inspectOut = JSON.parse(execSync(`node "${scripts.taxonomy}" --bundle "${bundleRoot}" --inspect "payments/index.js"`, { cwd: tempDir }).toString());
  assert.equal(inspectOut.success, true, '--inspect should return success: true');
  assert.ok(inspectOut.exportedSymbols.includes('chargeCard'), '--inspect should extract exported symbol chargeCard');
  assert.ok(inspectOut.localImports.includes('src/shorthand_sync.ts'), '--inspect should resolve local relative import src/shorthand_sync.ts');
  assert.ok(inspectOut.relatedConcepts.some(c => c.markdownLink === '[Cloud Sync Service](/concepts/shorthand_concept.md)'), '--inspect should resolve imported file to existing OKF concept link');
  console.log('✓ wayfinder_taxonomy.js --inspect extracted exported symbols, local imports, and related OKF concept links.');

  // === STEP 15: TEST FULL-SUITE OKF v0.2 ALIGNMENT (QUERY, UPGRADE, PRUNE, LINT) ===
  console.log('Step 15: Testing full-suite OKF v0.2 alignment across okf-query, okf-upgrade, okf-prune, and okf-lint...');

  // 15a. okf-query --file on Attested Computation computation & attester.resource, and --search on runtime
  const queryCompOut = execSync(`node "${scripts.query}" --file src/attested_comp.sql`, { cwd: tempDir }).toString();
  assert.ok(queryCompOut.includes('Active Revenue Calculation'), 'okf-query --file should match Attested Computation computation URI');
  assert.ok(/Runtime:\s+bigquery/.test(queryCompOut), 'okf-query output should include Runtime metadata');
  const queryAttesterOut = execSync(`node "${scripts.query}" --file src/run-attester.js`, { cwd: tempDir }).toString();
  assert.ok(queryAttesterOut.includes('Active Revenue Calculation'), 'okf-query --file should match Attested Computation attester.resource URI');
  const queryRuntimeOut = execSync(`node "${scripts.query}" --search bigquery`, { cwd: tempDir }).toString();
  assert.ok(queryRuntimeOut.includes('Active Revenue Calculation'), 'okf-query --search should index runtime field');
  console.log('✓ okf-query matched Attested Computation computation, attester.resource, and runtime.');

  // 15b. okf-upgrade preserves shorthand string sources & id-less object sources and normalizes sources[].author
  const mixedSourcesFile = path.join(bundleRoot, 'concepts', 'mixed_sources.md');
  fs.writeFileSync(mixedSourcesFile, `---
type: Reference
title: Mixed Sources Reference
resource: bigquery://analytics-prod.core.events
timestamp: 2026-09-01T00:00:00Z
sources:
  - src/shorthand_sync.ts
  - id: doc-1
    resource: https://example.com/architecture
    title: Architecture Doc
    author: agent:Claude/3.5
    usage_count: 42
---
This reference cites the architecture doc[^doc-1] and links to [Cloud Sync Service](/concepts/shorthand_concept.md).
`);
  // Link mixed_sources.md from shorthand_concept.md so it is not an orphan
  fs.appendFileSync(shorthandConceptFile, '\nSee also [Mixed Sources Reference](/concepts/mixed_sources.md).\n');
  execSync(`node "${scripts.upgrade}"`, { cwd: tempDir, stdio: 'ignore' });
  const upgradedMixed = fs.readFileSync(mixedSourcesFile, 'utf8');
  assert.ok(upgradedMixed.includes('- src/shorthand_sync.ts'), 'okf-upgrade must preserve shorthand string sources');
  assert.ok(!upgradedMixed.includes('undefined'), 'okf-upgrade must never emit undefined in sources serialization');
  assert.ok(upgradedMixed.includes('author: Claude/3.5'), 'okf-upgrade must strip agent: prefix from sources[].author');
  assert.ok(upgradedMixed.includes('usage_count: 42'), 'okf-upgrade must preserve sources[].usage_count');
  console.log('✓ okf-upgrade preserved shorthand and structured sources and normalized sources[].author.');

  // 15c. okf-prune --check --ghosts ignores non-file:// URIs (e.g. bigquery://)
  const pruneGhostsJson = JSON.parse(execSync(`node "${scripts.prune}" --check --ghosts --json`, { cwd: tempDir }).toString());
  assert.ok(!pruneGhostsJson.candidates.some(c => c.relId.includes('mixed_sources')), 'okf-prune --ghosts must not flag bigquery:// URIs as missing local files');
  console.log('✓ okf-prune --ghosts ignored non-file:// URI schemes.');

  // 15d. okf-lint checks [^id] footnote attribution and lifecycle status
  const badFootnoteFile = path.join(bundleRoot, 'concepts', 'bad_footnote.md');
  fs.writeFileSync(badFootnoteFile, `---
type: Concept
title: Footnote Check Concept
status: stable
generated:
  by: human:tester
  at: 2026-09-01T00:00:00Z
sources:
  - id: unused-src
    resource: src/shorthand_sync.ts
---
Body cites an undefined footnote[^missing-src] and forgets unused-src.
`);
  const footnoteLintJson = JSON.parse(execSync(`node "${scripts.lint}" --json`, { cwd: tempDir }).toString());
  assert.ok(footnoteLintJson.warnings.some(w => w.includes("Body references footnote '[^missing-src]' which is not defined")), 'okf-lint should warn on undefined [^id] footnote in body');
  fs.unlinkSync(badFootnoteFile);
  console.log('✓ okf-lint verified [^id] footnote attribution against sources[].id.');

  // 15e. Transitive concept drift & CRLF preservation in a single okf-maintain pass
  const crlfDependentFile = path.join(bundleRoot, 'concepts', 'dependent_concept.md');
  const oldTransIso = new Date(Date.now() - 120000).toISOString();
  const crlfContent = [
    '---',
    'type: Specification',
    'title: Dependent Specification',
    'description: Depends on Cloud Sync Service concept.',
    'resource: docs/okf/concepts/shorthand_concept.md',
    'generated:',
    '  by: Antigravity/4.0',
    `  at: ${oldTransIso}`,
    '---',
    '',
    '# Dependent Specification',
    'References [Cloud Sync Service](/concepts/shorthand_concept.md).'
  ].join('\r\n') + '\r\n';
  fs.writeFileSync(crlfDependentFile, crlfContent, 'utf8');

  // Modify src/shorthand_sync.ts so shorthand_concept.md drifts, which transitively drifts dependent_concept.md
  fs.writeFileSync(shorthandCodeFile, 'export function syncCloud() { return "transitive-test"; }\n');
  execSync(`node "${scripts.maintain}"`, { cwd: tempDir, stdio: 'ignore' });

  // Verify a SINGLE maintain pass cleared drift for BOTH shorthand_concept.md and dependent_concept.md
  const transLintJson = JSON.parse(execSync(`node "${scripts.lint}" --drift --json`, { cwd: tempDir }).toString());
  const conceptDriftWarnings = transLintJson.warnings.filter(w => w.includes('Concept drift detected'));
  assert.equal(conceptDriftWarnings.length, 0, 'Single okf-maintain pass must clear transitive concept-to-concept drift');
  const updatedCrlfContent = fs.readFileSync(crlfDependentFile, 'utf8');
  assert.ok(!updatedCrlfContent.includes(`at: ${oldTransIso}`), 'dependent_concept.md timestamp must be updated transitively');
  assert.ok(updatedCrlfContent.startsWith('---\r\n'), 'updateConceptTimestamp must preserve CRLF line endings in frontmatter');
  console.log('✓ okf-maintain resolved transitive concept-to-concept drift and preserved CRLF in a single pass.');

  // 15f. okf-query smart section excerpting on large concepts (> 12 KB) and --full override
  const largeBody = '# Section One\n' + 'A'.repeat(13000) + '\n\n# Section Two SpecialToken\nMatched paragraph with SpecialToken.\n';
  const largeConceptFile = path.join(bundleRoot, 'concepts', 'large_concept.md');
  fs.writeFileSync(largeConceptFile, `---
type: Reference
title: Large Reference Doc
resource: src/shorthand_sync.ts
generated:
  by: Antigravity/4.0
  at: ${new Date().toISOString()}
---
${largeBody}`);
  const excerptOut = execSync(`node "${scripts.query}" --search SpecialToken`, { cwd: tempDir }).toString();
  assert.ok(excerptOut.includes('[Matching Sections for "SpecialToken"]'), 'okf-query --search should excerpt matching sections on >12KB concepts');
  assert.ok(excerptOut.length < 4000, 'Excerpted output should be compact');
  const fullOut = execSync(`node "${scripts.query}" --search SpecialToken --full`, { cwd: tempDir }).toString();
  assert.ok(fullOut.length > 13000, 'okf-query --search --full should print full concept body');
  fs.unlinkSync(largeConceptFile);
  console.log('✓ okf-query excerpted matching sections on >12KB concepts and supported --full.');

  // 15g. Frontier section surgery, prose/Provenance preservation, directory binding & nested bundle exclusion
  const sqlFixesDir = path.join(tempDir, 'sql-fixes');
  fs.mkdirSync(sqlFixesDir, { recursive: true });
  fs.writeFileSync(path.join(sqlFixesDir, 'patch01.sql'), 'UPDATE accounts SET active = 1;\n');
  fs.writeFileSync(path.join(tempDir, 'src', 'explained_in_prose.js'), 'module.exports = {};\n');

  // Create a nested OKF bundle inside subpkg/okf with okf_version in index.md
  const nestedBundleDir = path.join(tempDir, 'subpkg', 'okf');
  fs.mkdirSync(nestedBundleDir, { recursive: true });
  fs.writeFileSync(path.join(nestedBundleDir, 'index.md'), '---\nokf_version: 0.2\n---\n# Nested Bundle\n');
  fs.writeFileSync(path.join(nestedBundleDir, 'nested-concept.md'), '---\ntype: Concept\ntitle: Nested\n---\nBody\n');

  // Bind sql-fixes/ directory on shorthand_concept.md
  fs.writeFileSync(
    shorthandConceptFile,
    fs.readFileSync(shorthandConceptFile, 'utf8').replace(
      '  - src/shorthand_sync.ts',
      '  - src/shorthand_sync.ts\n  - sql-fixes/'
    )
  );

  // Craft index.md with prose in ## Not yet specified, a stale self-bundle bullet, and a trailing ## Provenance section
  const indexWithProseAndProvenance = [
    '---',
    'okf_version: 0.2',
    '---',
    '',
    '# Index',
    '',
    '## Concepts and Skills',
    '- [Cloud Sync Service](/concepts/shorthand_concept.md)',
    '',
    '## Not yet specified',
    'The helper `src/explained_in_prose.js` is intentionally lightweight and documented inline.',
    '- `docs/okf/index.md` — Undocumented codebase file.',
    '- `sql-fixes/patch01.sql` — Undocumented codebase file.',
    '',
    '## Provenance',
    'Hand-written provenance notes that must remain byte-for-byte intact.'
  ].join('\r\n') + '\r\n';
  fs.writeFileSync(path.join(bundleRoot, 'index.md'), indexWithProseAndProvenance, 'utf8');

  execSync(`node "${scripts.maintain}"`, { cwd: tempDir, stdio: 'ignore' });
  const afterSurgeryIndex = fs.readFileSync(path.join(bundleRoot, 'index.md'), 'utf8');
  assert.ok(afterSurgeryIndex.includes('\r\n'), 'updateIndexFrontier must preserve CRLF line endings');
  assert.ok(afterSurgeryIndex.includes('The helper `src/explained_in_prose.js` is intentionally lightweight'), 'Hand-written prose in ## Not yet specified must be preserved');
  assert.ok(!afterSurgeryIndex.includes('- `src/explained_in_prose.js`'), 'File already mentioned in index prose must not be added again as a bullet');
  assert.ok(!afterSurgeryIndex.includes('docs/okf/index.md'), 'Stale bundle-internal bullets must be self-healed and removed');
  assert.ok(!afterSurgeryIndex.includes('sql-fixes/patch01.sql'), 'File inside bound sql-fixes/ directory must be graduated from frontier');
  assert.ok(!afterSurgeryIndex.includes('subpkg/okf'), 'Nested OKF bundle files must not be listed as undocumented');
  assert.ok(afterSurgeryIndex.includes('## Provenance\r\nHand-written provenance notes that must remain byte-for-byte intact.'), 'Trailing ## Provenance section must be preserved byte-for-byte');

  // Second run must be a strict no-op on index.md
  execSync(`node "${scripts.maintain}"`, { cwd: tempDir, stdio: 'ignore' });
  const secondSurgeryIndex = fs.readFileSync(path.join(bundleRoot, 'index.md'), 'utf8');
  assert.strictEqual(secondSurgeryIndex, afterSurgeryIndex, 'Second maintain run must leave index.md untouched');

  // Wayfinder must also skip sql-fixes/ and subpkg/okf
  const wfAfterDirBind = JSON.parse(execSync(`node "${scripts.taxonomy}" --bundle "${bundleRoot}"`, { cwd: tempDir }).toString());
  assert.ok(!wfAfterDirBind.frontier.some(f => f.path.startsWith('sql-fixes/')), 'wayfinder must exclude files covered by directory binding');
  assert.ok(!wfAfterDirBind.frontier.some(f => f.path.startsWith('subpkg/okf/')), 'wayfinder must exclude nested OKF bundles');
  console.log('✓ Frontier section surgery preserved prose & Provenance, respected directory bindings, and skipped nested bundles.');

  // === STEP 16: TEST SAME-COMMIT DRIFT TOLERANCE, MISSING RESOURCE LINT, MULTI-WORD QUERY, STEERING CRLF & EXTERNAL --bundle ===
  console.log('Step 16: Testing same-commit drift tolerance, missing-resource lint warning, tokenized search, CRLF steering, and external --bundle...');

  // 16a. Same-commit timestamp drift tolerance: maintain runs before git commit, then commit happens 1s later
  fs.writeFileSync(shorthandCodeFile, 'export function syncCloud() { return "same-commit-test"; }\n');
  execSync(`node "${scripts.maintain}"`, { cwd: tempDir, stdio: 'ignore' });
  execSync('node -e "setTimeout(() => {}, 1100)"');
  execSync('git add . && git commit -m "feat: commit code and maintained concepts together"', { cwd: tempDir, stdio: 'ignore' });

  const postCommitLintJson = JSON.parse(execSync(`node "${scripts.lint}" --drift --json`, { cwd: tempDir }).toString());
  assert.equal(postCommitLintJson.driftCount, 0, 'Concepts committed in the same commit as their bound resource must not trigger post-commit drift');
  execSync(`node "${scripts.maintain}" --check`, { cwd: tempDir, stdio: 'ignore' });
  console.log('✓ Same-commit timestamp drift tolerance verified across okf-lint and okf-maintain.');

  // 16b. Missing local resource/sources warning in okf-lint
  const missingResConcept = path.join(bundleRoot, 'concepts', 'missing_res_test.md');
  fs.writeFileSync(missingResConcept, `---
type: Subsystem
title: Missing Resource Test
resource: src/deleted_on_branch.ts
generated:
  by: Antigravity/4.0
  at: ${new Date().toISOString()}
---
Body.
`);
  const missingResLint = JSON.parse(execSync(`node "${scripts.lint}" --json`, { cwd: tempDir }).toString());
  assert.ok(
    missingResLint.warnings.some(w => w.includes('Warning: Missing local resource') && w.includes('src/deleted_on_branch.ts')),
    'okf-lint should warn when an active concept binds a non-existent local resource/sources path'
  );
  fs.unlinkSync(missingResConcept);
  console.log('✓ okf-lint warned on missing local resource/sources path.');

  // 16c. Multi-word tokenized --search in okf-query
  const multiWordOut = execSync(`node "${scripts.query}" --search "cloud storage sync hub"`, { cwd: tempDir }).toString();
  assert.ok(multiWordOut.includes('Cloud Sync Service'), 'okf-query --search should match multi-word non-contiguous token queries');
  console.log('✓ okf-query --search matched multi-word tokenized query.');

  // 16d. CRLF preservation in inspectAndSyncSteeringFile and other-branch bundle hint
  const crlfClaude = path.join(tempDir, 'CLAUDE.md');
  fs.writeFileSync(crlfClaude, '# Project\r\n\r\n## Knowledge Bundle / OKF\r\nOld notice.\r\n\r\n<!-- okf-steering-version: 1.7.0 -->\r\n', 'utf8');
  execSync(`node "${scripts.maintain}"`, { cwd: tempDir, stdio: 'ignore' });
  const healedCrlfClaude = fs.readFileSync(crlfClaude, 'utf8');
  assert.ok(healedCrlfClaude.includes('\r\n'), 'inspectAndSyncSteeringFile must preserve CRLF line endings');
  assert.ok(!healedCrlfClaude.replace(/\r\n/g, '').includes('\n'), 'inspectAndSyncSteeringFile must not introduce bare LF into a CRLF file');
  fs.unlinkSync(crlfClaude);

  let branchHintCaught = false;
  try {
    execSync(`node "${scripts.maintain}" --bundle "${path.join(tempDir, 'nonexistent_okf')}" --json`, { cwd: tempDir, stdio: 'pipe' });
  } catch (e) {
    const errJson = JSON.parse(e.stdout.toString());
    assert.ok(Array.isArray(errJson.otherBranches) && errJson.otherBranches.length > 0, 'maintain should report otherBranches when bundle is missing at target path');
    assert.ok(errJson.error.includes('Hint: An OKF bundle exists on branch'), 'maintain error message should include branch checkout hint');
    branchHintCaught = true;
  }
  assert.ok(branchHintCaught, 'maintain should exit 1 with branch hint when bundle is missing');
  console.log('✓ CRLF steering sync and missing-bundle branch hint verified.');

  // 16e. External --bundle workspaceRoot resolution when invoked from outside the repo
  const externalCwd = os.tmpdir();
  const extPruneJson = JSON.parse(execSync(`node "${scripts.prune}" --check --ghosts --json --bundle "${bundleRoot}"`, { cwd: externalCwd }).toString());
  assert.equal(extPruneJson.totalPrunable, 0, 'okf-prune with external --bundle must resolve workspaceRoot to target repo root');
  const extQueryOut = execSync(`node "${scripts.query}" --file "src/shorthand_sync.ts" --bundle "${bundleRoot}"`, { cwd: externalCwd }).toString();
  assert.ok(extQueryOut.includes('Cloud Sync Service'), 'okf-query --file with external --bundle must resolve against target repo root');
  console.log('✓ External --bundle workspaceRoot resolution verified across tools.');

  console.log('\n======================================');
  console.log('🎉 ALL LIFE CYCLE TEST CASES PASSED SUCCESSFULLY!');
  console.log('======================================');

  // === STEP 17: MONOREPO SUB-PACKAGE BUNDLES, UPGRADE §12/BULLET-LOG/COMMA-RESOURCE, AND FRONTIER CLEANUP ===
  console.log('Step 17: Testing monorepo sub-package bundles, okf-upgrade §12/bullet-log/comma-resource, and frontier cleanup...');

  const subPkgDir = path.join(tempDir, 'packages', 'keepalive-helper');
  const subBundleDir = path.join(subPkgDir, 'okf');
  fs.mkdirSync(path.join(subPkgDir, 'nodeA'), { recursive: true });
  fs.mkdirSync(path.join(subPkgDir, 'nodeB'), { recursive: true });
  fs.mkdirSync(path.join(subPkgDir, '__pycache__'), { recursive: true });
  fs.mkdirSync(subBundleDir, { recursive: true });

  fs.writeFileSync(path.join(subPkgDir, 'deploy.py'), 'print("deploy")\n');
  fs.writeFileSync(path.join(subPkgDir, 'nodeA', 'cfg.conf'), 'state MASTER\n');
  fs.writeFileSync(path.join(subPkgDir, 'nodeB', 'cfg.conf'), 'state BACKUP\n');
  fs.writeFileSync(path.join(subPkgDir, '__pycache__', 'deploy.cpython-311.pyc'), 'bytecode');
  fs.writeFileSync(path.join(tempDir, '.gitignore'), 'ignored_by_root.txt\n');
  fs.writeFileSync(path.join(subPkgDir, 'ignored_by_root.txt'), 'should be ignored via parent gitignore\n');

  // Sub-package index.md with extra legacy frontmatter keys and CRLF
  fs.writeFileSync(
    path.join(subBundleDir, 'index.md'),
    [
      '---',
      'okf_version: 0.2',
      'type: Index',
      'title: KeepAlive Index',
      'generated:',
      '  by: agent:claude-code/okf-bootstrap',
      '  at: 2026-03-08T00:00:00Z',
      '---',
      '',
      '# KeepAlive Bundle',
      '',
      '- [Live Configs](live-configs.md)'
    ].join('\r\n') + '\r\n',
    'utf8'
  );

  // Sub-package concept with comma-separated resource: and agent: prefix and CRLF
  fs.writeFileSync(
    path.join(subBundleDir, 'live-configs.md'),
    [
      '---',
      'type: Configuration',
      'title: Live Configs',
      'description: Node A and Node B live configs.',
      'resource: nodeA/, nodeB/',
      'generated:',
      '  by: agent:claude-code/okf-bootstrap',
      '  at: 2026-03-08T00:00:00Z',
      'sources:',
      '  - deploy.py',
      '---',
      '',
      '# Live Configs',
      'Covers [Live Configs](live-configs.md).'
    ].join('\r\n') + '\r\n',
    'utf8'
  );

  // Sub-package log.md with bullet-style dates and CRLF
  fs.writeFileSync(
    path.join(subBundleDir, 'log.md'),
    [
      '# Log',
      '',
      'Chronological record.',
      '',
      '- **2026-03-08** — Bundle bootstrapped by `agent:claude-code/okf-bootstrap`.',
      '- **2026-03-08** — Visualization generated (`viz.html`).'
    ].join('\r\n') + '\r\n',
    'utf8'
  );

  // 17a. Run okf-upgrade with --bundle okf from inside sub-package
  execSync(`node "${scripts.upgrade}" --bundle okf --user lbarrios`, { cwd: subPkgDir, stdio: 'ignore' });

  const upgradedSubIndex = fs.readFileSync(path.join(subBundleDir, 'index.md'), 'utf8');
  assert.ok(upgradedSubIndex.includes('\r\n'), 'okf-upgrade must preserve CRLF in root index.md');
  assert.ok(!upgradedSubIndex.includes('type: Index'), 'okf-upgrade must strip non-okf_version keys from root index.md (§12)');

  const upgradedSubConcept = fs.readFileSync(path.join(subBundleDir, 'live-configs.md'), 'utf8');
  assert.ok(upgradedSubConcept.includes('\r\n'), 'okf-upgrade must preserve CRLF in concept files');
  assert.ok(upgradedSubConcept.includes('resource: nodeA/'), 'okf-upgrade must split comma-separated resource into primary resource');
  assert.ok(upgradedSubConcept.includes('- nodeB/'), 'okf-upgrade must add split comma-separated paths to sources');
  assert.ok(upgradedSubConcept.includes('by: claude-code/okf-bootstrap'), 'okf-upgrade must strip agent: prefix');

  const upgradedSubLog = fs.readFileSync(path.join(subBundleDir, 'log.md'), 'utf8');
  assert.ok(upgradedSubLog.includes('\r\n'), 'okf-upgrade must preserve CRLF in log.md');
  assert.ok(upgradedSubLog.includes('## 2026-03-08\r\n- Bundle bootstrapped by `claude-code/okf-bootstrap`.\r\n- Visualization generated (`viz.html`).'), 'okf-upgrade must normalize bullet-dated log entries into ## YYYY-MM-DD sections');

  // 17b. Verify lint --bundle okf inside sub-package resolves workspaceRoot to subPkgDir (0 warnings!)
  const subLintJson = JSON.parse(execSync(`node "${scripts.lint}" --bundle okf --json`, { cwd: subPkgDir }).toString());
  assert.equal(subLintJson.errors.length, 0, 'Sub-package lint with --bundle okf should have 0 errors');
  assert.equal(subLintJson.warnings.length, 0, 'Sub-package lint with --bundle okf should have 0 warnings (no false missing-resource warnings)');

  // 17c. Inject a stale __pycache__ bullet into index.md and run maintain inside sub-package
  fs.writeFileSync(
    path.join(subBundleDir, 'index.md'),
    upgradedSubIndex.trimEnd() + '\r\n\r\n## Not yet specified\r\n- `__pycache__/deploy.cpython-311.pyc` — Undocumented codebase file.\r\n- `deleted_ghost.py` — Undocumented codebase file.\r\n',
    'utf8'
  );
  execSync(`node "${scripts.maintain}"`, { cwd: subPkgDir, stdio: 'ignore' });
  const maintainedSubIndex = fs.readFileSync(path.join(subBundleDir, 'index.md'), 'utf8');
  assert.ok(!maintainedSubIndex.includes('__pycache__'), 'okf-maintain must remove excluded __pycache__/*.pyc bullets from ## Not yet specified');
  assert.ok(!maintainedSubIndex.includes('deleted_ghost.py'), 'okf-maintain must remove deleted file bullets from ## Not yet specified');
  assert.ok(!maintainedSubIndex.includes('ignored_by_root.txt'), 'okf-maintain must inherit ancestor .gitignore rules from monorepo root');
  const subDriftLintJson = JSON.parse(execSync(`node "${scripts.lint}" --bundle okf --drift --json`, { cwd: subPkgDir }).toString());
  assert.equal(subDriftLintJson.warnings.length, 0, 'Sub-package lint --drift after maintain should have 0 warnings');
  console.log('✓ Monorepo sub-package --bundle resolution, upgrade §12/bullet-log/comma-resource, and frontier cleanup verified.');

  // === STEP 18: PERCENT-ENCODED (%20) & FRAGMENT (#) FILE URIS, GIT: URIS, BACKTICK LINK LABELS, AND HAND-WRITTEN FRONTIER NOTES ===
  console.log('Step 18: Testing %20/fragment/git: URIs, backtick link labels, and multi-line hand-written frontier notes...');

  const spaceWorkspaceDir = path.join(tempDir, 'BluB0X DDE Integrations', 'OtisAuditor');
  const spaceBundleDir = path.join(spaceWorkspaceDir, 'okf');
  fs.mkdirSync(spaceBundleDir, { recursive: true });

  const spaceCodeFile = path.join(spaceWorkspaceDir, 'OtisCommsAI.cs');
  const spaceCompanionFile = path.join(spaceWorkspaceDir, 'otis_journal_parse.py');
  const spaceEllipsisSqlFile = path.join(spaceWorkspaceDir, 'GetPersonAuthorizedFloorStopsWithTurnstiles_2026_09_28_denialfix.sql');
  const childSubPkgOkfDir = path.join(spaceWorkspaceDir, 'troubleshoot_dde_access', 'okf');
  fs.mkdirSync(childSubPkgOkfDir, { recursive: true });
  fs.writeFileSync(path.join(childSubPkgOkfDir, 'index.md'), '---\r\nokf_version: 0.2\r\n---\r\n# Nested Bundle\r\n');
  fs.writeFileSync(path.join(spaceWorkspaceDir, 'troubleshoot_dde_access', 'otis_floor_access_check.py'), 'def check(): pass\r\n');
  fs.writeFileSync(spaceCodeFile, 'class OtisCommsAI {}\r\n');
  fs.writeFileSync(spaceCompanionFile, 'def parse(): pass\r\n');
  fs.writeFileSync(spaceEllipsisSqlFile, 'ALTER PROCEDURE Otis.GetPersonAuthorizedFloorStopsWithTurnstiles AS RETURN;\r\n');
  fs.writeFileSync(path.join(spaceWorkspaceDir, 'README.md'), '# OtisAuditor\r\n');
  fs.writeFileSync(path.join(spaceWorkspaceDir, 'CLAUDE.md'), '# Non-OKF notes\r\n');

  const encodedWorkspaceUri = 'file:///' + spaceWorkspaceDir.replace(/\\/g, '/').replace(/ /g, '%20');
  const spaceLogPath = path.join(spaceBundleDir, 'log.md');
  fs.writeFileSync(
    spaceLogPath,
    [
      '# OKF Bundle Update Log',
      '',
      '- 2026-09-29 — Recorded initial journal anatomy.'
    ].join('\r\n') + '\r\n',
    'utf8'
  );

  const spaceConceptPath = path.join(spaceBundleDir, 'interface-journal.md');
  const spaceNowISO = new Date(Date.now() + 2000).toISOString();
  fs.writeFileSync(
    spaceConceptPath,
    [
      '---',
      'type: Log Format',
      'title: OtisInterface Journal Anatomy',
      'description: How to read an OtisInterface.service journald capture.',
      `resource: ${encodedWorkspaceUri}/OtisCommsAI.cs`,
      'generated:',
      '  by: claude-code/opus-5.5',
      `  at: ${spaceNowISO}`,
      'sources:',
      '  - id: field-confirmation',
      `    resource: ${encodedWorkspaceUri}/okf/log.md#2026-09-29`,
      '    title: "Log confirmation entry"',
      '    author: human:lbarrios',
      '  - id: historical-git-source',
      '    resource: git:323eae6:OtisInterface/OtisComms.cs',
      '    title: "Historical OtisComms.cs removed after 323eae6"',
      '---',
      '',
      '# OtisInterface Journal Anatomy',
      'Cross-references [`OtisCommsAI.cs`](/interface-journal.md), parses with `otis_journal_parse.py`, and applies `…_2026_09_28_denialfix.sql`.'
    ].join('\r\n') + '\r\n',
    'utf8'
  );

  const handWrittenIndex = [
    '---',
    'okf_version: 0.2',
    '---',
    '',
    '# OtisAuditor Knowledge Bundle',
    '',
    '## Concepts',
    '- [OtisInterface Journal Anatomy](/interface-journal.md)',
    '',
    '## Not yet specified',
    '',
    'Observed in this directory tree, not yet captured as concepts:',
    '',
    '- `192.168.2.250` — the non-keypad Otis peer that emitted every duplicate-packet NAK. Which',
    '  device it is, and whether the retransmissions matter, is unestablished.',
    '- `SignalRComms.SimulateFloorRequest` — an operator-triggered simulated floor request, observed failing with',
    '  `Can not find a keypad for the swiped card.` Its keypad-resolution path is undocumented.',
    '- `OtisCommsAI.cs` — the UDP loop side is still unread in detail,',
    '  only the card lookup lines are covered.',
    '- `stale_deleted_auto.py` — Undocumented codebase file.'
  ].join('\r\n') + '\r\n';
  fs.writeFileSync(path.join(spaceBundleDir, 'index.md'), handWrittenIndex, 'utf8');

  execSync('git add . && git commit -m "feat: add space-path bundle with %20 URIs and hand-written frontier notes"', { cwd: tempDir, stdio: 'ignore' });

  // 18a. Lint should report 0 errors and 0 warnings (no false missing resource on %20, #fragment, or git:, and no empty link label '')
  const spaceLintBefore = JSON.parse(execSync(`node "${scripts.lint}" --drift --json`, { cwd: spaceWorkspaceDir }).toString());
  assert.equal(spaceLintBefore.errors.length, 0, 'Lint on %20/fragment/git: bundle must report 0 errors');
  assert.equal(spaceLintBefore.warnings.length, 0, `Lint must report 0 warnings, got: ${JSON.stringify(spaceLintBefore.warnings)}`);

  // 18b. Query --file should resolve %20 resource binding
  const spaceQueryOut = execSync(`node "${scripts.query}" --file OtisCommsAI.cs`, { cwd: spaceWorkspaceDir }).toString();
  assert.ok(spaceQueryOut.includes('OtisInterface Journal Anatomy'), 'okf-query --file must match concept bound via %20-encoded file:// URI');

  // 18c. Maintain must remove only the stale auto-generated bullet, preserve all 3 multi-line hand-written notes intact,
  //      not add README.md/CLAUDE.md or concept-acknowledged otis_journal_parse.py, and insert log entry at top of bullet-dated log.md
  execSync(`node "${scripts.maintain}"`, { cwd: spaceWorkspaceDir, stdio: 'ignore' });
  const spaceIndexAfter = fs.readFileSync(path.join(spaceBundleDir, 'index.md'), 'utf8');
  assert.ok(!spaceIndexAfter.includes('stale_deleted_auto.py'), 'Maintain must remove stale auto-generated bullet');
  assert.ok(
    spaceIndexAfter.includes('- `192.168.2.250` — the non-keypad Otis peer that emitted every duplicate-packet NAK. Which\r\n  device it is, and whether the retransmissions matter, is unestablished.'),
    'Maintain must preserve multi-line hand-written note starting with IP address'
  );
  assert.ok(
    spaceIndexAfter.includes('- `SignalRComms.SimulateFloorRequest` — an operator-triggered simulated floor request, observed failing with\r\n  `Can not find a keypad for the swiped card.` Its keypad-resolution path is undocumented.'),
    'Maintain must preserve multi-line hand-written note starting with symbol name'
  );
  assert.ok(
    spaceIndexAfter.includes('- `OtisCommsAI.cs` — the UDP loop side is still unread in detail,\r\n  only the card lookup lines are covered.'),
    'Maintain must preserve multi-line hand-written note starting with covered file path'
  );
  assert.ok(!spaceIndexAfter.includes('Undocumented codebase file.'), 'Maintain must not add %20-bound, concept-mentioned, or README/CLAUDE files as undocumented');

  const spaceLogAfter = fs.readFileSync(spaceLogPath, 'utf8');
  const newHeadingPos = spaceLogAfter.indexOf('## 20');
  const oldBulletPos = spaceLogAfter.indexOf('- 2026-09-29');
  assert.ok(newHeadingPos !== -1 && newHeadingPos < oldBulletPos, 'Maintain must insert new date heading before older bullet-dated log entries');

  // 18d. Subsequent lint --drift must still have 0 warnings (appending to log.md must not cause drift on log.md#2026-09-29 source)
  const spaceLintAfter = JSON.parse(execSync(`node "${scripts.lint}" --drift --json`, { cwd: spaceWorkspaceDir }).toString());
  assert.equal(spaceLintAfter.warnings.length, 0, `Lint after maintain must still have 0 warnings, got: ${JSON.stringify(spaceLintAfter.warnings)}`);
  console.log('✓ %20/fragment/git: URIs, backtick link labels, and hand-written frontier notes verified.');

  // === STEP 19: OKF-UPGRADE --SKILLS MULTI-AGENT SKILL INSTALLER & UPDATER ===
  console.log('Step 19: Testing okf-upgrade --skills multi-agent skill installation (Antigravity, Claude profiles, Codex, Universal)...');
  const fakeHomeDir = path.join(tempDir, 'fake-home');
  fs.mkdirSync(path.join(fakeHomeDir, '.claude-blub0x'), { recursive: true });
  fs.mkdirSync(path.join(fakeHomeDir, '.codex-work'), { recursive: true });
  fs.mkdirSync(path.join(fakeHomeDir, '.agents', 'skills', 'okf'), { recursive: true });
  fs.mkdirSync(path.join(fakeHomeDir, '.claude', 'skills'), { recursive: true });
  // Simulate npx skills directory junction from .claude/skills/okf -> .agents/skills/okf
  fs.symlinkSync(
    path.join(fakeHomeDir, '.agents', 'skills', 'okf'),
    path.join(fakeHomeDir, '.claude', 'skills', 'okf'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );

  const repoRootDir = path.resolve(__dirname, '..');
  const upgradeSkillsOut = execSync(
    `node "${scripts.upgrade}" --skills --home "${fakeHomeDir}" --source "${repoRootDir}"`,
    { cwd: tempDir }
  ).toString();

  const expectedAgentDirs = [
    path.join(fakeHomeDir, '.gemini', 'config', 'skills'),
    path.join(fakeHomeDir, '.claude', 'skills'),
    path.join(fakeHomeDir, '.claude-blub0x', 'skills'),
    path.join(fakeHomeDir, '.codex', 'skills'),
    path.join(fakeHomeDir, '.codex-work', 'skills'),
    path.join(fakeHomeDir, '.agents', 'skills')
  ];
  for (const agentSkillDir of expectedAgentDirs) {
    assert.ok(
      fs.existsSync(path.join(agentSkillDir, 'okf-maintain', 'scripts', 'maintain.js')),
      `okf-upgrade --skills must install okf-maintain into ${agentSkillDir}`
    );
    assert.ok(
      fs.existsSync(path.join(agentSkillDir, 'okf-upgrade', 'scripts', 'upgrade.js')),
      `okf-upgrade --skills must install okf-upgrade into ${agentSkillDir}`
    );
  }
  assert.ok(upgradeSkillsOut.includes('Operation complete'), 'okf-upgrade --skills should print completion summary');
  console.log('✓ okf-upgrade --skills synchronized all 8 skills across Antigravity, Claude profiles, Codex profiles, and Universal directories.');

  // === STEP 20: SKILL EVALUATION IMPROVEMENTS (WINDOWS STEERING PATHS, MEDIA FRONTIER, COMMA RESOURCE SPLIT, AUTO-INDEXING) ===
  console.log('Step 20: Testing skill evaluation improvements (Windows ~/ steering fix, static media exclusion, comma resource split, unindexed concept auto-indexing)...');

  // 20a. Windows PowerShell ~/ path fix in resolveSkillsBase & inspectAndSyncSteeringFile
  const maintainMod = require(scripts.maintain);
  const simulatedHome = path.join(tempDir, 'sim-home');
  const simulatedSkillsRoot = path.join(simulatedHome, '.gemini', 'config', 'skills');
  const externalWorkspace = path.join(tempDir, 'external-project');
  fs.mkdirSync(simulatedSkillsRoot, { recursive: true });
  fs.mkdirSync(path.join(externalWorkspace, 'okf', 'concepts'), { recursive: true });

  const winSkillsBase = maintainMod.resolveSkillsBase(externalWorkspace, {
    skillsRoot: simulatedSkillsRoot,
    homeDir: simulatedHome,
    platform: 'win32'
  });
  assert.ok(!winSkillsBase.startsWith('~/'), `Windows resolveSkillsBase must not emit ~/ (got: ${winSkillsBase})`);
  assert.strictEqual(winSkillsBase, simulatedSkillsRoot.replace(/\\/g, '/') + '/');

  const posixSkillsBase = maintainMod.resolveSkillsBase(externalWorkspace, {
    skillsRoot: simulatedSkillsRoot,
    homeDir: simulatedHome,
    platform: 'linux'
  });
  assert.strictEqual(posixSkillsBase, '~/.gemini/config/skills/');

  const winSteeringPath = path.join(externalWorkspace, 'AGENTS.md');
  fs.writeFileSync(
    winSteeringPath,
    `# Agent Steering\n\n` +
      maintainMod.buildSteeringDirectivesBlock('okf', '1.8.2', '~/.gemini/config/skills/') +
      `\n`
  );
  const winSteeringCheck = maintainMod.inspectAndSyncSteeringFile(
    winSteeringPath,
    externalWorkspace,
    path.join(externalWorkspace, 'okf'),
    '1.8.2',
    true,
    { skillsRoot: simulatedSkillsRoot, homeDir: simulatedHome, platform: 'win32' }
  );
  assert.strictEqual(winSteeringCheck.outdated, true, 'Windows steering file containing node ~/ must be detected as outdated even at matching version');

  const winSteeringSync = maintainMod.inspectAndSyncSteeringFile(
    winSteeringPath,
    externalWorkspace,
    path.join(externalWorkspace, 'okf'),
    '1.8.2',
    false,
    { skillsRoot: simulatedSkillsRoot, homeDir: simulatedHome, platform: 'win32' }
  );
  assert.strictEqual(winSteeringSync.updated, true, 'Windows steering file containing node ~/ must be auto-healed');
  const healedWinSteering = fs.readFileSync(winSteeringPath, 'utf8');
  assert.ok(!healedWinSteering.includes('node ~/'), 'Healed Windows steering file must not contain node ~/');
  assert.ok(healedWinSteering.includes(`node ${winSkillsBase}okf-lint/scripts/lint.js`), 'Healed Windows steering file must use absolute forward-slash path');

  // 20b. Exclude static media/binary/office/archive assets from frontier & self-heal existing bullets
  fs.mkdirSync(path.join(externalWorkspace, 'data', 'backup'), { recursive: true });
  fs.mkdirSync(path.join(externalWorkspace, 'src'), { recursive: true });
  fs.writeFileSync(path.join(externalWorkspace, 'data', 'backup', 'watch.jpg'), 'fake-jpg');
  fs.writeFileSync(path.join(externalWorkspace, 'data', 'backup', 'photo.png'), 'fake-png');
  fs.writeFileSync(path.join(externalWorkspace, 'data', 'backup', 'logo.svg'), '<svg></svg>');
  fs.writeFileSync(path.join(externalWorkspace, 'data', 'backup', 'manual.pdf'), 'fake-pdf');
  fs.writeFileSync(path.join(externalWorkspace, 'data', 'backup', 'catalog.xlsx'), 'fake-xlsx');
  fs.writeFileSync(path.join(externalWorkspace, 'data', 'backup', 'archive.zip'), 'fake-zip');
  fs.writeFileSync(path.join(externalWorkspace, 'data', 'backup', 'ticket.pkpass'), 'fake-pkpass');
  fs.writeFileSync(path.join(externalWorkspace, 'src', 'mod_a.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(externalWorkspace, 'src', 'mod_b.js'), 'export const b = 2;\n');

  fs.writeFileSync(path.join(externalWorkspace, 'okf', 'log.md'), '# Log\n\n## 2026-10-01\n- Initial bundle.\n');
  fs.writeFileSync(
    path.join(externalWorkspace, 'okf', 'index.md'),
    `# External Project OKF\n\n## Concepts\n\n## Not yet specified\n- \`data/backup/watch.jpg\` — Undocumented codebase file.\n- \`data/backup/catalog.xlsx\` — Undocumented codebase file.\n`
  );

  // 20c. Create a legacy concept with comma-separated resource: (including a deleted file) AND leave it unindexed in index.md
  const commaConceptPath = path.join(externalWorkspace, 'okf', 'concepts', 'comma_resource.md');
  fs.writeFileSync(
    commaConceptPath,
    `---\ntype: Feature\ntitle: Comma Resource Feature\ndescription: Covers mod_a and mod_b.\nstatus: stable\nresource: src/mod_a.js, src/mod_b.js, src/deleted_mod_c.js\ntimestamp: 2026-10-01T00:00:00Z\n---\n# Comma Resource Feature\n\nCovers mod_a and mod_b.\n`
  );

  execSync(`node "${scripts.upgrade}" --bundle "${path.join(externalWorkspace, 'okf')}"`, { cwd: externalWorkspace });
  const upgradedCommaRaw = fs.readFileSync(commaConceptPath, 'utf8');
  assert.ok(upgradedCommaRaw.includes('resource: src/mod_a.js'), 'upgrade.js must set primary resource to first existing file');
  assert.ok(upgradedCommaRaw.includes('- src/mod_b.js'), 'upgrade.js must move second existing file into sources');
  assert.ok(!upgradedCommaRaw.includes('- src/mod_a.js'), 'upgrade.js must NOT duplicate primary resource inside sources');
  assert.ok(!upgradedCommaRaw.includes('deleted_mod_c.js'), 'upgrade.js must NOT add non-existent split files into sources');

  // Verify wayfinder_taxonomy excludes static media assets from frontier
  const extTaxonomy = JSON.parse(
    execSync(`node "${scripts.taxonomy}" --bundle "${path.join(externalWorkspace, 'okf')}"`, { cwd: externalWorkspace }).toString()
  );
  assert.ok(!extTaxonomy.frontier.some(f => /\.(jpg|png|svg|pdf|xlsx|zip|pkpass)$/i.test(f.path || f)), `wayfinder_taxonomy frontier must exclude static media/office/archive assets, got: ${JSON.stringify(extTaxonomy.frontier)}`);

  // 20d. Unindexed active concept detection & auto-indexing in maintain.js
  let extMaintainCheckFailed = false;
  let extMaintainCheckJson = null;
  try {
    execSync(`node "${scripts.maintain}" --bundle "${path.join(externalWorkspace, 'okf')}" --check --json`, { cwd: externalWorkspace, stdio: 'pipe' });
  } catch (err) {
    extMaintainCheckFailed = true;
    extMaintainCheckJson = JSON.parse(err.stdout.toString());
  }
  assert.strictEqual(extMaintainCheckFailed, true, 'maintain --check must fail when an active concept is unindexed or frontier has stale media bullets');
  assert.ok(
    Array.isArray(extMaintainCheckJson.unindexedConcepts) && extMaintainCheckJson.unindexedConcepts.includes('concepts/comma_resource.md'),
    `maintain --check --json must report unindexedConcepts including concepts/comma_resource.md, got: ${JSON.stringify(extMaintainCheckJson)}`
  );

  execSync(`node "${scripts.maintain}" --bundle "${path.join(externalWorkspace, 'okf')}"`, { cwd: externalWorkspace });
  const extIndexAfter = fs.readFileSync(path.join(externalWorkspace, 'okf', 'index.md'), 'utf8');
  assert.ok(!extIndexAfter.includes('watch.jpg'), 'maintain must remove auto-generated .jpg bullet from ## Not yet specified');
  assert.ok(!extIndexAfter.includes('catalog.xlsx'), 'maintain must remove auto-generated .xlsx bullet from ## Not yet specified');
  assert.ok(extIndexAfter.includes('[Comma Resource Feature](/concepts/comma_resource.md)'), 'maintain must auto-index unindexed active concept into index.md');

  const extMaintainAfterJson = JSON.parse(
    execSync(`node "${scripts.maintain}" --bundle "${path.join(externalWorkspace, 'okf')}" --check --json`, { cwd: externalWorkspace }).toString()
  );
  assert.strictEqual(extMaintainAfterJson.inSync, true, 'maintain --check must pass after auto-indexing and media frontier cleanup');
  assert.strictEqual(extMaintainAfterJson.unindexedConcepts.length, 0, 'unindexedConcepts must be empty after maintain');

  // === STEP 21: QUERY PRECISION, BASENAME FALLBACK, OUTPUT BUDGETING & BATCHED GIT LOG ===
  console.log('Step 21: Testing okf-query primary vs secondary ranking, basename fallback, search output budgeting, and batched git log...');

  const queryPerfWorkspace = path.join(tempDir, 'query-perf-project');
  const queryPerfBundle = path.join(queryPerfWorkspace, 'okf');
  fs.mkdirSync(path.join(queryPerfBundle, 'z_frontend'), { recursive: true });
  fs.mkdirSync(path.join(queryPerfBundle, 'specs'), { recursive: true });
  fs.mkdirSync(path.join(queryPerfWorkspace, 'src', 'routes'), { recursive: true });
  fs.writeFileSync(path.join(queryPerfWorkspace, 'admin_panel.js'), 'console.log("admin panel");\n');
  fs.writeFileSync(path.join(queryPerfWorkspace, 'src', 'routes', 'settings_route.js'), 'console.log("settings route");\n');
  fs.writeFileSync(path.join(queryPerfBundle, 'index.md'), '---\nokf_version: 0.2\n---\n# Query Perf OKF\n\n## Concepts\n\n## Not yet specified\n');
  fs.writeFileSync(path.join(queryPerfBundle, 'log.md'), '# Log\n');

  for (let i = 1; i <= 5; i++) {
    fs.writeFileSync(
      path.join(queryPerfBundle, 'specs', `a_spec_${i}.md`),
      `---\ntype: Specification\ntitle: Secondary Spec ${i}\ndescription: Cross-cutting specification ${i} referencing admin_panel.\nresource: src/routes/settings_route.js\nsources:\n  - admin_panel.js\ngenerated:\n  by: Antigravity/4.0\n  at: 2026-11-04T00:00:00Z\n---\n# Secondary Spec ${i}\n\nSECONDARY_BODY_MARKER_${i} mentions global config store admin settings in body text.\n`
    );
  }

  fs.writeFileSync(
    path.join(queryPerfBundle, 'z_frontend', 'z_admin_panel.md'),
    `---\ntype: Module\ntitle: Primary Admin Panel Module\ndescription: Global config store admin panel primary module.\nresource: admin_panel.js\ntags: [global, config, store, admin]\ngenerated:\n  by: Antigravity/4.0\n  at: 2026-11-04T00:00:00Z\n---\n# Primary Admin Panel Module\n\nPRIMARY_ADMIN_PANEL_BODY_MARKER with full architectural details.\n`
  );

  fs.writeFileSync(
    path.join(queryPerfBundle, 'specs', 'a_spec_6.md'),
    `---\ntype: Specification\ntitle: Secondary Spec 6\ndescription: Another spec.\nresource: src/routes/settings_route.js\ngenerated:\n  by: Antigravity/4.0\n  at: 2026-11-04T00:00:00Z\n---\n# Secondary Spec 6\n\nSECONDARY_BODY_MARKER_6 also mentions global config store admin in body.\n`
  );

  // 21a. Primary resource concept must rank FIRST on --file admin_panel.js, and secondary sources: beyond top 3 must be compact unless --full is passed
  const fileQueryOut = execSync(`node "${scripts.query}" --file admin_panel.js`, { cwd: queryPerfWorkspace }).toString();
  const primaryPos = fileQueryOut.indexOf('[Concept: Primary Admin Panel Module]');
  const firstSecondaryPos = fileQueryOut.indexOf('[Concept: Secondary Spec 1]');
  assert.ok(primaryPos !== -1 && firstSecondaryPos !== -1 && primaryPos < firstSecondaryPos, 'Primary resource: concept must appear before secondary sources: concepts');
  assert.ok(fileQueryOut.includes('PRIMARY_ADMIN_PANEL_BODY_MARKER'), 'Primary resource concept body must be included in full');
  assert.ok(!fileQueryOut.includes('SECONDARY_BODY_MARKER_5'), 'Secondary sources: concepts beyond top 3 budget must omit full body by default');
  assert.ok(fileQueryOut.includes('Matched via secondary sources: binding'), 'Compacted secondary concepts must include explanatory summary note');

  const fileQueryFullOut = execSync(`node "${scripts.query}" --file admin_panel.js --full`, { cwd: queryPerfWorkspace }).toString();
  assert.ok(fileQueryFullOut.includes('SECONDARY_BODY_MARKER_5'), '--full must print full bodies for all secondary sources: concepts');

  // 21b. Suffix / Basename fallback when agent guesses wrong directory prefix (e.g. js/admin_panel.js or routes/settings_route.js)
  const basenameQueryOut = execSync(`node "${scripts.query}" --file js/admin_panel.js`, { cwd: queryPerfWorkspace }).toString();
  assert.ok(basenameQueryOut.includes('[Concept: Primary Admin Panel Module]'), 'okf-query --file js/admin_panel.js must resolve admin_panel.js via basename fallback');

  const suffixQueryOut = execSync(`node "${scripts.query}" --file routes/settings_route.js`, { cwd: queryPerfWorkspace }).toString();
  assert.ok(suffixQueryOut.includes('[Concept: Secondary Spec 1]'), 'okf-query --file routes/settings_route.js must resolve src/routes/settings_route.js via suffix/basename fallback');

  // 21c. Search header-weighted ranking and top-5 full-body budget
  const searchOut = execSync(`node "${scripts.query}" --search "global config store admin"`, { cwd: queryPerfWorkspace }).toString();
  const searchPrimaryPos = searchOut.indexOf('[Concept: Primary Admin Panel Module]');
  const searchSpec1Pos = searchOut.indexOf('[Concept: Secondary Spec 1]');
  assert.ok(searchPrimaryPos !== -1 && searchPrimaryPos < searchSpec1Pos, 'Concept matching search tokens in title/tags/description must rank above body-only matches');
  assert.ok(searchOut.includes('[Concept: Secondary Spec 6]'), 'All matching concepts must still have their header block listed in search output');
  assert.ok(!searchOut.includes('SECONDARY_BODY_MARKER_6'), 'Search matches ranked #6+ must omit full body by default');
  assert.ok(searchOut.includes('Additional search match ['), 'Compacted search matches #6+ must include explanatory summary note');

  const searchFullOut = execSync(`node "${scripts.query}" --search "global config store admin" --full`, { cwd: queryPerfWorkspace }).toString();
  assert.ok(searchFullOut.includes('SECONDARY_BODY_MARKER_6'), '--search with --full must include all matched bodies');

  // 21d. Batched git log commit timestamp map in maintain.js and lint.js
  const lintMod = require(scripts.lint);
  assert.strictEqual(typeof maintainMod.getRepoCommitTimeMap, 'function', 'maintain.js must export getRepoCommitTimeMap');
  assert.strictEqual(typeof lintMod.getRepoCommitTimeMap, 'function', 'lint.js must export getRepoCommitTimeMap');
  const repoCommitMap = maintainMod.getRepoCommitTimeMap(tempDir);
  assert.ok(repoCommitMap instanceof Map && repoCommitMap.size > 0, 'getRepoCommitTimeMap must populate commit timestamps in batch');
  console.log('✓ okf-query primary ranking, basename fallback, search output budgeting, and batched git log verified.');

  // === STEP 22: SKILL SELF-IMPROVEMENT TELEMETRY, PRE-COMPLETION NUDGE & --EVALUATE ANALYZER ===
  console.log('Step 22: Testing passive skill telemetry (~/.okf/telemetry.jsonl), maintain.js anomaly nudge, and maintain.js --evaluate...');

  const customTelemetryPath = path.join(tempDir, 'custom-telemetry', 'telemetry.jsonl');
  const telEnv = { ...process.env, OKF_TELEMETRY_PATH: customTelemetryPath, OKF_DISABLE_TELEMETRY: '0' };

  // 22a. Trigger a query miss and a basename fallback rescue in queryPerfWorkspace
  execSync(`node "${scripts.query}" --file unknown_folder/totally_missing_file.js`, { cwd: queryPerfWorkspace, env: telEnv });
  execSync(`node "${scripts.query}" --file js/admin_panel.js`, { cwd: queryPerfWorkspace, env: telEnv });

  assert.ok(fs.existsSync(customTelemetryPath), 'OKF scripts must create and append to telemetry.jsonl');
  const telLines = fs.readFileSync(customTelemetryPath, 'utf8').trim().split(/\r?\n/).map(l => JSON.parse(l));
  assert.strictEqual(telLines.length, 2, 'Two query invocations must produce 2 telemetry records');
  assert.ok(telLines[0].anomalies.includes('query_miss'), 'First query must record query_miss anomaly');
  assert.ok(telLines[1].anomalies.includes('fallback_used'), 'Second query must record fallback_used anomaly');

  // 22b. Running maintain.js in queryPerfWorkspace must emit the self-improvement nudge once, and not repeat on a clean second run
  const maintainNudgeOut1 = execSync(`node "${scripts.maintain}"`, { cwd: queryPerfWorkspace, env: telEnv }).toString();
  assert.ok(maintainNudgeOut1.includes('[OKF Self-Improvement]'), 'maintain.js must print [OKF Self-Improvement] nudge when session anomalies exist');
  assert.ok(maintainNudgeOut1.includes('1 query miss'), 'maintain.js nudge must summarize the query miss count');

  const maintainNudgeOut2 = execSync(`node "${scripts.maintain}"`, { cwd: queryPerfWorkspace, env: telEnv }).toString();
  assert.ok(!maintainNudgeOut2.includes('[OKF Self-Improvement]'), 'maintain.js must not repeat nudge when no new anomalies occurred since last maintain sync');

  // 22c. Create a mock conversation transcript and run maintain.js --evaluate
  const mockBrainDir = path.join(tempDir, 'mock-brain');
  const mockConvId = 'conv-eval-test-001';
  const mockConvDir = path.join(mockBrainDir, mockConvId, '.system_generated');
  fs.mkdirSync(path.join(mockConvDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(mockConvDir, 'steps', '3'), { recursive: true });

  // Write a >50KB step output file to simulate context bloat truncation
  // Write a >50KB step output file to simulate context bloat truncation, plus a >50KB non-OKF test log and a 15KB sub-threshold OKF block
  fs.writeFileSync(path.join(mockConvDir, 'steps', '3', 'output.txt'), '=== OKF CONTEXT BLOCK (15 concept(s) found) ===\n' + 'X'.repeat(55000));
  fs.mkdirSync(path.join(mockConvDir, 'steps', '8'), { recursive: true });
  fs.writeFileSync(path.join(mockConvDir, 'steps', '8', 'output.txt'), 'PASS tests/batch-import.test.js\n' + 'J'.repeat(60000));
  fs.mkdirSync(path.join(mockConvDir, 'steps', '9'), { recursive: true });
  fs.writeFileSync(path.join(mockConvDir, 'steps', '9', 'output.txt'), '=== OKF CONTEXT BLOCK (2 concept(s) found) ===\n' + 'Y'.repeat(15000));

  const mockTranscriptSteps = [
    {
      step_index: 0,
      source: 'USER_EXPLICIT',
      type: 'USER_INPUT',
      status: 'DONE',
      created_at: '2026-11-04T20:00:00Z',
      content: '<USER_REQUEST>fix slow save</USER_REQUEST>'
    },
    {
      step_index: 1,
      source: 'MODEL',
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      created_at: '2026-11-04T20:00:05Z',
      input_tokens: 5000,
      cache_read_tokens: 10000,
      output_tokens: 300,
      tool_calls: [
        { name: 'run_command', args: { CommandLine: 'node okf-lint/scripts/lint.js --drift; node okf-query/scripts/query.js --file js/missing_guess.js' } },
        { name: 'run_command', args: { CommandLine: 'node okf-query/scripts/query.js --search "broad query"' } }
      ]
    },
    {
      step_index: 2,
      source: 'MODEL',
      type: 'GENERIC',
      status: 'DONE',
      created_at: '2026-11-04T20:00:08Z',
      content: 'OKF Linting Passed Successfully!\nNo matching OKF concepts found for file: js\\missing_guess.js'
    },
    {
      step_index: 3,
      source: 'MODEL',
      type: 'GENERIC',
      status: 'DONE',
      created_at: '2026-11-04T20:00:10Z',
      content: `The tool's output was truncated due to being too long. You can find the full output in a file at file:///${path.join(mockConvDir, 'steps', '3', 'output.txt').replace(/\\/g, '/')}.`
    },
    {
      step_index: 4,
      source: 'MODEL',
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      created_at: '2026-11-04T20:01:00Z',
      input_tokens: 6000,
      cache_read_tokens: 15000,
      output_tokens: 400,
      tool_calls: [
        { name: 'edit_file', args: { Path: 'D:\\repo\\admin.js' } },
        { name: 'run_command', args: { CommandLine: 'node okf-maintain/scripts/maintain.js; node okf-lint/scripts/lint.js --drift' } }
      ]
    },
    {
      step_index: 5,
      source: 'MODEL',
      type: 'GENERIC',
      status: 'ERROR',
      created_at: '2026-11-04T20:01:02Z',
      content: 'Encountered error in step execution: target content not found in the file; the Target must exactly match existing file text'
    },
    {
      step_index: 6,
      source: 'MODEL',
      type: 'GENERIC',
      status: 'DONE',
      created_at: '2026-11-04T20:01:12Z',
      content: 'Tool is running as a background task with task id: conv-eval-test-001/task-6\nTask Description: node okf-maintain/scripts/maintain.js; node okf-lint/scripts/lint.js --drift'
    },
    {
      step_index: 7,
      source: 'MODEL',
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      created_at: '2026-11-04T20:02:00Z',
      input_tokens: 4000,
      cache_read_tokens: 20000,
      output_tokens: 250,
      content: '**OKF Check:** Cited concepts `frontend/admin-dashboard.md`.'
    },
    {
      step_index: 8,
      source: 'MODEL',
      type: 'GENERIC',
      status: 'DONE',
      created_at: '2026-11-04T20:02:05Z',
      content: `The tool's output was truncated due to being too long. You can find the full output in a file at file:///${path.join(mockConvDir, 'steps', '8', 'output.txt').replace(/\\/g, '/')}.`
    },
    {
      step_index: 9,
      source: 'MODEL',
      type: 'GENERIC',
      status: 'DONE',
      created_at: '2026-11-04T20:02:10Z',
      content: `The tool's output was truncated due to being too long. You can find the full output in a file at file:///${path.join(mockConvDir, 'steps', '9', 'output.txt').replace(/\\/g, '/')}.`
    }
  ];
  fs.writeFileSync(
    path.join(mockConvDir, 'logs', 'transcript.jsonl'),
    mockTranscriptSteps.map(s => JSON.stringify(s)).join('\n') + '\n'
  );

  const evalJsonOut = JSON.parse(
    execSync(`node "${scripts.maintain}" --evaluate ${mockConvId} --brain-dir "${mockBrainDir}" --json`, {
      cwd: queryPerfWorkspace,
      env: telEnv
    }).toString()
  );
  assert.strictEqual(evalJsonOut.conversation.conversationId, mockConvId, '--evaluate must identify target conversation ID');
  assert.strictEqual(evalJsonOut.conversation.gateCompliance.scorePercent, 100, 'Gate compliance must be 100% when all 4 gates are present');
  assert.strictEqual(evalJsonOut.conversation.friction.queryMisses.length, 1, '--evaluate must detect query miss in transcript');
  assert.ok(evalJsonOut.conversation.friction.queryMisses[0].missedTarget.includes('missing_guess.js'), '--evaluate must extract missed file path');
  assert.strictEqual(evalJsonOut.conversation.friction.contextBloat.length, 1, '--evaluate must detect truncated >40KB context bloat');
  assert.ok(evalJsonOut.conversation.friction.contextBloat[0].bytes >= 55000, '--evaluate must measure truncated step output bytes');
  assert.strictEqual(evalJsonOut.conversation.friction.slowCommands.length, 1, '--evaluate must detect backgrounded OKF command');
  assert.strictEqual(evalJsonOut.conversation.friction.toolErrors.editFileTargetNotFound, 1, '--evaluate must count edit_file target-not-found errors');
  assert.ok(Array.isArray(evalJsonOut.recommendations) && evalJsonOut.recommendations.length >= 2, '--evaluate must synthesize actionable recommendations');

  const evalTextOut = execSync(`node "${scripts.maintain}" --evaluate --latest --brain-dir "${mockBrainDir}"`, {
    cwd: queryPerfWorkspace,
    env: telEnv
  }).toString();
  assert.ok(evalTextOut.includes('OKF Skill Self-Improvement Report'), 'Human-readable --evaluate --latest must render report header');
  assert.ok(evalTextOut.includes(mockConvId), '--evaluate --latest must select the most recent conversation');

  // 22d. --evaluate --reset clears telemetry log
  execSync(`node "${scripts.maintain}" --evaluate --reset`, { cwd: queryPerfWorkspace, env: telEnv });
  // 22d. --evaluate --reset clears telemetry log
  execSync(`node "${scripts.maintain}" --evaluate --reset`, { cwd: queryPerfWorkspace, env: telEnv });
  assert.strictEqual(fs.readFileSync(customTelemetryPath, 'utf8').trim(), '', '--evaluate --reset must clear telemetry.jsonl');

  // 22e. Multi-file --file deduplication and cumulative total output budget (<32KB default vs >40KB --full)
  const multiFileOut = execSync(`node "${scripts.query}" --file admin_panel.js,src/routes/settings_route.js`, { cwd: queryPerfWorkspace, env: telEnv }).toString();
  assert.ok(multiFileOut.includes('[Concept: Primary Admin Panel Module]'), 'Multi-file query must include Primary Admin Panel Module');
  assert.ok(multiFileOut.includes('[Concept: Secondary Spec 1]'), 'Multi-file query must include Secondary Spec 1');
  const spec1Occurrences = multiFileOut.split('[Concept: Secondary Spec 1]').length - 1;
  assert.strictEqual(spec1Occurrences, 1, 'Multi-file query must deduplicate concepts matching multiple queried files');

  for (let i = 1; i <= 4; i++) {
    fs.writeFileSync(
      path.join(queryPerfBundle, 'specs', `a_spec_${i}.md`),
      `---\ntype: Specification\ntitle: Secondary Spec ${i}\ndescription: Heavy spec ${i}.\nresource: src/routes/settings_route.js\nsources:\n  - admin_panel.js\ngenerated:\n  by: Antigravity/4.0\n  at: 2026-11-04T00:00:00Z\n---\n# Secondary Spec ${i}\n\n` + `HEAVY_SECTION_${i}_`.repeat(600) + '\n'
    );
  }
  const budgetedHeavyOut = execSync(`node "${scripts.query}" --file src/routes/settings_route.js`, { cwd: queryPerfWorkspace, env: telEnv }).toString();
  assert.ok(Buffer.byteLength(budgetedHeavyOut, 'utf8') < 32000, 'Default cumulative query budget must keep multi-concept output well under the 40KB bloat threshold');
  const fullHeavyOut = execSync(`node "${scripts.query}" --file src/routes/settings_route.js --full`, { cwd: queryPerfWorkspace, env: telEnv }).toString();
  assert.ok(Buffer.byteLength(fullHeavyOut, 'utf8') > 40000, '--full must bypass cumulative output budget and print all concept bodies');
  console.log('✓ Skill self-improvement telemetry, pre-completion nudge, and --evaluate transcript analyzer verified.');
  console.log('✓ okf-query primary ranking, basename fallback, search output budgeting, and batched git log verified.');
  console.log('✓ Windows ~/ steering fix, static media frontier exclusion, smart comma resource split, and unindexed concept auto-indexing verified.');

} finally {
  // Cleanup temp files
  fs.rmSync(tempDir, { recursive: true, force: true });
}
