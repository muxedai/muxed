export type ToolCluster = {
  name: string;
  basenames: string[];
  descriptionTemplates: string[];
  parameterSets: Array<
    Array<{ name: string; type: 'string' | 'number' | 'boolean'; description: string }>
  >;
};

export const clusters: ToolCluster[] = [
  {
    name: 'data-retrieval',
    basenames: [
      'fetch_data',
      'get_records',
      'retrieve_entries',
      'pull_data',
      'load_records',
      'query_data',
      'obtain_results',
      'read_entries',
      'extract_data',
      'collect_records',
    ],
    descriptionTemplates: [
      'Retrieves data records from the primary data store',
      'Fetches entries matching the given criteria from storage',
      'Loads records from the database with optional filtering',
      'Pulls data matching specified parameters from the backend',
      'Obtains results from the data layer based on query parameters',
    ],
    parameterSets: [
      [
        { name: 'query', type: 'string', description: 'Search query or filter expression' },
        { name: 'limit', type: 'number', description: 'Maximum number of results' },
      ],
      [{ name: 'id', type: 'string', description: 'Record identifier' }],
      [
        { name: 'filter', type: 'string', description: 'Filter expression' },
        { name: 'offset', type: 'number', description: 'Pagination offset' },
        { name: 'limit', type: 'number', description: 'Maximum number of results' },
      ],
    ],
  },
  {
    name: 'user-management',
    basenames: [
      'get_user_profile',
      'fetch_user_info',
      'retrieve_user_record',
      'load_user_details',
      'pull_user_data',
      'query_user_account',
      'obtain_user_info',
      'read_user_profile',
      'find_user_entry',
      'lookup_user_record',
    ],
    descriptionTemplates: [
      'Gets the profile information for a specific user account',
      'Fetches detailed user information including preferences and settings',
      'Retrieves the user record with all associated metadata',
      'Loads user details from the identity and access management system',
      'Pulls user data including activity history and configuration',
    ],
    parameterSets: [
      [{ name: 'user_id', type: 'string', description: 'User identifier' }],
      [{ name: 'email', type: 'string', description: 'User email address' }],
      [
        { name: 'user_id', type: 'string', description: 'User identifier' },
        { name: 'include_history', type: 'boolean', description: 'Include activity history' },
      ],
    ],
  },
  {
    name: 'text-analysis',
    basenames: [
      'analyze_text',
      'parse_content',
      'extract_info',
      'process_text',
      'examine_content',
      'inspect_text',
      'scan_content',
      'evaluate_text',
      'review_content',
      'assess_text',
    ],
    descriptionTemplates: [
      'Analyzes text content for key phrases, entities, and sentiment',
      'Parses and extracts structured information from unstructured text',
      'Processes text input to identify patterns and extract data points',
      'Examines content for relevant information and classifications',
      'Scans text to extract entities, keywords, and topic labels',
    ],
    parameterSets: [
      [{ name: 'text', type: 'string', description: 'Text content to analyze' }],
      [
        { name: 'text', type: 'string', description: 'Input text' },
        { name: 'language', type: 'string', description: 'Language code (e.g. en, fr)' },
      ],
      [
        { name: 'content', type: 'string', description: 'Content to process' },
        {
          name: 'extract_entities',
          type: 'boolean',
          description: 'Whether to extract named entities',
        },
      ],
    ],
  },
  {
    name: 'notification',
    basenames: [
      'send_alert',
      'push_notification',
      'dispatch_message',
      'fire_event',
      'emit_notification',
      'broadcast_alert',
      'trigger_notification',
      'post_message',
      'relay_alert',
      'deliver_notification',
    ],
    descriptionTemplates: [
      'Sends an alert notification to the specified recipients',
      'Pushes a notification message through the configured channels',
      'Dispatches a message to users via email, SMS, or in-app notification',
      'Fires an event notification to all subscribed handlers',
      'Broadcasts an alert to the notification system for delivery',
    ],
    parameterSets: [
      [
        { name: 'message', type: 'string', description: 'Notification message content' },
        { name: 'recipient', type: 'string', description: 'Recipient identifier' },
      ],
      [
        { name: 'message', type: 'string', description: 'Alert message' },
        { name: 'channel', type: 'string', description: 'Delivery channel (email, sms, push)' },
        { name: 'priority', type: 'string', description: 'Priority level (low, medium, high)' },
      ],
      [
        { name: 'title', type: 'string', description: 'Notification title' },
        { name: 'body', type: 'string', description: 'Notification body' },
      ],
    ],
  },
  {
    name: 'file-operations',
    basenames: [
      'read_file',
      'load_document',
      'open_resource',
      'fetch_content',
      'get_file_data',
      'retrieve_document',
      'access_file',
      'obtain_document',
      'pull_file_content',
      'download_resource',
    ],
    descriptionTemplates: [
      'Reads the contents of a file from the file system or cloud storage',
      'Loads a document by path or identifier for processing',
      'Opens a resource and returns its contents as text or binary',
      'Fetches file content from the specified storage location',
      'Retrieves document data including metadata and content body',
    ],
    parameterSets: [
      [{ name: 'path', type: 'string', description: 'File path or resource URL' }],
      [
        { name: 'path', type: 'string', description: 'Document path' },
        { name: 'encoding', type: 'string', description: 'File encoding (utf-8, base64)' },
      ],
      [{ name: 'resource_id', type: 'string', description: 'Resource identifier' }],
    ],
  },
  {
    name: 'search',
    basenames: [
      'search_records',
      'find_entries',
      'lookup_data',
      'scan_database',
      'query_index',
      'search_index',
      'find_matches',
      'locate_records',
      'discover_entries',
      'hunt_records',
    ],
    descriptionTemplates: [
      'Searches records in the database matching the given criteria',
      'Finds entries that match the specified search parameters',
      'Looks up data by searching across all indexed fields',
      'Scans the database for records matching the query string',
      'Queries the search index for matching documents and records',
    ],
    parameterSets: [
      [
        { name: 'query', type: 'string', description: 'Search query' },
        { name: 'limit', type: 'number', description: 'Max results' },
      ],
      [
        { name: 'query', type: 'string', description: 'Search query string' },
        { name: 'filters', type: 'string', description: 'JSON filter object' },
      ],
      [
        { name: 'term', type: 'string', description: 'Search term' },
        { name: 'scope', type: 'string', description: 'Search scope (all, title, body)' },
        { name: 'limit', type: 'number', description: 'Maximum results to return' },
      ],
    ],
  },
  {
    name: 'metrics',
    basenames: [
      'get_metrics',
      'fetch_statistics',
      'retrieve_analytics',
      'pull_metrics_data',
      'load_statistics',
      'query_metrics',
      'obtain_analytics',
      'read_metrics',
      'collect_statistics',
      'gather_analytics',
    ],
    descriptionTemplates: [
      'Gets metrics data for the specified time range and dimensions',
      'Fetches statistical summaries and aggregations from the metrics store',
      'Retrieves analytics data with breakdowns by the specified dimensions',
      'Pulls metrics including counts, rates, and percentile distributions',
      'Loads statistics for performance monitoring and business intelligence',
    ],
    parameterSets: [
      [
        { name: 'metric_name', type: 'string', description: 'Metric identifier' },
        { name: 'period', type: 'string', description: 'Time period (1h, 24h, 7d, 30d)' },
      ],
      [
        { name: 'metric_name', type: 'string', description: 'Metric name' },
        { name: 'from', type: 'string', description: 'Start time (ISO 8601)' },
        { name: 'to', type: 'string', description: 'End time (ISO 8601)' },
      ],
      [{ name: 'category', type: 'string', description: 'Metrics category' }],
    ],
  },
];

/**
 * Deterministic PRNG (mulberry32) for reproducible tool generation.
 */
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type GeneratedTool = {
  name: string;
  description: string;
  parameters: Array<{ name: string; type: string; description: string }>;
  cluster: string;
  clusterIndex: number;
};

/**
 * Generate N tools distributed across clusters.
 * Uses deterministic seeding for reproducibility.
 */
export function generateTools(toolCount: number, seed: number): GeneratedTool[] {
  const rng = seededRandom(seed);
  const tools: GeneratedTool[] = [];
  const usedNames = new Set<string>();

  // Distribute tools across clusters proportionally
  const toolsPerCluster = Math.ceil(toolCount / clusters.length);

  for (const cluster of clusters) {
    let clusterToolCount = 0;

    for (let i = 0; i < cluster.basenames.length && tools.length < toolCount; i++) {
      if (clusterToolCount >= toolsPerCluster) break;

      let name = cluster.basenames[i]!;

      // If name is taken (shouldn't happen with basenames, but safety), add suffix
      if (usedNames.has(name)) {
        name = `${name}_v${i + 1}`;
      }
      usedNames.add(name);

      const descIdx = Math.floor(rng() * cluster.descriptionTemplates.length);
      const paramIdx = Math.floor(rng() * cluster.parameterSets.length);

      tools.push({
        name,
        description: cluster.descriptionTemplates[descIdx]!,
        parameters: cluster.parameterSets[paramIdx]!,
        cluster: cluster.name,
        clusterIndex: i,
      });

      clusterToolCount++;
    }
  }

  // If we still need more tools, add suffixed variants
  let suffix = 2;
  while (tools.length < toolCount) {
    const baseCluster = clusters[tools.length % clusters.length]!;
    const baseIdx = Math.floor(rng() * baseCluster.basenames.length);
    const baseName = baseCluster.basenames[baseIdx]!;
    const name = `${baseName}_v${suffix}`;

    if (!usedNames.has(name)) {
      usedNames.add(name);
      const descIdx = Math.floor(rng() * baseCluster.descriptionTemplates.length);
      const paramIdx = Math.floor(rng() * baseCluster.parameterSets.length);

      tools.push({
        name,
        description: baseCluster.descriptionTemplates[descIdx]!,
        parameters: baseCluster.parameterSets[paramIdx]!,
        cluster: baseCluster.name,
        clusterIndex: tools.length,
      });
    }
    suffix++;
  }

  return tools.slice(0, toolCount);
}
