<wizard-report>
# PostHog post-wizard report

The wizard has completed a PostHog analytics integration for the muxed.dev Astro static site. A reusable `PostHog` component was created at `packages/website/src/components/posthog.astro` and imported directly into the landing page's `<head>`. Three conversion-critical events were instrumented in the existing inline script: copying the install command (the primary install-intent signal), clicking the "Get Started" docs CTA, and clicking the GitHub star link. All PostHog keys are read from environment variables in `packages/website/.env`.

| Event | Description | File |
|---|---|---|
| `install_command_copied` | User clicked the hero install box and successfully copied `npx muxed init` to clipboard | `packages/website/src/pages/index.astro` |
| `get_started_clicked` | User clicked a "Get Started" or "Read the Docs" CTA button; includes `location` property with button text | `packages/website/src/pages/index.astro` |
| `github_link_clicked` | User clicked a "Star on GitHub" link; includes `location` property with link text | `packages/website/src/pages/index.astro` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/296850/dashboard/1361586
- **Insight — Install command copies (daily)**: https://us.posthog.com/project/296850/insights/DB2EHqa6
- **Insight — CTA clicks: Get Started vs GitHub**: https://us.posthog.com/project/296850/insights/E3QHvmob
- **Insight — Install intent funnel**: https://us.posthog.com/project/296850/insights/NwJs0Wtl

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
