export interface AgentTip {
  id: string;
  category: "structure" | "search" | "performance" | "organization" | "discovery";
  message: string;
  trigger: string[];
}

const TIPS: AgentTip[] = [
  {
    id: "structure-wings",
    category: "structure",
    message: "💡 TIP: Organize your memory palace with top-level 'wings' like /projects, /conversations, /knowledge, /people. Each wing contains 'rooms' (subdirs) and 'drawers' (files).",
    trigger: ["mkdir", "init", "setup"],
  },
  {
    id: "small-chunks",
    category: "performance",
    message: "💡 TIP: Keep files under 500 lines. Split large memories into focused files with clear names. Use `grep` and `search` to find connections.",
    trigger: ["write", "cat", "large"],
  },
  {
    id: "tag-everything",
    category: "organization",
    message: "💡 TIP: Tag files with relevant keywords: `tag <path> backend api auth`. Tags make `search` and `grep` much more effective.",
    trigger: ["write", "touch", "create"],
  },
  {
    id: "index-often",
    category: "performance",
    message: "💡 TIP: Run `index` after bulk imports to update the search index. For semantic search, use `vsearch` (vector search) instead of `grep` for conceptual queries.",
    trigger: ["batch", "import", "many"],
  },
  {
    id: "pipeline-power",
    category: "search",
    message: "💡 TIP: Chain commands with pipes: `ls /projects | grep api` or `find /docs | grep setup`. The output of each command feeds into the next.",
    trigger: ["|", "pipe", "chain"],
  },
  {
    id: "regex-patterns",
    category: "search",
    message: "💡 TIP: Use regex with /pattern/ syntax: `grep /TODO|FIXME|HACK/ -r` or `find /^2024-.*\\.md$/`. Escapes: use \\\\ for literal backslash.",
    trigger: ["grep", "find", "regex"],
  },
  {
    id: "context-continuity",
    category: "organization",
    message: "💡 TIP: Store conversation context in /conversations/<thread>/context.md. Update it after each session so future sessions have full context.",
    trigger: ["conversation", "context", "session"],
  },
  {
    id: "semantic-search",
    category: "discovery",
    message: "💡 TIP: For conceptual queries (not exact matches), use `vsearch <query>` instead of `grep`. It finds semantically similar content even with different wording.",
    trigger: ["search", "find", "similar"],
  },
  {
    id: "importance-ranking",
    category: "organization",
    message: "💡 TIP: Set importance on critical files: `meta <path> importance 0.95`. High-importance files rank higher in search results.",
    trigger: ["meta", "importance", "critical"],
  },
  {
    id: "tree-overview",
    category: "discovery",
    message: "💡 TIP: Use `tree [path] -L3` to get a quick overview of your memory structure. It's the fastest way to understand what's stored where.",
    trigger: ["ls", "structure", "overview"],
  },
  {
    id: "batch-operations",
    category: "performance",
    message: "💡 TIP: Use POST /memory/batch for multiple commands in one request. It maintains state (cwd) across commands and reduces API calls.",
    trigger: ["batch", "multiple", "many"],
  },
  {
    id: "memory-cleanup",
    category: "performance",
    message: "💡 TIP: Remove stale memories with `rm -r <path>`. For soft-delete, move to /archive/ instead. Keep your palace lean for faster searches.",
    trigger: ["rm", "delete", "cleanup"],
  },
  {
    id: "cross-references",
    category: "organization",
    message: "💡 TIP: Link related memories with references in content: 'See also: /knowledge/architecture/cqrs.md'. Use `grep 'See also' -r` to find all connections.",
    trigger: ["link", "reference", "connect"],
  },
  {
    id: "naming-convention",
    category: "structure",
    message: "💡 TIP: Use consistent naming: YYYY-MM-DD for dates, kebab-case for names. Examples: 2024-01-15-meeting.md, api-gateway-design.md",
    trigger: ["mkdir", "write", "name"],
  },
];

export function getTipsForCommand(commandStr: string): AgentTip[] {
  const lowerCmd = commandStr.toLowerCase();
  const matches = TIPS.filter((tip) =>
    tip.trigger.some((t) => lowerCmd.includes(t.toLowerCase()))
  );

  // Return max 2 tips to avoid overwhelming
  return matches.slice(0, 2);
}

export function getRandomTip(): AgentTip {
  return TIPS[Math.floor(Math.random() * TIPS.length)];
}

export function formatTips(tips: AgentTip[]): string {
  if (tips.length === 0) return "";
  return "\n\n" + tips.map((t) => t.message).join("\n\n");
}
