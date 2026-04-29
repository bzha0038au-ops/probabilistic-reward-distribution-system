import fs from "node:fs";

import type { Config } from "@docusaurus/types";
import type { Preset } from "@docusaurus/preset-classic";
import type { ScalarOptions } from "@scalar/docusaurus";

const openApiSpecPath = new URL(
  "./static/openapi/prize-engine.openapi.json",
  import.meta.url,
);
const openApiContent = fs.existsSync(openApiSpecPath)
  ? fs.readFileSync(openApiSpecPath, "utf8")
  : JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Reward Prize Engine API", version: "0.1.0" },
      paths: {},
    });

const config: Config = {
  title: "Reward Prize Engine",
  tagline: "Tenant-facing SDK docs, guides, and an interactive API explorer.",
  favicon: "img/reward-engine-mark.svg",

  url: "https://reward.local",
  baseUrl: "/",
  organizationName: "reward",
  projectName: "reward-system-docs",
  onBrokenLinks: "throw",
  onBrokenAnchors: "warn",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  stylesheets: [
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
  ],

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "docs",
          sidebarPath: "./sidebars.ts",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      "@scalar/docusaurus",
      {
        id: "prize-engine-api-reference",
        label: "API Reference",
        route: "/api-reference",
        showNavLink: false,
        configuration: {
          content: openApiContent,
          hideDownloadButton: false,
          searchHotKey: "k",
          theme: "purple",
        },
      } satisfies ScalarOptions,
    ],
  ],

  themeConfig: {
    image: "img/reward-engine-mark.svg",
    colorMode: {
      defaultMode: "light",
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Prize Engine",
      logo: {
        alt: "Reward Prize Engine",
        src: "img/reward-engine-mark.svg",
      },
      items: [
        {
          to: "/docs/intro",
          label: "Get Started",
          position: "left",
        },
        {
          to: "/docs/api/overview",
          label: "API Guide",
          position: "left",
        },
        {
          to: "/docs/sdks/typescript",
          label: "SDKs",
          position: "left",
        },
        {
          to: "/api-reference",
          label: "API Explorer",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Quickstart", to: "/docs/intro" },
            { label: "TypeScript SDK", to: "/docs/sdks/typescript" },
            { label: "Python SDK", to: "/docs/sdks/python" },
          ],
        },
        {
          title: "Reference",
          items: [
            { label: "API Explorer", to: "/api-reference" },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Reward.`,
    },
    prism: {
      additionalLanguages: ["bash", "python", "json"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
