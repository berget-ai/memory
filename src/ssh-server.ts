import { Server } from "ssh2";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { generateKeyPairSync } from "crypto";

interface SSHConfig {
  port: number;
  apiUrl: string;
  devMode: boolean;
}

interface SessionState {
  userId: string;
  currentPath: string;
}

async function executeCommand(
  apiUrl: string,
  command: string,
  path: string,
  userId: string
): Promise<{ stdout: string; stderr: string; exitCode: number; currentPath: string }> {
  try {
    const response = await fetch(`${apiUrl}/memory/exec`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userId}`,
      },
      body: JSON.stringify({ command, path }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
      return {
        stdout: "",
        stderr: errorData.error || `Error: ${response.status}`,
        exitCode: 1,
        currentPath: path,
      };
    }

    const data = await response.json() as {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
      currentPath?: string;
    };
    return {
      stdout: data.stdout || "",
      stderr: data.stderr || "",
      exitCode: data.exitCode || 0,
      currentPath: data.currentPath || path,
    };
  } catch (err: any) {
    return {
      stdout: "",
      stderr: `Connection error: ${err.message || String(err)}`,
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
  const hostKeyPath = join(process.cwd(), "ssh_host_rsa_key");

  if (!existsSync(hostKeyPath)) {
    console.log("[SSH] Generating host key...");
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
    });
    writeFileSync(hostKeyPath, privateKey, { mode: 0o600 });
    console.log("[SSH] Host key generated");
  }

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
        if (config.devMode) {
          session.userId = ctx.username || "anonymous";
          ctx.accept();
          console.log(`[SSH] Authenticated (dev): ${session.userId}`);
        } else if (ctx.method === "publickey" && ctx.key) {
          session.userId = ctx.username;
          ctx.accept();
          console.log(`[SSH] Authenticated with key: ${session.userId}`);
        } else if (ctx.method === "password") {
          session.userId = ctx.username;
          ctx.accept();
          console.log(`[SSH] Authenticated: ${session.userId}`);
        } else {
          ctx.reject();
        }
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
          executeCommand(config.apiUrl, "help", session.currentPath, session.userId)
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

            for (const char of input) {
              const code = char.charCodeAt(0);

              if (code === 13) {
                // Enter
                channel.write("\r\n");

                const command = buffer.trim();
                buffer = "";

                if (command) {
                  const result = await executeCommand(
                    config.apiUrl,
                    command,
                    session.currentPath,
                    session.userId
                  );

                  if (result.currentPath) {
                    session.currentPath = result.currentPath;
                  }

                  if (result.stdout) {
                    // Convert \n to \r\n for proper terminal rendering
                    const normalized = result.stdout.replace(/\n/g, "\r\n");
                    channel.write(normalized);
                    if (!normalized.endsWith("\r\n")) {
                      channel.write("\r\n");
                    }
                  }

                  if (result.stderr) {
                    const normalized = result.stderr.replace(/\n/g, "\r\n");
                    channel.write(`\x1b[31m${normalized}\x1b[0m`);
                    if (!normalized.endsWith("\r\n")) {
                      channel.write("\r\n");
                    }
                  }
                }

                channel.write(generatePrompt(session));
              } else if (code === 127 || code === 8) {
                // Backspace
                if (buffer.length > 0) {
                  buffer = buffer.slice(0, -1);
                  channel.write("\b \b");
                }
              } else if (code === 3) {
                // Ctrl+C
                buffer = "";
                channel.write("^C\r\n");
                channel.write(generatePrompt(session));
              } else if (code === 4) {
                // Ctrl+D (EOF)
                channel.write("logout\r\n");
                channel.close();
                return;
              } else if (code === 12) {
                // Ctrl+L
                channel.write("\x1b[2J\x1b[H");
                channel.write(generatePrompt(session));
              } else if (code >= 32 && code < 127) {
                // Regular character
                buffer += char;
                channel.write(char);
              }
            }
          });

          channel.on("close", () => {
            console.log(`[SSH] Session closed: ${session.userId}`);
          });
        });

        sessionStream.on("exec", (accept, _reject, info) => {
          const channel = accept();
          const command = info.command;

          executeCommand(config.apiUrl, command, session.currentPath, session.userId)
            .then((result) => {
              // Update path even in exec mode for cd commands
              if (result.currentPath) {
                session.currentPath = result.currentPath;
              }
              
              if (result.stdout) {
                channel.write(result.stdout);
              }
              if (result.stderr) {
                channel.stderr.write(result.stderr);
              }
              channel.exit(result.exitCode || 0);
              channel.close();
            })
            .catch((err: Error) => {
              channel.stderr.write(`Error: ${err.message}\n`);
              channel.exit(1);
              channel.close();
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
const API_URL = process.env.API_URL || "http://localhost:3456";
const DEV_MODE = process.env.DEV_MODE !== "false";

const server = createSSHServer({
  port: SSH_PORT,
  apiUrl: API_URL,
  devMode: DEV_MODE,
});

server.listen(SSH_PORT, "0.0.0.0", () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  🔐 Berget Memory SSH Server                             ║
╠══════════════════════════════════════════════════════════╣
║  Port:        ${SSH_PORT}                                   ║
║  API URL:     ${API_URL}                        ║
║  Mode:        ${DEV_MODE ? "DEV (any auth accepted)" : "PRODUCTION"}          ║
╠══════════════════════════════════════════════════════════╣
║  Connect with:                                           ║
║    ssh -p ${SSH_PORT} localhost                            ║
║    ssh -p ${SSH_PORT} user@localhost                       ║
╚══════════════════════════════════════════════════════════╝
`);
});
