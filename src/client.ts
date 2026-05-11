#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("memory")
  .description("CLI for Berget Memory Palace")
  .version("1.0.0");

const API_URL = process.env.MEMORY_API || "http://localhost:3456";

async function execCommand(command: string, path: string = "/") {
  const response = await fetch(`${API_URL}/memory/exec`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer dev-token",
    },
    body: JSON.stringify({ command, path }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
    console.error(`Error: ${errorData.error || response.status}`);
    process.exit(1);
  }

  const data = await response.json() as { stdout?: string; stderr?: string };
  
  if (data.stdout) console.log(data.stdout);
  if (data.stderr) console.error(data.stderr);
  
  return data;
}

program
  .command("exec <command>")
  .description("Execute a memory command")
  .option("-p, --path <path>", "Working directory", "/")
  .action(async (command, options) => {
    await execCommand(command, options.path);
  });

program
  .command("ls [path]")
  .description("List directory contents")
  .action(async (path = "/") => {
    await execCommand("ls -l " + path);
  });

program
  .command("cat <path>")
  .description("Display file contents")
  .action(async (path) => {
    await execCommand("cat " + path);
  });

program
  .command("mkdir <path>")
  .description("Create a directory")
  .action(async (path) => {
    await execCommand("mkdir " + path);
  });

program
  .command("write <path> <content>")
  .description("Write content to a file")
  .action(async (path, content) => {
    await execCommand(`write ${path} "${content}"`);
  });

program
  .command("grep <pattern> [path]")
  .description("Search for pattern")
  .option("-r, --recursive", "Search recursively")
  .action(async (pattern, path = "/", options) => {
    const cmd = options.recursive ? `grep ${pattern} ${path} -r` : `grep ${pattern} ${path}`;
    await execCommand(cmd);
  });

program
  .command("search <query>")
  .description("Full-text search")
  .option("-p, --path <path>", "Search path", "/")
  .action(async (query, options) => {
    await execCommand(`search "${query}" ${options.path}`);
  });

program
  .command("tag <path> <tags...>")
  .description("Add tags to a file")
  .action(async (path, tags) => {
    await execCommand(`tag ${path} ${tags.join(" ")}`);
  });

program
  .command("tree [path]")
  .description("Display directory tree")
  .option("-L, --depth <n>", "Max depth", "3")
  .action(async (path = "/", options) => {
    await execCommand(`tree ${path} -L${options.depth}`);
  });

program
  .command("stats")
  .description("Display memory statistics")
  .action(async () => {
    await execCommand("stats");
  });

program
  .command("setup")
  .description("Setup initial memory palace structure")
  .action(async () => {
    console.log("Setting up memory palace...");
    await execCommand("mkdir /projects");
    await execCommand("mkdir /conversations");
    await execCommand("mkdir /knowledge");
    await execCommand("mkdir /people");
    await execCommand("mkdir /tasks");
    console.log("Memory palace created!");
    console.log("\nStructure:");
    await execCommand("tree / -L1");
  });

program.parse();
