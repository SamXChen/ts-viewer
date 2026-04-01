import { assert, loadUsageScenarios, runScenario } from './lib/fixture-smoke';

main();

function main() {
  const scenarios = loadUsageScenarios();

  for (const scenario of scenarios) {
    const typeText = runScenario(scenario);
    for (const expectedText of scenario.expectedIncludes) {
      assert(
        typeText.includes(expectedText),
        `Scenario ${scenario.name} did not include expected text: ${expectedText}\nActual:\n${typeText}`,
      );
    }
  }

  console.log(`Fixture usage smoke passed for ${scenarios.length} scenario(s).`);
}
