import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import { createMemoryRouter } from "../src/routes/memory";
import { createAuthMiddleware } from "../src/middleware/auth";
import { errorHandler } from "../src/middleware/errorHandler";
import { CommandHandler } from "../src/services/commandHandler";
import { MockStorageAdapter, MockAuthAdapter, MockVectorStore } from "./mocks";

function createApp() {
  const auth = new MockAuthAdapter();
  const storage = new MockStorageAdapter();
  const vectorStore = new MockVectorStore();
  const commandHandler = new CommandHandler(storage, vectorStore);
  const authMiddleware = createAuthMiddleware(auth);

  const app = new Koa();
  app.use(errorHandler);
  app.use(bodyParser());
  app.use(authMiddleware);

  const memoryRouter = createMemoryRouter(commandHandler);
  app.use(memoryRouter.routes());
  app.use(memoryRouter.allowedMethods());

  return { app, storage, vectorStore };
}

describe("Integration Tests", () => {
  let app: Koa;
  let testId: number = 0;

  beforeEach(() => {
    const created = createApp();
    app = created.app;
    testId++;
  });

  const exec = (command: string, path = "/") =>
    request(app.callback())
      .post("/memory/exec")
      .set("Authorization", "Bearer valid-token")
      .send({ command, path });

  const batch = (commands: string[], path = "/") =>
    request(app.callback())
      .post("/memory/batch")
      .set("Authorization", "Bearer valid-token")
      .send({ commands, path });

  describe("Authentication", () => {
    it("rejects requests without auth header", async () => {
      const res = await request(app.callback())
        .post("/memory/exec")
        .send({ command: "ls", path: "/" });

      expect(res.status).toBe(401);
    });

    it("rejects invalid tokens", async () => {
      const res = await request(app.callback())
        .post("/memory/exec")
        .set("Authorization", "Bearer invalid")
        .send({ command: "ls", path: "/" });

      expect(res.status).toBe(401);
    });

    it("accepts valid tokens", async () => {
      const res = await exec("ls /");
      expect(res.status).toBe(200);
    });
  });

  describe("Basic Commands", () => {
    it("creates directories", async () => {
      const res = await exec("mkdir /projects");
      expect(res.status).toBe(200);
      expect(res.body.stdout).toContain("Created directory");
    });

    it("lists directory contents", async () => {
      await exec("mkdir /test-list");
      await exec('write /test-list/file1.md "content1"');
      await exec('write /test-list/file2.md "content2"');

      const res = await exec("ls /test-list");
      expect(res.status).toBe(200);
      expect(res.body.stdout).toContain("file1.md");
      expect(res.body.stdout).toContain("file2.md");
    });

    it("writes and reads files", async () => {
      await exec('write /readme.md "Hello World"');
      const res = await exec("cat /readme.md");
      expect(res.body.stdout).toBe("Hello World");
    });

    it("changes directory", async () => {
      await exec("mkdir /mydir");
      const res = await exec("cd /mydir");
      expect(res.body.currentPath).toBe("/mydir");
    });

    it("prints working directory", async () => {
      const res = await exec("pwd", "/projects");
      expect(res.body.stdout).toBe("/projects");
    });

    it("shows tree structure", async () => {
      await exec("mkdir /tree-test");
      await exec("mkdir /tree-test/subdir");
      await exec('write /tree-test/file.md "content"');

      const res = await exec("tree /tree-test -L2");
      expect(res.body.stdout).toContain("/tree-test");
      expect(res.body.stdout).toContain("subdir/");
      expect(res.body.stdout).toContain("file.md");
    });
  });

  describe("Search Operations", () => {
    it("greps file content", async () => {
      await exec('write /search-target.md "apple banana cherry"');
      const res = await exec("grep banana /search-target.md");
      expect(res.body.stdout).toContain("banana");
    });

    it("greps recursively", async () => {
      await exec("mkdir /search-dir");
      await exec('write /search-dir/a.md "find me here"');
      await exec('write /search-dir/b.md "not here"');

      const res = await exec('grep "find me" /search-dir -r');
      expect(res.body.stdout).toContain("find me");
    });

    it("finds files by name", async () => {
      await exec("mkdir /find-test");
      await exec('write /find-test/config.yaml "yaml"');
      await exec('write /find-test/app.json "json"');

      const res = await exec("find config /find-test");
      expect(res.body.stdout).toContain("config.yaml");
    });
  });

  describe("Metadata & Tags", () => {
    it("adds tags to files", async () => {
      await exec('write /tagged.md "content"');
      await exec("tag /tagged.md backend api");

      const res = await exec("meta /tagged.md");
      expect(res.body.stdout).toContain("backend");
      expect(res.body.stdout).toContain("api");
    });

    it("sets importance", async () => {
      await exec('write /important.md "content"');
      await exec("meta /important.md importance 0.95");

      const res = await exec("meta /important.md");
      expect(res.body.stdout).toContain("0.95");
    });

    it("removes tags", async () => {
      await exec('write /remove-tag.md "content"');
      await exec("tag /remove-tag.md old new");
      await exec("tag /remove-tag.md old -d");

      const res = await exec("meta /remove-tag.md");
      expect(res.body.stdout).not.toContain("old");
      expect(res.body.stdout).toContain("new");
    });
  });

  describe("Batch Operations", () => {
    it("executes multiple commands sequentially", async () => {
      const res = await batch([
        "mkdir /batch-dir",
        "cd /batch-dir",
        'write file.md "batch content"',
        "cat file.md",
      ]);

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(4);
      expect(res.body.finalPath).toBe("/batch-dir");
      expect(res.body.results[3].stdout).toBe("batch content");
    });

    it("limits batch size to 50 commands", async () => {
      const commands = Array(51).fill("pwd");
      const res = await batch(commands);
      // Zod validation catches oversized batches
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Error Handling", () => {
    it("prevents deleting directories without -r", async () => {
      await exec("mkdir /protected");
      const res = await exec("rm /protected");
      expect(res.body.exitCode).toBe(1);
      expect(res.body.stderr).toContain("use -r");
    });
  });

  describe("Agent Tips", () => {
    it("provides tips after mkdir", async () => {
      const res = await exec("mkdir /tip-test");
      expect(res.body.tips).toBeDefined();
      expect(res.body.tips.length).toBeGreaterThan(0);
      expect(res.body.tips[0]).toContain("TIP:");
    });

    it("provides tips after write", async () => {
      const res = await exec('write /tip-test.md "content"');
      expect(res.body.tips).toBeDefined();
      expect(res.body.tips.length).toBeGreaterThan(0);
    });

    it("provides tips after search", async () => {
      await exec('write /searchable.md "test content"');
      const res = await exec("search test");
      expect(res.body.tips).toBeDefined();
    });
  });

  describe("File Type Filtering", () => {
    beforeEach(async () => {
      await exec("mkdir /docs");
      await exec('write /docs/readme.md "Markdown content here"');
      await exec('write /docs/config.yaml "api port 3000"');
      await exec('write /docs/script.js "console hello"');
    });

    it("filters by file extension", async () => {
      // Grep with --include filter finds only matching extensions
      const mdRes = await exec("grep content /docs -r --include='*.md'");
      expect(mdRes.body.stdout).toContain("readme.md");
      expect(mdRes.body.stdout).not.toContain("config.yaml");
    });

    it("returns no matches when filter excludes all", async () => {
      const res = await exec("grep Markdown /docs -r --include='*.yaml'");
      expect(res.body.exitCode).toBe(1);
      expect(res.body.stdout).toBe("");
    });
  });

  describe("Implicit Directories", () => {
    it("lists implicit directory contents", async () => {
      await exec("mkdir /deep/nested/path");
      
      const res = await exec("ls /deep", "/");
      expect(res.status).toBe(200);
      expect(res.body.stdout).toContain("nested/");
    });
  });

  describe("Multi-line Content", () => {
    it("preserves newlines when writing and reading", async () => {
      const content = "Line 1\nLine 2\nLine 3";
      await exec(`write /multiline.md "${content}"`);
      
      const res = await exec("cat /multiline.md");
      expect(res.body.stdout).toContain("Line 1");
      expect(res.body.stdout).toContain("Line 2");
      expect(res.body.stdout).toContain("Line 3");
    });

    it("handles markdown with headers and lists", async () => {
      const content = "# Title\n\n## Section\n- Item 1\n- Item 2\n\nParagraph text";
      await exec(`write /markdown.md "${content}"`);
      
      const res = await exec("cat /markdown.md");
      expect(res.body.stdout).toContain("# Title");
      expect(res.body.stdout).toContain("- Item 1");
    });
  });

  describe("Line Numbers in Grep", () => {
    beforeEach(async () => {
      await exec('write /numbered.md "Line one\nLine two\nLine three\nLine four"');
    });

    it("shows correct line numbers", async () => {
      const res = await exec("grep Line /numbered.md");
      expect(res.body.stdout).toContain("numbered.md:1:");
      expect(res.body.stdout).toContain("numbered.md:2:");
      expect(res.body.stdout).toContain("numbered.md:3:");
      expect(res.body.stdout).toContain("numbered.md:4:");
    });

    it("finds specific line content", async () => {
      const res = await exec('grep "Line three" /numbered.md');
      expect(res.body.stdout).toContain("numbered.md:3:");
    });
  });

  describe("Complex Workflows", () => {
    it("sets up a project structure", async () => {
      await batch([
        "mkdir /project",
        "mkdir /project/src",
        "mkdir /project/docs",
        'write /project/README.md "# Project"',
        'write /project/src/main.ts "console.log("hello")"',
        'write /project/docs/api.md "API docs"',
      ]);

      const root = await exec("ls /project");
      expect(root.body.stdout).toContain("src/");
      expect(root.body.stdout).toContain("docs/");
      expect(root.body.stdout).toContain("README.md");

      const src = await exec("ls /project/src");
      expect(src.body.stdout).toContain("main.ts");
    });

    it("manages conversation context", async () => {
      await batch([
        "mkdir /conversations/client-acme",
        'write /conversations/client-acme/context.md "Client: ACME Corp\\nBudget: $50k"',
        'write /conversations/client-acme/2024-01-15.md "Meeting notes"',
      ]);

      const context = await exec("cat /conversations/client-acme/context.md");
      expect(context.body.stdout).toContain("ACME Corp");
      expect(context.body.stdout).toContain("$50k");
    });

    it("uses pipelines", async () => {
      await exec("mkdir /pipe-test");
      await exec('write /pipe-test/a.md "alpha"');
      await exec('write /pipe-test/b.md "beta"');
      await exec('write /pipe-test/c.json "json"');

      const res = await exec("ls /pipe-test | grep md");
      expect(res.body.stdout).toContain("a.md");
      expect(res.body.stdout).toContain("b.md");
    });
  });

  describe("Vector Search", () => {
    it("performs semantic search", async () => {
      await batch([
        'write /dogs.md "Dogs are loyal pets and working animals"',
        'write /cats.md "Cats are independent pets"',
        'write /cars.md "Cars are motorized vehicles"',
      ]);

      await exec("index /");
      const res = await exec("vsearch loyal pets");
      expect(res.body.stdout).toContain("dogs.md");
    });
  });
});
