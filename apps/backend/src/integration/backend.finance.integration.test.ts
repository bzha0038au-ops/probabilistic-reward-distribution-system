import { describeIntegrationSuite } from './integration-test-support';
import { registerFinanceCryptoScenarios } from './backend.finance.crypto.integration.scenarios';
import { registerFinanceUserScenarios } from './backend.finance.user.integration.scenarios';
import { registerFinanceWebhookScenarios } from './backend.finance.webhook.integration.scenarios';

describeIntegrationSuite('backend finance integration', () => {
  registerFinanceUserScenarios();
  registerFinanceCryptoScenarios();
  registerFinanceWebhookScenarios();
});
