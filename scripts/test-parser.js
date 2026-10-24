const assert = require('assert').strict;
const path = require('path');

console.log('Starting OKF Frontmatter Parser Unit Tests...\n');

const parsers = {
  'okf-lint': require('../okf-lint/scripts/lint.js').parseFrontmatter,
  'okf-maintain': require('../okf-maintain/scripts/maintain.js').parseFrontmatter,
  'okf-query': require('../okf-query/scripts/query.js').parseFrontmatter,
  'okf-prune': require('../okf-prune/scripts/prune.js').parseFrontmatter,
  'okf-upgrade': require('../okf-upgrade/scripts/upgrade.js').parseFrontmatter,
  'okf-wayfinder': require('../okf-wayfinder/scripts/wayfinder_taxonomy.js').parseFrontmatter,
  'okf-visualize': (content) => require('../okf-visualize/scripts/visualize.js').parseFrontmatter(content).frontmatter
};

for (const [parserName, parseFm] of Object.entries(parsers)) {
  console.log(`Testing parser in [${parserName}]...`);

  // Test 1: Returns null or empty object on missing frontmatter
  const test1 = parseFm('# Title\n\nNo frontmatter here.');
  if (parserName === 'okf-visualize') {
    assert.deepStrictEqual(test1, {}, `[${parserName}] Test 1 Failed: Should return empty object on missing frontmatter`);
  } else {
    assert.strictEqual(test1, null, `[${parserName}] Test 1 Failed: Should return null on missing frontmatter`);
  }

  // Test 2: Returns null or empty object on unclosed frontmatter
  const test2 = parseFm('---\ntype: Concept\ntitle: Unclosed\n');
  if (parserName === 'okf-visualize') {
    assert.deepStrictEqual(test2, {}, `[${parserName}] Test 2 Failed: Should return empty object on unclosed frontmatter`);
  } else {
    assert.strictEqual(test2, null, `[${parserName}] Test 2 Failed: Should return null on unclosed frontmatter`);
  }

  // Test 3: Basic scalar frontmatter
  const test3 = parseFm(`---
type: Concept
title: Simple Concept
description: A simple test concept.
status: stable
---

# Content
`);
  assert.ok(test3, `[${parserName}] Test 3 Failed: parsed result should be truthy`);
  assert.strictEqual(test3.type, 'Concept');
  assert.strictEqual(test3.title, 'Simple Concept');
  assert.strictEqual(test3.status, 'stable');

  // Test 4: Commas inside quoted scalar strings
  const test4 = parseFm(`---
type: BigQuery Table
title: "Orders, Refunds, and Transactions"
description: "One row per customer order, partitioned by date."
resource: https://example.com/api:v1/data
---
`);
  assert.strictEqual(test4.title, 'Orders, Refunds, and Transactions');
  assert.strictEqual(test4.description, 'One row per customer order, partitioned by date.');
  assert.strictEqual(test4.resource, 'https://example.com/api:v1/data');

  // Test 5: Inline array with commas inside quotes
  const test5 = parseFm(`---
type: Concept
tags: [core, "finance, billing", analytics]
---
`);
  assert.ok(Array.isArray(test5.tags), `[${parserName}] Test 5 Failed: tags should be an array`);
  assert.strictEqual(test5.tags.length, 3);
  assert.strictEqual(test5.tags[0], 'core');
  assert.strictEqual(test5.tags[1], 'finance, billing');
  assert.strictEqual(test5.tags[2], 'analytics');

  // Test 6: Inline object with commas inside quotes
  const test6 = parseFm(`---
type: Concept
author: { name: "Smith, John", role: "architect" }
---
`);
  assert.ok(typeof test6.author === 'object');
  assert.strictEqual(test6.author.name, 'Smith, John');
  assert.strictEqual(test6.author.role, 'architect');

  // Test 7: Multiline array of strings
  const test7 = parseFm(`---
type: Concept
tags:
  - security
  - "auth, oauth2"
  - tokens
---
`);
  assert.ok(Array.isArray(test7.tags));
  assert.strictEqual(test7.tags.length, 3);
  assert.strictEqual(test7.tags[0], 'security');
  assert.strictEqual(test7.tags[1], 'auth, oauth2');
  assert.strictEqual(test7.tags[2], 'tokens');

  // Test 8: Multiline list of inline objects
  const test8 = parseFm(`---
type: Concept
verified:
  - { by: "human:tester, lead", at: 2026-08-01T00:00:00Z }
  - { by: process:ci, at: 2026-08-02T00:00:00Z }
---
`);
  assert.ok(Array.isArray(test8.verified));
  assert.strictEqual(test8.verified.length, 2);
  assert.strictEqual(test8.verified[0].by, 'human:tester, lead');
  assert.strictEqual(test8.verified[0].at, '2026-08-01T00:00:00Z');
  assert.strictEqual(test8.verified[1].by, 'process:ci');

  // Test 9: Multiline list of structured objects (sources)
  const test9 = parseFm(`---
type: Concept
sources:
  - id: doc-1
    resource: https://example.com/api
    title: "API, v2 Documentation"
  - id: doc-2
    resource: /concepts/other.md
    title: Other Concept
---
`);
  assert.ok(Array.isArray(test9.sources));
  assert.strictEqual(test9.sources.length, 2);
  assert.strictEqual(test9.sources[0].id, 'doc-1');
  assert.strictEqual(test9.sources[0].title, 'API, v2 Documentation');
  assert.strictEqual(test9.sources[1].id, 'doc-2');
  assert.strictEqual(test9.sources[1].resource, '/concepts/other.md');

  // Test 10: Nested structured mapping (generated block)
  const test10 = parseFm(`---
type: Concept
generated:
  by: antigravity/3.8
  at: 2026-10-10T12:00:00Z
---
`);
  assert.ok(typeof test10.generated === 'object');
  assert.strictEqual(test10.generated.by, 'antigravity/3.8');
  assert.strictEqual(test10.generated.at, '2026-10-10T12:00:00Z');

  // Test 11: CRLF line endings
  const test11 = parseFm("---\r\ntype: Concept\r\ntitle: Windows CRLF\r\ntags: [crlf, win]\r\n---\r\nBody text\r\n");
  assert.ok(test11);
  assert.strictEqual(test11.type, 'Concept');
  assert.strictEqual(test11.title, 'Windows CRLF');
  assert.deepStrictEqual(test11.tags, ['crlf', 'win']);

  // Test 12: Comments and empty lines inside frontmatter
  const test12 = parseFm(`---
# Leading comment
type: Concept

# Mid comment
title: Comments Inside
# Trailing comment
---
`);
  assert.ok(test12);
  assert.strictEqual(test12.type, 'Concept');
  assert.strictEqual(test12.title, 'Comments Inside');

  // Test 13: Multiline list of shorthand strings in sources (including unquoted file:// and https:// URIs)
  const test13 = parseFm(`---
type: Concept
sources:
  - local-hub/src/sync/cloud-sync.ts
  - file:///D:/projects/okf-skills/src/index.js
  - https://example.com/spec.md
---
`);
  assert.ok(Array.isArray(test13.sources));
  assert.strictEqual(test13.sources.length, 3);
  assert.strictEqual(test13.sources[0], 'local-hub/src/sync/cloud-sync.ts');
  assert.strictEqual(test13.sources[1], 'file:///D:/projects/okf-skills/src/index.js');
  assert.strictEqual(test13.sources[2], 'https://example.com/spec.md');

  console.log(`✓ All 13 test cases passed for [${parserName}].`);
}

console.log('\n======================================');
console.log('🎉 ALL PARSER UNIT TESTS PASSED SUCCESSFULLY!');
console.log('======================================');
