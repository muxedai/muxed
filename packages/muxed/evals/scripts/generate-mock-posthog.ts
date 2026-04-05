/**
 * Generate mock-posthog.ts from dumped schema files.
 *
 * Reads each .txt schema dump from posthog-schemas/, extracts tool name,
 * description, and JSON Schema, then emits a single mock MCP server file
 * that registers every tool with the real schema and returns mock data
 * relevant to the dashboard investigation scenario.
 *
 * Usage: node --experimental-strip-types evals/scripts/generate-mock-posthog.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const SCHEMAS_DIR = path.resolve('evals/servers/posthog-schemas');
const OUT_FILE = path.resolve('evals/servers/mock-posthog.ts');

type ToolDef = {
  name: string; // e.g. "execute-sql"
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

function parseSchemaFile(filePath: string): ToolDef | null {
  const raw = fs.readFileSync(filePath, 'utf-8');

  // Line 1: posthog/<tool-name>
  const nameMatch = raw.match(/^posthog\/([\w-]+)/m);
  if (!nameMatch) return null;
  const name = nameMatch[1]!;

  // Title line
  const titleMatch = raw.match(/^Title:\s*(.+)$/m);
  const title = titleMatch?.[1]?.trim() ?? name;

  // Description: everything between "Description:" and "Input Schema:"
  const descMatch = raw.match(/^Description:\s*([\s\S]*?)(?=\nInput Schema:)/m);
  // Collapse to single line, truncate to 200 chars for the mock
  let description = descMatch?.[1]?.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ') ?? title;
  if (description.length > 300) {
    description = description.slice(0, 297) + '...';
  }

  // Input Schema: JSON blob (indented with 2 spaces)
  const schemaMatch = raw.match(/Input Schema:\n([\s\S]*?)(?=\n\nAnnotations:|\n\nTask Support:)/);
  let inputSchema: Record<string, unknown> = { type: 'object', properties: {} };
  if (schemaMatch) {
    try {
      inputSchema = JSON.parse(schemaMatch[1]!.trim());
    } catch {
      // Some schemas may not parse cleanly
    }
  }

  return { name, title, description, inputSchema };
}

// --- Mock data generators keyed by tool name ---
// Tools relevant to the dashboard investigation get specific mock data.
// Everything else gets a generic "ok" response.

function getMockResponseCode(name: string): string {
  const mockMap: Record<string, string> = {
    'logs-query': `JSON.stringify({
      results: [
        { timestamp: "2026-03-21T08:14:55Z", severity: "error", service_name: "dashboard-api", body: "Failed to fetch data from upstream: connection refused", attributes: { endpoint: "/api/v2/dashboard/data", status_code: 503, trace_id: "trace-abc-123" } },
        { timestamp: "2026-03-21T08:14:50Z", severity: "error", service_name: "dashboard-api", body: "Circuit breaker OPEN for upstream-data-service", attributes: { failures: 15, threshold: 10, trace_id: "trace-abc-124" } },
        { timestamp: "2026-03-21T08:14:30Z", severity: "warn", service_name: "dashboard-api", body: "Request timeout after 30000ms", attributes: { endpoint: "/api/v2/dashboard/data", trace_id: "trace-abc-125" } },
        { timestamp: "2026-03-21T08:10:00Z", severity: "fatal", service_name: "upstream-data-service", body: "OOM killed: container exceeded 2Gi memory limit", attributes: { pod: "upstream-data-7b9f4-xk2p9", trace_id: "trace-def-001" } },
        { timestamp: "2026-03-21T08:09:55Z", severity: "error", service_name: "upstream-data-service", body: "Memory allocation failed: requested 512MB, available 128MB", attributes: { heap_used: "1.9Gi", heap_limit: "2Gi" } },
      ],
      hasMore: false
    })`,

    'logs-list-attributes': `JSON.stringify({
      attributes: ["service_name", "severity", "trace_id", "span_id", "k8s.pod.name", "k8s.namespace", "k8s.container.name", "http.method", "http.status_code", "http.url", "endpoint", "error.type", "error.message"]
    })`,

    'logs-list-attribute-values': `JSON.stringify({
      values: ["dashboard-api", "upstream-data-service", "auth-service", "api-gateway", "worker-service"]
    })`,

    'query-trends': `JSON.stringify({
      results: [{
        data: [12, 15, 45, 120, 350, 410],
        labels: ["2026-03-16", "2026-03-17", "2026-03-18", "2026-03-19", "2026-03-20", "2026-03-21"],
        count: 952,
        label: "$exception count",
        action: { id: "exception", type: "events", name: "$exception", math: "total" }
      }],
      is_cached: false,
      timezone: "UTC"
    })`,

    'query-funnel': `JSON.stringify({
      results: [
        { name: "$pageview", count: 1000, conversion_rate: 100 },
        { name: "dashboard_loaded", count: 520, conversion_rate: 52 },
        { name: "dashboard_data_rendered", count: 180, conversion_rate: 34.6 },
      ],
      timezone: "UTC"
    })`,

    'query-retention': `JSON.stringify({
      results: [
        { values: [{ count: 1000 }, { count: 450 }, { count: 380 }, { count: 350 }], label: "Week 0", date: "2026-03-01" },
        { values: [{ count: 980 }, { count: 420 }, { count: 360 }], label: "Week 1", date: "2026-03-08" },
      ],
      timezone: "UTC"
    })`,

    'query-lifecycle': `JSON.stringify({
      results: [
        { status: "new", data: [45, 52, 38, 41, 35, 28], labels: ["2026-03-16","2026-03-17","2026-03-18","2026-03-19","2026-03-20","2026-03-21"] },
        { status: "returning", data: [320, 315, 305, 290, 210, 180], labels: ["2026-03-16","2026-03-17","2026-03-18","2026-03-19","2026-03-20","2026-03-21"] },
        { status: "resurrecting", data: [15, 18, 12, 14, 8, 5], labels: ["2026-03-16","2026-03-17","2026-03-18","2026-03-19","2026-03-20","2026-03-21"] },
        { status: "dormant", data: [-20, -25, -35, -80, -150, -200], labels: ["2026-03-16","2026-03-17","2026-03-18","2026-03-19","2026-03-20","2026-03-21"] },
      ],
      timezone: "UTC"
    })`,

    'query-stickiness': `JSON.stringify({
      results: [{ data: [800, 350, 180, 90, 45, 20, 10], days: [1,2,3,4,5,6,7], label: "$pageview", count: 1495 }],
      timezone: "UTC"
    })`,

    'query-paths': `JSON.stringify({
      results: [
        { source: "1_/", target: "2_/dashboard", value: 450 },
        { source: "2_/dashboard", target: "3_/dashboard/settings", value: 120 },
        { source: "2_/dashboard", target: "3_/analytics", value: 80 },
        { source: "1_/", target: "2_/login", value: 200 },
      ]
    })`,

    'execute-sql': `JSON.stringify({
      columns: ["event", "count", "last_seen"],
      results: [
        ["$exception", 487, "2026-03-21T08:15:00Z"],
        ["$pageview", 12450, "2026-03-21T08:15:01Z"],
        ["dashboard_loaded", 3200, "2026-03-21T08:14:00Z"],
        ["dashboard_error", 312, "2026-03-21T08:15:00Z"],
      ],
      hasMore: false
    })`,

    'read-data-schema': `JSON.stringify({
      results: [
        { name: "$pageview", description: "Page view event", volume_30_day: 245000 },
        { name: "$exception", description: "Exception event", volume_30_day: 8920 },
        { name: "dashboard_loaded", description: "Dashboard successfully loaded", volume_30_day: 32000 },
        { name: "dashboard_error", description: "Dashboard loading error", volume_30_day: 4100 },
        { name: "user signed up", description: "User signed up", volume_30_day: 1500 },
        { name: "feature_flag_called", description: "Feature flag evaluated", volume_30_day: 1200000 },
      ]
    })`,

    'read-data-warehouse-schema': `JSON.stringify({
      tables: [
        { name: "events", columns: ["uuid", "event", "properties", "timestamp", "distinct_id", "elements_chain"] },
        { name: "persons", columns: ["id", "properties", "created_at", "is_identified"] },
        { name: "sessions", columns: ["session_id", "distinct_id", "min_timestamp", "max_timestamp", "duration", "pageview_count"] },
        { name: "log_entries", columns: ["timestamp", "message", "level", "service_name", "trace_id"] },
      ]
    })`,

    'error-tracking-issues-list': `JSON.stringify({
      results: [
        { id: "err-001", title: "DashboardApiError: Failed to fetch dashboard data", status: "active", occurrences: 312, users: 89, sessions: 145, first_seen: "2026-03-21T08:10:00Z", last_seen: "2026-03-21T08:15:00Z", assignee: null },
        { id: "err-002", title: "TypeError: Cannot read property 'data' of undefined", status: "active", occurrences: 45, users: 23, sessions: 38, first_seen: "2026-03-20T14:00:00Z", last_seen: "2026-03-21T08:14:00Z", assignee: { email: "alice@example.com" } },
        { id: "err-003", title: "TimeoutError: Request timed out after 30000ms", status: "active", occurrences: 120, users: 67, sessions: 98, first_seen: "2026-03-21T08:11:00Z", last_seen: "2026-03-21T08:15:00Z", assignee: null },
      ]
    })`,

    'query-error-tracking-issues': `JSON.stringify({
      results: [
        { id: "err-001", title: "DashboardApiError: Failed to fetch dashboard data", status: "active", occurrences: 312, users: 89, volume: { current: 312, previous: 12, change: 2500 }, first_seen: "2026-03-21T08:10:00Z", last_seen: "2026-03-21T08:15:00Z" },
        { id: "err-003", title: "TimeoutError: Request timed out after 30000ms", status: "active", occurrences: 120, users: 67, volume: { current: 120, previous: 5, change: 2300 }, first_seen: "2026-03-21T08:11:00Z", last_seen: "2026-03-21T08:15:00Z" },
      ],
      hasMore: false
    })`,

    'error-tracking-issues-retrieve': `JSON.stringify({
      id: "err-001",
      title: "DashboardApiError: Failed to fetch dashboard data",
      description: "The dashboard API is returning 503 errors when trying to fetch data from the upstream-data-service. The upstream service appears to be down due to OOM.",
      status: "active",
      occurrences: 312,
      users: 89,
      first_seen: "2026-03-21T08:10:00Z",
      last_seen: "2026-03-21T08:15:00Z",
      assignee: null,
      external_references: []
    })`,

    'error-tracking-issues-partial-update': `JSON.stringify({ id: "err-001", status: "resolved", assignee: { email: "alice@example.com" } })`,

    'feature-flag-get-all': `JSON.stringify({
      results: [
        { id: 101, key: "new-dashboard-api", name: "New Dashboard API", active: true, rollout_percentage: 50, filters: { groups: [{ properties: [{ key: "plan", value: "enterprise", operator: "exact" }], rollout_percentage: 100 }, { properties: [], rollout_percentage: 50 }] }, created_at: "2026-03-15T10:00:00Z" },
        { id: 102, key: "dark-mode", name: "Dark Mode", active: true, rollout_percentage: 100, filters: { groups: [{ properties: [], rollout_percentage: 100 }] }, created_at: "2026-02-01T10:00:00Z" },
        { id: 103, key: "beta-analytics", name: "Beta Analytics Dashboard", active: false, rollout_percentage: 0, filters: { groups: [] }, created_at: "2026-01-15T10:00:00Z" },
        { id: 104, key: "new-caching-layer", name: "New Caching Layer", active: true, rollout_percentage: 25, filters: { groups: [{ properties: [], rollout_percentage: 25 }] }, created_at: "2026-03-19T14:00:00Z" },
        { id: 105, key: "enable-new-onboarding", name: "Enable New Onboarding", active: true, rollout_percentage: 100, filters: { groups: [{ properties: [], rollout_percentage: 100 }] }, created_at: "2026-02-20T10:00:00Z" },
      ],
      count: 5
    })`,

    'feature-flag-get-definition': `JSON.stringify({
      id: 101,
      key: "new-dashboard-api",
      name: "New Dashboard API",
      active: true,
      filters: {
        groups: [
          { properties: [{ key: "plan", value: "enterprise", operator: "exact", type: "person" }], rollout_percentage: 100 },
          { properties: [], rollout_percentage: 50 },
        ],
      },
      rollout_percentage: 50,
      created_at: "2026-03-15T10:00:00Z",
      created_by: { email: "bob@example.com", first_name: "Bob" },
    })`,

    'feature-flags-activity-retrieve': `JSON.stringify({
      results: [
        { activity: "updated", created_at: "2026-03-20T16:30:00Z", user: { email: "alice@example.com", first_name: "Alice" }, detail: { changes: [{ type: "FeatureFlag", action: "changed", field: "rollout_percentage", before: 10, after: 50 }], name: "New Dashboard API" } },
        { activity: "created", created_at: "2026-03-15T10:00:00Z", user: { email: "bob@example.com", first_name: "Bob" }, detail: { name: "New Dashboard API", short_id: "new-dashboard-api" } },
      ]
    })`,

    'feature-flags-status-retrieve': `JSON.stringify({
      id: 101,
      key: "new-dashboard-api",
      active: true,
      usage_dashboard_id: 42,
      evaluation_count_last_7_days: 245000,
      has_enriched_analytics: true,
    })`,

    'feature-flags-evaluation-reasons-retrieve': `JSON.stringify({
      results: [
        { condition_index: 0, reason: "condition_match", percentage_matched: 38.5, evaluation_count: 94325 },
        { condition_index: 1, reason: "condition_match", percentage_matched: 50.0, evaluation_count: 150675 },
        { condition_index: null, reason: "out_of_rollout_bound", percentage_matched: 11.5, evaluation_count: 28000 },
      ]
    })`,

    'feature-flags-dependent-flags-retrieve': `JSON.stringify({ dependent_flags: [] })`,

    'feature-flags-user-blast-radius-create': `JSON.stringify({
      users_affected: 12500,
      total_users: 25000,
    })`,

    'insights-get-all': `JSON.stringify({
      results: [
        { id: 42, short_id: "abc123", name: "Dashboard Error Rate", description: "Tracks exception rate on dashboard pages", filters: { insight: "TRENDS" }, last_refresh: "2026-03-21T08:00:00Z" },
        { id: 43, short_id: "def456", name: "User Signups", description: "Weekly user signups", filters: { insight: "TRENDS" }, last_refresh: "2026-03-21T08:00:00Z" },
        { id: 44, short_id: "ghi789", name: "Onboarding Funnel", description: "Signup to activation funnel", filters: { insight: "FUNNELS" }, last_refresh: "2026-03-21T08:00:00Z" },
      ],
      count: 3
    })`,

    'insight-get': `JSON.stringify({
      id: 42,
      short_id: "abc123",
      name: "Dashboard Error Rate",
      description: "Tracks exception rate on dashboard pages",
      result: [{ data: [12, 15, 45, 120, 350, 410], labels: ["Mar 16","Mar 17","Mar 18","Mar 19","Mar 20","Mar 21"] }],
    })`,

    'insight-query': `JSON.stringify({
      results: [{ data: [12, 15, 45, 120, 350, 410], labels: ["Mar 16","Mar 17","Mar 18","Mar 19","Mar 20","Mar 21"], label: "$exception count" }],
      is_cached: false,
    })`,

    'insight-create-from-query': `JSON.stringify({ id: 99, short_id: "new123", name: "New Insight", saved: true })`,
    'insight-update': `JSON.stringify({ id: 42, name: "Dashboard Error Rate (updated)", saved: true })`,
    'insight-delete': `JSON.stringify({ success: true })`,

    'dashboards-get-all': `JSON.stringify({
      results: [
        { id: 1, name: "Main Dashboard", description: "Primary product dashboard", pinned: true, tiles_count: 8, created_at: "2026-01-15T10:00:00Z" },
        { id: 2, name: "Error Tracking", description: "Error rates and exception monitoring", pinned: false, tiles_count: 5, created_at: "2026-02-01T10:00:00Z" },
        { id: 3, name: "Performance Metrics", description: "Page load and API latency metrics", pinned: false, tiles_count: 6, created_at: "2026-02-15T10:00:00Z" },
        { id: 4, name: "Feature Flag Impact", description: "A/B test and flag rollout monitoring", pinned: false, tiles_count: 4, created_at: "2026-03-01T10:00:00Z" },
      ],
      count: 4
    })`,

    'dashboard-get': `JSON.stringify({
      id: 1,
      name: "Main Dashboard",
      tiles: [
        { id: 1, insight: { id: 42, name: "Dashboard Error Rate", last_refresh: "2026-03-21T08:00:00Z" }, layouts: {} },
        { id: 2, insight: { id: 43, name: "Active Users", last_refresh: "2026-03-21T08:00:00Z" }, layouts: {} },
        { id: 3, insight: { id: 44, name: "Avg Load Time", last_refresh: "2026-03-21T08:00:00Z" }, layouts: {} },
      ],
    })`,

    'dashboard-create': `JSON.stringify({ id: 10, name: "New Dashboard", tiles: [] })`,
    'dashboard-update': `JSON.stringify({ id: 1, name: "Main Dashboard (updated)" })`,
    'dashboard-delete': `JSON.stringify({ success: true })`,
    'dashboard-reorder-tiles': `JSON.stringify({ success: true })`,

    'activity-logs-list': `JSON.stringify({
      results: [
        { activity: "updated", scope: "FeatureFlag", item_id: "101", created_at: "2026-03-20T16:30:00Z", user: { email: "alice@example.com", first_name: "Alice" }, detail: { name: "New Dashboard API", changes: [{ field: "rollout_percentage", action: "changed", before: 10, after: 50 }] } },
        { activity: "created", scope: "Insight", item_id: "42", created_at: "2026-03-19T14:00:00Z", user: { email: "bob@example.com", first_name: "Bob" }, detail: { name: "Dashboard Error Rate" } },
      ]
    })`,

    'alerts-list': `JSON.stringify({
      results: [
        { id: 1, name: "Dashboard Error Rate Alert", state: "firing", threshold: { configuration: { absoluteThreshold: 100 } }, insight: 42, last_checked_at: "2026-03-21T08:15:00Z", last_notified_at: "2026-03-21T08:12:00Z" },
        { id: 2, name: "Signup Drop Alert", state: "ok", threshold: { configuration: { absoluteThreshold: 50 } }, insight: 43, last_checked_at: "2026-03-21T08:00:00Z" },
      ]
    })`,

    'alert-get': `JSON.stringify({
      id: 1,
      name: "Dashboard Error Rate Alert",
      state: "firing",
      threshold: { configuration: { absoluteThreshold: 100 } },
      insight: 42,
      checks: [
        { created_at: "2026-03-21T08:15:00Z", state: "firing", targets_fired: [{ value: 410 }] },
        { created_at: "2026-03-21T08:00:00Z", state: "firing", targets_fired: [{ value: 350 }] },
      ],
    })`,

    'persons-list': `JSON.stringify({
      results: [
        { id: "user-42", distinct_ids: ["user-42"], properties: { email: "alice@example.com", plan: "enterprise", $browser: "Chrome" }, created_at: "2025-06-15T10:00:00Z" },
        { id: "user-99", distinct_ids: ["user-99"], properties: { email: "bob@example.com", plan: "pro", $browser: "Firefox" }, created_at: "2025-08-20T10:00:00Z" },
      ]
    })`,

    'cohorts-list': `JSON.stringify({
      results: [
        { id: 1, name: "Enterprise Users", count: 5200, is_calculating: false },
        { id: 2, name: "Power Users", count: 1800, is_calculating: false },
        { id: 3, name: "New Users (7d)", count: 320, is_calculating: false },
      ]
    })`,

    'experiment-get-all': `JSON.stringify({
      results: [
        { id: 1, name: "New Dashboard Layout", feature_flag_key: "new-dashboard-layout", start_date: "2026-03-01", end_date: null, created_at: "2026-02-28T10:00:00Z" },
      ],
      count: 1
    })`,

    'experiment-get': `JSON.stringify({
      id: 1, name: "New Dashboard Layout", feature_flag_key: "new-dashboard-layout",
      start_date: "2026-03-01", end_date: null, parameters: {},
    })`,

    'experiment-results-get': `JSON.stringify({
      insight: [{ data: [100, 105, 110], labels: ["Week 1", "Week 2", "Week 3"] }],
      probability: { control: 0.35, test: 0.65 },
      significant: false,
    })`,

    'surveys-get-all': `JSON.stringify({ results: [{ id: "survey-1", name: "NPS Survey Q1 2026", type: "popover", start_date: "2026-01-01" }], count: 1 })`,
    'survey-get': `JSON.stringify({ id: "survey-1", name: "NPS Survey Q1 2026", type: "popover", questions: [{ type: "rating", question: "How likely are you to recommend us?" }] })`,
    'surveys-global-stats': `JSON.stringify({ total_responses: 1250, surveys_active: 1 })`,
    'survey-stats': `JSON.stringify({ responses: 1250, average_rating: 7.8, nps_score: 42 })`,

    'persons-retrieve': `JSON.stringify({ id: "user-42", distinct_ids: ["user-42"], properties: { email: "alice@example.com", plan: "enterprise" } })`,
    'cohorts-retrieve': `JSON.stringify({ id: 1, name: "Enterprise Users", count: 5200, filters: { properties: [{ key: "plan", value: "enterprise", operator: "exact", type: "person" }] } })`,

    'query-llm-traces-list': `JSON.stringify({ results: [], hasMore: false })`,
    'query-llm-trace': `JSON.stringify({ trace_id: "trace-001", spans: [] })`,

    'evaluations-get': `JSON.stringify({ results: [], count: 0 })`,
    'evaluation-get': `JSON.stringify({ id: "eval-1", name: "Test Eval", status: "completed" })`,

    'get-llm-total-costs-for-project': `JSON.stringify({ total_cost_usd: 42.50, period: "2026-03" })`,
    'organizations-get': `JSON.stringify({ results: [{ id: "org-1", name: "Acme Corp", slug: "acme" }] })`,
    'organization-details-get': `JSON.stringify({ id: "org-1", name: "Acme Corp", slug: "acme", members_count: 45 })`,
    'projects-get': `JSON.stringify({ results: [{ id: 1, name: "Production", uuid: "proj-001" }] })`,

    'notebooks-list': `JSON.stringify({ results: [{ id: "nb-1", title: "Q1 Analysis", created_at: "2026-01-15T10:00:00Z" }], count: 1 })`,
    'notebooks-retrieve': `JSON.stringify({ id: "nb-1", title: "Q1 Analysis", content: {} })`,

    'actions-get-all': `JSON.stringify({ results: [{ id: 1, name: "Dashboard View", steps: [{ event: "$pageview", url: "/dashboard" }] }], count: 1 })`,
    'action-get': `JSON.stringify({ id: 1, name: "Dashboard View", steps: [{ event: "$pageview", url: "/dashboard" }] })`,

    'annotations-list': `JSON.stringify({ results: [{ id: 1, content: "Deployed v2.1.0", date_marker: "2026-03-20T16:00:00Z", scope: "organization" }], count: 1 })`,
    'annotation-retrieve': `JSON.stringify({ id: 1, content: "Deployed v2.1.0", date_marker: "2026-03-20T16:00:00Z" })`,

    'prompt-list': `JSON.stringify({ results: [], count: 0 })`,
    'prompt-get': `JSON.stringify({ id: "prompt-1", name: "Default", template: "" })`,

    'workflows-list': `JSON.stringify({ results: [], count: 0 })`,
    'workflows-get': `JSON.stringify({ id: "wf-1", name: "Test", steps: [] })`,

    'view-list': `JSON.stringify({ results: [], count: 0 })`,
    'view-get': `JSON.stringify({ id: "view-1", name: "Saved Query", query: "SELECT 1" })`,

    'cdp-functions-list': `JSON.stringify({ results: [], count: 0 })`,
    'cdp-function-templates-list': `JSON.stringify({ results: [], count: 0 })`,
    'proxy-list': `JSON.stringify({ results: [] })`,

    'early-access-feature-list': `JSON.stringify({ results: [], count: 0 })`,

    'scheduled-changes-list': `JSON.stringify({ results: [] })`,
  };

  return mockMap[name] ?? `JSON.stringify({ success: true, tool: "${name}" })`;
}

function escapeForTemplate(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

// --- Main ---
const files = fs
  .readdirSync(SCHEMAS_DIR)
  .filter((f) => f.endsWith('.txt'))
  .sort();
const tools: ToolDef[] = [];

for (const file of files) {
  const tool = parseSchemaFile(path.join(SCHEMAS_DIR, file));
  if (tool) tools.push(tool);
}

console.log(`Parsed ${tools.length} tools. Generating mock server...`);

// Build the tool definitions array as a JSON blob
const toolDefsJson = JSON.stringify(
  tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
  null,
  2
);

// Build the mock response map
const mockEntries: string[] = [];
for (const tool of tools) {
  const mockCode = getMockResponseCode(tool.name);
  mockEntries.push(`  ${JSON.stringify(tool.name)}: () => ${mockCode}`);
}

// Generate the output file using low-level Server class for raw JSON schema support
let output = `/**
 * Mock PostHog MCP server with all ${tools.length} real tools and schemas.
 * AUTO-GENERATED by evals/scripts/generate-mock-posthog.ts — do not edit manually.
 *
 * Uses the low-level Server class to bypass McpServer's Zod-only schema handling,
 * allowing us to pass through the real PostHog JSON schemas verbatim.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { serveHttpRaw } from './serve-http-raw.ts';

type ToolDef = { name: string; description: string; inputSchema: Record<string, unknown> };

const TOOL_DEFS: ToolDef[] = ${toolDefsJson};

const MOCK_RESPONSES: Record<string, (() => string) | undefined> = {
${mockEntries.join(',\n')},
};

function createServer(): Server {
  const server = new Server(
    { name: 'posthog', version: '1.0.0' },
    { capabilities: { tools: { listChanged: false } } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as any,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const mockFn = MOCK_RESPONSES[name];
    const text = mockFn ? mockFn() : JSON.stringify({ success: true, tool: name });
    return { content: [{ type: 'text', text }] };
  });

  return server;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--http')) {
    const portIdx = args.indexOf('--port');
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1]!, 10) : 3000;
    serveHttpRaw(createServer, port, 'posthog');
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  process.stderr.write(\`posthog error: \${err}\\n\`);
  process.exit(1);
});
`;

fs.writeFileSync(OUT_FILE, output);
console.log(
  `Generated ${OUT_FILE} (${(output.length / 1024).toFixed(1)} KB, ${tools.length} tools)`
);
