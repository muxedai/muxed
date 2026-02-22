import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLlmsTxt from "starlight-llms-txt";
import tailwindcss from "@tailwindcss/vite";

import svelte from "@astrojs/svelte";

export default defineConfig({
  site: "https://toold.dev",
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    starlight({
      title: "toold",
      tagline: "One daemon to manage them all",
      customCss: ["./src/styles/global.css"],
      plugins: [starlightLlmsTxt()],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/skoob13/toold",
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Installation", slug: "getting-started/installation" },
            { label: "Quick Start", slug: "getting-started/quick-start" },
            { label: "Configuration", slug: "getting-started/configuration" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Claude Code", slug: "guides/claude-code" },
            { label: "Cursor & Windsurf", slug: "guides/cursor-windsurf" },
            { label: "Custom Agents", slug: "guides/custom-agents" },
            { label: "Programmatic API", slug: "guides/programmatic-api" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "CLI Commands", slug: "reference/cli-commands" },
            { label: "Config Schema", slug: "reference/config-schema" },
            { label: "Architecture", slug: "reference/architecture" },
          ],
        },
      ],
    }),
    svelte(),
  ],
});
