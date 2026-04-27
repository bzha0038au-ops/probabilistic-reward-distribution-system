import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const workspaceRoot = process.cwd();

type FileRuleConfig = {
  file: string;
  tables: Record<string, RegExp[]>;
  rawSqlPatterns?: RegExp[];
};

const fileRuleConfigs: FileRuleConfig[] = [
  {
    file: path.resolve(
      workspaceRoot,
      'src/modules/saas/prize-engine-service.ts'
    ),
    tables: {
      saasProjects: [
        /eq\s*\(\s*saasProjects\.id\s*,/s,
        /eq\s*\(\s*saasProjects\.tenantId\s*,/s,
      ],
      saasTenants: [/eq\s*\(\s*saasTenants\.id\s*,/s],
      saasApiKeys: [
        /innerJoin\s*\(\s*saasProjects\s*,/s,
        /innerJoin\s*\(\s*saasTenants\s*,/s,
        /eq\s*\(\s*saasApiKeys\.keyHash\s*,/s,
        /eq\s*\(\s*saasApiKeys\.projectId\s*,/s,
      ],
      saasPlayers: [
        /eq\s*\(\s*saasPlayers\.projectId\s*,/s,
        /\$\{saasPlayers\.projectId\}\s*=\s*\$\{[^}]*projectId[^}]*\}/s,
      ],
      saasProjectPrizes: [
        /eq\s*\(\s*saasProjectPrizes\.projectId\s*,/s,
        /\$\{saasProjectPrizes\.projectId\}\s*=\s*\$\{[^}]*projectId[^}]*\}/s,
      ],
      saasLedgerEntries: [/eq\s*\(\s*saasLedgerEntries\.projectId\s*,/s],
      saasFairnessSeeds: [/eq\s*\(\s*saasFairnessSeeds\.projectId\s*,/s],
      saasUsageEvents: [/eq\s*\(\s*saasUsageEvents\.projectId\s*,/s],
    },
    rawSqlPatterns: [
      /\$\{[^}]+\.projectId\}\s*=\s*\$\{[^}]*projectId[^}]*\}/s,
      /\$\{[^}]+\.tenantId\}\s*=\s*\$\{[^}]*tenantId[^}]*\}/s,
      /FROM\s+\$\{saasProjects\}[\s\S]*WHERE[\s\S]*\$\{saasProjects\.id\}\s*=\s*\$\{[^}]*projectId[^}]*\}/s,
      /FROM\s+\$\{saasTenants\}[\s\S]*WHERE[\s\S]*\$\{saasTenants\.id\}\s*=\s*\$\{[^}]*tenantId[^}]*\}/s,
    ],
  },
  {
    file: path.resolve(workspaceRoot, 'src/modules/saas/service.ts'),
    tables: {
      saasProjects: [
        /eq\s*\(\s*saasProjects\.id\s*,/s,
        /eq\s*\(\s*saasProjects\.tenantId\s*,/s,
      ],
      saasTenants: [/eq\s*\(\s*saasTenants\.id\s*,/s],
      saasApiKeys: [
        /eq\s*\(\s*saasApiKeys\.projectId\s*,/s,
        /eq\s*\(\s*saasApiKeys\.keyHash\s*,/s,
      ],
      saasProjectPrizes: [/eq\s*\(\s*saasProjectPrizes\.projectId\s*,/s],
      saasTenantMemberships: [
        /eq\s*\(\s*saasTenantMemberships\.tenantId\s*,/s,
        /eq\s*\(\s*saasTenantMemberships\.adminId\s*,/s,
      ],
      saasTenantInvites: [
        /eq\s*\(\s*saasTenantInvites\.tenantId\s*,/s,
        /eq\s*\(\s*saasTenantInvites\.tokenHash\s*,/s,
      ],
      saasTenantLinks: [
        /eq\s*\(\s*saasTenantLinks\.parentTenantId\s*,/s,
        /eq\s*\(\s*saasTenantLinks\.childTenantId\s*,/s,
        /inArray\s*\(\s*saasTenantLinks\.parentTenantId\s*,/s,
      ],
      saasBillingAccounts: [/eq\s*\(\s*saasBillingAccounts\.tenantId\s*,/s],
      saasBillingAccountVersions: [
        /eq\s*\(\s*saasBillingAccountVersions\.tenantId\s*,/s,
        /eq\s*\(\s*saasBillingAccountVersions\.billingAccountId\s*,/s,
      ],
    },
  },
];

const getQueryRoot = (node: ts.Node): ts.Node => {
  let current = node;

  for (;;) {
    const parent = current.parent;
    if (!parent) {
      return current;
    }

    if (ts.isPropertyAccessExpression(parent) && parent.expression === current) {
      current = parent;
      continue;
    }

    if (ts.isCallExpression(parent) && parent.expression === current) {
      current = parent;
      continue;
    }

    if (ts.isAwaitExpression(parent) && parent.expression === current) {
      current = parent;
      continue;
    }

    if (ts.isAsExpression(parent) && parent.expression === current) {
      current = parent;
      continue;
    }

    if (ts.isParenthesizedExpression(parent) && parent.expression === current) {
      current = parent;
      continue;
    }

    return current;
  }
};

const issues: string[] = [];

const reportIssue = (sourceFile: ts.SourceFile, node: ts.Node, message: string) => {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  issues.push(
    `${path.relative(workspaceRoot, sourceFile.fileName)}:${line + 1}:${character + 1} ${message}`
  );
};

const visit = (
  sourceFile: ts.SourceFile,
  fileRuleConfig: FileRuleConfig,
  node: ts.Node
) => {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const propertyName = node.expression.name.text;

    if (
      (propertyName === 'from' ||
        propertyName === 'update' ||
        propertyName === 'delete') &&
      node.arguments.length > 0 &&
      ts.isIdentifier(node.arguments[0])
    ) {
      const tableName = node.arguments[0].text;
      const allowPatterns = fileRuleConfig.tables[tableName];
      if (allowPatterns) {
        const queryText = getQueryRoot(node).getText(sourceFile);
        const isScoped = allowPatterns.some((allowPattern) =>
          allowPattern.test(queryText)
        );
        if (!isScoped) {
          reportIssue(
            sourceFile,
            node,
            `${propertyName} against ${tableName} is missing tenant/project scoping`
          );
        }
      }
    }

    if (
      propertyName === 'execute' &&
      node.arguments.length > 0 &&
      ts.isTaggedTemplateExpression(node.arguments[0]) &&
      ts.isIdentifier(node.arguments[0].tag) &&
      node.arguments[0].tag.text === 'sql'
    ) {
      const queryText = getQueryRoot(node).getText(sourceFile);
      const rawSqlPatterns = fileRuleConfig.rawSqlPatterns ?? [];
      if (rawSqlPatterns.length > 0 && !rawSqlPatterns.some((pattern) => pattern.test(queryText))) {
        reportIssue(sourceFile, node, 'raw SQL read is missing tenant/project scoping');
      }
    }
  }

  ts.forEachChild(node, (child) => visit(sourceFile, fileRuleConfig, child));
};

for (const fileRuleConfig of fileRuleConfigs) {
  const sourceText = await readFile(fileRuleConfig.file, 'utf8');
  const sourceFile = ts.createSourceFile(
    fileRuleConfig.file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  visit(sourceFile, fileRuleConfig, sourceFile);
}

if (issues.length > 0) {
  console.error('SaaS scope check failed:\n');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('SaaS scope check passed.');
