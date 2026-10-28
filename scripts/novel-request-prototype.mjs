#!/usr/bin/env node
/**
 * Local only: runs the fictional novel-request prototype scenario.
 *
 *   node scripts/novel-request-prototype.mjs                 # all fixture scenarios
 *   node scripts/novel-request-prototype.mjs --scenario exact
 *   node scripts/novel-request-prototype.mjs --json
 *
 * Everything here is artificial: `.test` hosts, invented works and authors,
 * an in-memory catalog and an explicit fixture adapter. No network requests are
 * made, nothing is stored, and nothing is published to the site or its catalog.
 */
import {
  FIXTURE_TODAY,
  fixtureConfig,
  fixtureModeration,
  fixtureScenarios,
} from '../src/lib/novel-requests/prototype-fixtures.ts';
import { describeMatches, runPrototypeScenario } from '../src/lib/novel-requests/scenario.ts';

const argv = process.argv.slice(2);
const jsonMode = argv.includes('--json');
const scenarioFlag = argv.indexOf('--scenario');
const requested = scenarioFlag >= 0 ? argv[scenarioFlag + 1] : 'all';

if (scenarioFlag >= 0 && !requested) {
  console.error('Usage: node scripts/novel-request-prototype.mjs [--scenario <name>|all] [--json]');
  process.exit(2);
}

const selected =
  requested === 'all'
    ? fixtureScenarios
    : fixtureScenarios.filter(scenario => scenario.name === requested);

if (selected.length === 0) {
  console.error(`Unknown scenario: ${requested}`);
  console.error(`Available: all, ${fixtureScenarios.map(scenario => scenario.name).join(', ')}`);
  process.exit(2);
}

const results = selected.map(scenario => {
  const result = runPrototypeScenario(
    scenario.input,
    fixtureConfig,
    fixtureModeration,
    FIXTURE_TODAY,
  );
  const stage =
    result.kind === 'rejected' ? 'rejected' : result.kind === 'draft' ? 'draft' : result.request.status;
  return {
    scenario: scenario.name,
    requestId: scenario.input.requestId,
    sourceUrl: scenario.input.url,
    stage,
    result: result.kind === 'rejected' ? result.request : result.draft ?? result.request,
    draftProduced: result.kind === 'draft',
  };
});

if (jsonMode) {
  console.log(
    JSON.stringify(
      {
        mode: 'prototype',
        fictional: true,
        networkUsed: false,
        catalogMutated: false,
        results,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log('Hunmeng novel-request prototype (local, fictional data only)');
console.log('No network, no storage, no publication, no rights verification.');
console.log('');

for (const entry of results) {
  const { scenario, sourceUrl, result, draftProduced, stage } = entry;
  const rejected = result.kind === 'rejected';
  console.log(`=== scenario: ${scenario} ===`);
  console.log(`request: ${entry.requestId}`);
  console.log(`raw URL: ${sourceUrl}`);
  if (rejected) {
    console.log(`stage: rejected (${result.reason})`);
    for (const note of result.notes) console.log(`note: ${note}`);
    console.log('');
    continue;
  }
  console.log(`stage: ${stage}`);
  console.log(`source: ${result.source.provider} / ${result.source.externalId} -> ${result.source.url}`);
  console.log(
    `matches (${result.matches.length}): ${describeMatches(result.matches).join(' | ') || 'none'}`,
  );
  console.log(`merge performed: ${result.mergePerformed ? 'yes' : 'no (advisory only)'}`);
  for (const decision of result.decisions) {
    console.log(
      `decision: ${decision.from} -> ${decision.to} by ${decision.actorId} at ${decision.at}: ${decision.reason}`,
    );
  }
  if (draftProduced) {
    console.log(
      `draft: rights=${result.rights.status} (verifiedBy=${String(result.rights.verifiedBy)}), ` +
        `publication=${result.publicationAllowed ? 'allowed' : 'not allowed'}, network=${result.networkUsed ? 'yes' : 'no'}`,
    );
    console.log(`draft source: ${result.sourceUrl}`);
  }
  for (const note of result.notes) console.log(`note: ${note}`);
  console.log('');
}

console.log('Prototype finished. Nothing was written, fetched or published.');
