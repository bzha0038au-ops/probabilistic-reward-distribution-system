import { describeIntegrationSuite } from './integration-test-support';
import { registerFinanceDrillScenarios } from './backend.finance.drill.integration.scenarios';

describeIntegrationSuite('backend finance drill integration', () => {
  registerFinanceDrillScenarios();
});
