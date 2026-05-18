import { Server } from "ssh2";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { CommandHandler } from "./services/commandHandler";
import { FileSystemStorageAdapter } from "./adapters/fileSystemStorage";
import { InMemoryVectorStore } from "./adapters/inMemoryVectorStore";
import { MemoryEventBus } from "./services/eventBus";

interface SSHConfig {
  port: number;
}

interface SessionState {
  userId: string;
  currentPath: string;
}

// Initialize storage and command handler directly (no HTTP)
const storage = new FileSystemStorageAdapter();
const vectorStore = new InMemoryVectorStore();
const eventBus = new MemoryEventBus();
const commandHandler = new CommandHandler(storage, vectorStore, (event) => {
  eventBus.emit(event);
});

async function executeCommand(
  command: string,
  path: string,
  userId: string
): Promise<{ stdout: string; stderr: string; exitCode: number; currentPath: string }> {
  try {
    const result = await commandHandler.execute(
      { type: "command", value: command },
      { userId, currentPath: path, palace: { wings: [], rootNodes: [] } }
    );
    return result;
  } catch (err: any) {
    return {
      stdout: "",
      stderr: `Error: ${err.message || String(err)}`,
      exitCode: 1,
      currentPath: path,
    };
  }
}

function generatePrompt(session: SessionState): string {
  const path = session.currentPath;
  const displayPath = path === "/" ? "~" : path;
  return `${session.userId}@memory:${displayPath}$ `;
}

export function createSSHServer(config: SSHConfig): Server {
  const hostKeyPath = join(process.cwd(), "ssh-keys", "ssh_host_ed25519_key");

  if (!existsSync(hostKeyPath)) {
    throw new Error(
      `SSH host key not found at ${hostKeyPath}. ` +
      `Ensure secret 'memory-ssh-host-key' is mounted at /app/ssh-keys`
    );
  }

  console.log("[SSH] Using mounted host key");
  const hostKey = readFileSync(hostKeyPath);

  const server = new Server(
    {
      hostKeys: [hostKey],
    },
    (client) => {
      console.log("[SSH] Client connected");

      const session: SessionState = {
        userId: "anonymous",
        currentPath: "/",
      };

      client.on("authentication", (ctx) => {
        // Accept any authentication - user isolation is handled by userId
        session.userId = ctx.username || "anonymous";
        ctx.accept();
        console.log(`[SSH] Authenticated: ${session.userId}`);
      });

      client.on("ready", () => {
        console.log(`[SSH] Session ready for: ${session.userId}`);
      });

      client.on("session", (accept) => {
        const sessionStream = accept();

        sessionStream.on("pty", (accept) => {
          accept();
        });

        sessionStream.on("shell", (accept) => {
          const channel = accept();

          channel.write("\r\n");
          channel.write("  \x1b[1;36mBerget Memory Palace\x1b[0m\r\n");
          channel.write("  Your persistent memory storage via SSH\r\n");
          channel.write("\r\n");
          channel.write("  Quick start:\r\n");
          channel.write("    mkdir /projects/myapp    Create a project\r\n");
          channel.write("    write /file.md content   Store a memory\r\n");
          channel.write("    cat /file.md             Read a memory\r\n");
          channel.write("    grep pattern / -r        Search all files\r\n");
          channel.write("    search query /path       Full-text search\r\n");
          channel.write("    tag /file.md work        Tag for organization\r\n");
          channel.write("    tree / -L3               View structure\r\n");
          channel.write("    help                     All commands\r\n");
          channel.write("\r\n");
          channel.write("  Tips: Keep files <500 lines. Use YYYY-MM-DD dates.\r\n");
          channel.write("        Store conversations in /conversations/.\r\n");
          channel.write("\r\n");

          // Execute help command to show available commands immediately
          executeCommand("help", session.currentPath, session.userId)
            .then((helpResult) => {
              if (helpResult.stdout) {
                const normalized = helpResult.stdout.replace(/\n/g, "\r\n");
                channel.write(normalized);
                channel.write("\r\n\r\n");
              }
              channel.write(generatePrompt(session));
            })
            .catch(() => {
              channel.write(generatePrompt(session));
            });

          let buffer = "";

          channel.on("data", async (data: Buffer) => {
            const input = data.toString();

            // Handle special characters
            for (const char of input) {
              if (char === "\r" || char === "\n") {
                // Execute command
                channel.write("\r\n");
                const command = buffer.trim();
                buffer = "";

                if (command) {
                  try {
                    const result = await executeCommand(
                      command,
                      session.currentPath,
                      session.userId
                    );

                    if (result.stdout) {
                      const normalized = result.stdout.replace(/\n/g, "\r\n");
                      channel.write(normalized);
                      channel.write("\r\n");
                    }
                    if (result.stderr) {
                      const normalized = result.stderr.replace(/\n/g, "\r\n");
                      channel.write(normalized);
                      channel.write("\r\n");
                    }

                    if (result.currentPath) {
                      session.currentPath = result.currentPath;
                    }
                  } catch (err: any) {
                    channel.write(`Error: ${err.message || String(err)}\r\n`);
                  }
                }

                channel.write(generatePrompt(session));
              } else if (char === "\x7f" || char === "\b") {
                // Backspace
                if (buffer.length > 0) {
                  buffer = buffer.slice(0, -1);
                  channel.write("\b \b");
                }
              } else if (char === "\x03") {
                // Ctrl+C
                buffer = "";
                channel.write("^C\r\n");
                channel.write(generatePrompt(session));
              } else if (char >= " ") {
                buffer += char;
                channel.write(char);
              }
            }
          });

          channel.on("close", () => {
            console.log(`[SSH] Session closed: ${session.userId}`);
          });
        });

        sessionStream.on("exec", (accept, reject, info) => {
          const channel = accept();
          const command = info.command;

          executeCommand(command, session.currentPath, session.userId)
            .then((result) => {
              if (result.stdout) {
                channel.write(result.stdout);
              }
              if (result.stderr) {
                channel.stderr.write(result.stderr);
              }
              channel.exit(result.exitCode);
            })
            .catch((err: any) => {
              channel.stderr.write(`Error: ${err.message || String(err)}\n`);
              channel.exit(1);
            });
        });
      });

      client.on("end", () => {
        console.log(`[SSH] Client disconnected: ${session.userId}`);
      });

      client.on("error", (err: Error) => {
        console.error(`[SSH] Client error:`, err.message);
      });
    }
  );

  return server;
}

// Start server
const SSH_PORT = process.env.SSH_PORT ? parseInt(process.env.SSH_PORT, 10) : 2222;

const server = createSSHServer({
  port: SSH_PORT,
});

server.listen(SSH_PORT, "0.0.0.0", () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  🔐 Berget Memory SSH Server                             ║
╠══════════════════════════════════════════════════════════╣
║  Port:        ${SSH_PORT}                                   ║
║  Direct mode: No HTTP API needed                         ║
║  User isolation: Each user gets their own /users/{id}    ║
╠══════════════════════════════════════════════════════════╣
║  Connect with:                                           ║
║    ssh -p ${SSH_PORT} localhost                            ║
║    ssh -p ${SSH_PORT} user@localhost                       ║
╚══════════════════════════════════════════════════════════╝
`);
});
