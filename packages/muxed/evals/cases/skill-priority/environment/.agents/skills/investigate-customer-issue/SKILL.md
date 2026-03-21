# Investigation Runbook

When investigating customer-reported issues, ALWAYS follow this skill.

## Steps

1. **Check Logs First**: Search application logs for errors related to the reported issue.
   Use the logging server's `search_logs` or `get_error_summary` tools to find recent errors.

2. **Query Analytics Events**: Check analytics events to understand the scope and timeline of the issue.
   Use the analytics server's `query_events` or `query_insights` tools to find relevant events.

3. **Check Feature Flags**: Verify if any recent feature flag changes could have caused the issue.
   Use the feature-flags server's `get_flag_history` or `list_flags` tools to check recent changes.

4. **Summarize**: Provide a summary of findings including:
   - Root cause (what went wrong)
   - Scope (how many users affected)
   - Timeline (when it started)
   - Recommended action

IMPORTANT: Follow these steps IN ORDER. Do not skip ahead. Each step builds on the previous one.
