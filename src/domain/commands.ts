export type Command =
  | { type: "ls"; path?: string; flags: string[] }
  | { type: "cat"; path: string }
  | { type: "grep"; pattern: string; path?: string; flags: string[]; regex?: boolean; include?: string }
  | { type: "mkdir"; path: string }
  | { type: "touch"; path: string }
  | { type: "rm"; path: string; recursive: boolean }
  | { type: "write"; path: string; content: string }
  | { type: "cd"; path: string }
  | { type: "pwd" }
  | { type: "tree"; path?: string; depth?: number }
  | { type: "find"; pattern: string; path?: string; regex?: boolean }
  | { type: "meta"; path: string; key?: string; value?: string }
  | { type: "tag"; path: string; tags: string[]; remove?: boolean }
  | { type: "search"; query: string; path?: string; limit?: number }
  | { type: "vsearch"; query: string; path?: string; limit?: number }
  | { type: "index"; path?: string }
  | { type: "stats" }
  | { type: "help" };

export const VALID_COMMANDS = [
  "ls",
  "cat",
  "grep",
  "mkdir",
  "touch",
  "rm",
  "write",
  "cd",
  "pwd",
  "tree",
  "find",
  "meta",
  "tag",
  "search",
  "vsearch",
  "index",
  "stats",
  "help",
] as const;

export type CommandType = (typeof VALID_COMMANDS)[number];

export interface Pipeline {
  commands: Command[];
}
