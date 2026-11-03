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

  console.log('\n======================================');
  console.log('🎉 ALL LIFE CYCLE TEST CASES PASSED SUCCESSFULLY!');
  console.log('======================================');

} finally {
  // Cleanup temp files
  fs.rmSync(tempDir, { recursive: true, force: true });
}
