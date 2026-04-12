import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLlmsTxt from "starlight-llms-txt";
import tailwindcss from "@tailwindcss/vite";

import svelte from "@astrojs/svelte";

export default defineConfig({
  site: "https://muxed.ai",
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    starlight({
      title: "muxed",
      favicon: "/favicon.svg",
      tagline: "One daemon to manage them all",
      customCss: ["./src/styles/docs.css"],
      components: {
        SiteTitle: "./src/components/site-title.astro",
      },
      plugins: [starlightLlmsTxt()],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/muxedai/muxed",
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Setup", slug: "getting-started/installation" },
            { label: "Configuration", slug: "getting-started/configuration" },
          ],
        },
        {
          label: "Integrations",
          items: [
            { label: "Claude Code", slug: "guides/claude-code" },
            { label: "Codex", slug: "guides/codex" },
            { label: "Cursor", slug: "guides/cursor" },
            { label: "Claude Desktop", slug: "guides/claude-desktop" },
            { label: "MCP", slug: "guides/mcp" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "CLI Commands", slug: "reference/cli-commands" },
            { label: "Programmatic API", slug: "reference/programmatic-api" },
            { label: "Config Schema", slug: "reference/config-schema" },
            { label: "Architecture", slug: "reference/architecture" },
          ],
        },
      ],
    }),
    svelte(),
  ],
});
