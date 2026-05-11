import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import type { StoragePort } from "../ports/storage";
import type { MemoryNode, MemoryPalace } from "../domain/memory";

interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

function userPrefix(userId: string): string {
  return `users/${userId}`;
}

function toS3Key(userId: string, path: string): string {
  const cleanPath = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return `${userPrefix(userId)}/${cleanPath}`;
}

function fromS3Key(userId: string, key: string): string {
  const prefix = `${userPrefix(userId)}/`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

function s3KeyToMemoryNode(key: string, content?: string): MemoryNode {
  const parts = key.split("/");
  const name = parts[parts.length - 1] || "";
  const isDir = key.endsWith("/");
  const path = "/" + parts.join("/");

  return {
    id: key,
    path,
    name,
    type: isDir ? "directory" : "file",
    content,
    metadata: {
      tags: [],
      importance: 0.5,
      references: [],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export class S3StorageAdapter implements StoragePort {
  private client: S3Client;
  private bucket: string;

  constructor(config?: Partial<S3Config>) {
    this.bucket = config?.bucket ?? getEnvOrThrow("S3_BUCKET");
    this.client = new S3Client({
      endpoint: config?.endpoint ?? process.env.S3_ENDPOINT,
      region: config?.region ?? getEnvOrThrow("AWS_REGION"),
      credentials: {
        accessKeyId: config?.accessKeyId ?? getEnvOrThrow("AWS_ACCESS_KEY_ID"),
        secretAccessKey:
          config?.secretAccessKey ?? getEnvOrThrow("AWS_SECRET_ACCESS_KEY"),
      },
      forcePathStyle: !!process.env.S3_ENDPOINT,
    });
  }

  async listNodes(userId: string, path: string): Promise<MemoryNode[]> {
    const prefix = toS3Key(userId, path);
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      Delimiter: "/",
    });

    const response = await this.client.send(command);
    const nodes: MemoryNode[] = [];

    for (const cp of response.CommonPrefixes ?? []) {
      const key = cp.Prefix ?? "";
      nodes.push(s3KeyToMemoryNode(fromS3Key(userId, key)));
    }

    for (const obj of response.Contents ?? []) {
      const key = obj.Key ?? "";
      if (key !== prefix) {
        nodes.push(s3KeyToMemoryNode(fromS3Key(userId, key)));
      }
    }

    return nodes;
  }

  async getNode(userId: string, path: string): Promise<MemoryNode | null> {
    const key = toS3Key(userId, path);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const response = await this.client.send(command);
      const body = await streamToString(response.Body as Readable);

      return s3KeyToMemoryNode(fromS3Key(userId, key), body);
    } catch {
      // Check if it's a directory
      const listCmd = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: key + "/",
        MaxKeys: 1,
      });
      const listResponse = await this.client.send(listCmd);

      if ((listResponse.Contents?.length ?? 0) > 0 || (listResponse.CommonPrefixes?.length ?? 0) > 0) {
        return s3KeyToMemoryNode(fromS3Key(userId, key + "/"));
      }

      return null;
    }
  }

  async putNode(userId: string, node: MemoryNode): Promise<void> {
    const key = toS3Key(userId, node.path);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: node.content ?? "",
      ContentType: "text/plain",
      Metadata: {
        "x-memory-tags": JSON.stringify(node.metadata.tags),
        "x-memory-importance": String(node.metadata.importance),
        "x-memory-references": JSON.stringify(node.metadata.references),
        "x-memory-created": node.createdAt,
        "x-memory-updated": node.updatedAt,
      },
    });

    await this.client.send(command);
  }

  async deleteNode(userId: string, path: string): Promise<void> {
    const key = toS3Key(userId, path);
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.client.send(command);
  }

  async searchNodes(
    userId: string,
    pattern: string,
    path?: string
  ): Promise<MemoryNode[]> {
    const prefix = path ? toS3Key(userId, path) : userPrefix(userId);
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
    });

    const response = await this.client.send(command);
    const nodes: MemoryNode[] = [];
    const lowerPattern = pattern.toLowerCase();

    for (const obj of response.Contents ?? []) {
      const key = obj.Key ?? "";
      const relPath = fromS3Key(userId, key);

      if (relPath.toLowerCase().includes(lowerPattern)) {
        const node = await this.getNode(userId, relPath);
        if (node) nodes.push(node);
      }
    }

    return nodes;
  }

  async loadPalace(userId: string): Promise<MemoryPalace> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: userPrefix(userId),
    });

    const response = await this.client.send(command);
    const rootNodes: MemoryNode[] = [];

    for (const obj of response.Contents ?? []) {
      const key = obj.Key ?? "";
      if (key.endsWith("/")) continue;

      const relPath = fromS3Key(userId, key);
      const node = await this.getNode(userId, relPath);
      if (node) rootNodes.push(node);
    }

    return {
      wings: [],
      rootNodes,
    };
  }

  async savePalace(userId: string, palace: MemoryPalace): Promise<void> {
    const palaceKey = toS3Key(userId, ".palace/palace.json");
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: palaceKey,
      Body: JSON.stringify(palace, null, 2),
      ContentType: "application/json",
    });
    await this.client.send(command);
  }
}
