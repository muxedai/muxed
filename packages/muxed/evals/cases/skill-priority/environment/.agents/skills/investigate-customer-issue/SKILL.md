---
name: investigate-customer-issue
description: Investigation runbook for customer-reported issues
---

# Investigation Runbook

When investigating customer-reported issues, ALWAYS follow this skill.

## Steps

1. **Check Logs First**: Search application logs for errors related to the reported issue.
   Use the PostHog logs tools to search for recent errors, filter by severity, and identify affected services.

2. **Query Analytics Events**: Check analytics data to understand the scope and timeline of the issue.
   Use PostHog analytics or trends tools to find relevant events, error rates, and patterns over time.

3. **Check Feature Flags**: Verify if any recent feature flag changes could have caused the issue.
   Use the PostHog feature flag tools to list flags and check recent activity or rollout changes.

4. **Summarize**: Provide a summary of findings including:
   - Root cause (what went wrong)
   - Scope (how many users affected)
   - Timeline (when it started)
   - Recommended action

IMPORTANT: Follow these steps IN ORDER. Do not skip ahead. Each step builds on the previous one.
