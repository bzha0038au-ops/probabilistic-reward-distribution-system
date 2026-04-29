import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";
import CodeBlock from "@theme/CodeBlock";

import styles from "./index.module.css";

const typescriptSample = `import { createPrizeEngineClient } from "@reward/prize-engine-sdk";

const client = createPrizeEngineClient({
  baseUrl: "https://api.reward.system",
  environment: "sandbox",
  getApiKey: () => process.env.PRIZE_ENGINE_API_KEY ?? null,
});

const reward = await client.reward({
  agent: { agentId: "agent-checkout-bot", groupId: "cohort-a" },
  behavior: { actionType: "checkout.completed", score: 0.82, risk: 0.18 },
  budget: { amount: "3.00", currency: "USD", window: "day" },
  idempotencyKey: "rw-checkout-2026-04-29-0001",
});`;

const pythonSample = `from prize_engine_sdk import PrizeEngineClient, create_idempotency_key

client = PrizeEngineClient(
    base_url="https://api.reward.system",
    environment="sandbox",
    api_key="pe_sandbox_example",
)

reward = client.reward(
    {
        "agent": {"agentId": "agent-checkout-bot", "groupId": "cohort-a"},
        "behavior": {"actionType": "checkout.completed", "score": 0.82, "risk": 0.18},
        "budget": {"amount": "3.00", "currency": "USD", "window": "day"},
        "idempotencyKey": create_idempotency_key(),
    }
)`;

const pillars = [
  {
    title: "Quickstart first",
    description:
      "The landing page leads with copy-pasteable code instead of abstract product copy.",
  },
  {
    title: "OpenAPI as source",
    description:
      "The API explorer reads a generated OpenAPI document, so request and response shapes stay aligned with the shared schemas.",
  },
  {
    title: "Tenant self-serve",
    description:
      "SDK guides, headers, fairness routes, and deprecation behavior are all documented in one place for B-side operators.",
  },
];

export default function Home() {
  return (
    <Layout
      title="Prize Engine Docs"
      description="Self-serve SDK docs and an interactive API explorer for Reward Prize Engine tenants."
    >
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Reward Prize Engine</p>
            <h1>Docs that get a tenant from API key to first reward without guesswork.</h1>
            <p className={styles.subtitle}>
              Browse the API, inspect live schemas, and lift minimal TypeScript or
              Python examples directly into a trusted runtime.
            </p>
            <div className={styles.actions}>
              <Link className="button button--primary button--lg" to="/docs/intro">
                Read Quickstart
              </Link>
              <Link className="button button--secondary button--lg" to="/api-reference">
                Open API Explorer
              </Link>
            </div>
          </div>
          <div className={styles.heroPanel}>
            <Tabs>
              <TabItem value="typescript" label="TypeScript" default>
                <CodeBlock language="ts">{typescriptSample}</CodeBlock>
              </TabItem>
              <TabItem value="python" label="Python">
                <CodeBlock language="python">{pythonSample}</CodeBlock>
              </TabItem>
            </Tabs>
          </div>
        </section>

        <section className={styles.metrics}>
          <div>
            <strong>7</strong>
            <span>Prize engine endpoints</span>
          </div>
          <div>
            <strong>2</strong>
            <span>First-party SDK tracks</span>
          </div>
          <div>
            <strong>1</strong>
            <span>Interactive explorer backed by OpenAPI</span>
          </div>
        </section>

        <section className={styles.pillars}>
          {pillars.map((pillar) => (
            <article key={pillar.title} className={styles.pillarCard}>
              <h2>{pillar.title}</h2>
              <p>{pillar.description}</p>
            </article>
          ))}
        </section>
      </main>
    </Layout>
  );
}
