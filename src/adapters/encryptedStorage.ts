import { createHash, createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "crypto";
import type { StoragePort } from "../ports/storage";
import type { MemoryNode, MemoryPalace } from "../domain/memory";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
// const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

function deriveKey(userId: string, secret: string): Buffer {
  const salt = createHash("sha256").update(userId).digest();
  return pbkdf2Sync(secret, salt, ITERATIONS, KEY_LENGTH, "sha256");
}

function encrypt(text: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const result = Buffer.concat([iv, authTag, encrypted]);
  return result.toString("base64");
}

function decrypt(encryptedData: string, key: Buffer): string {
  const data = Buffer.from(encryptedData, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export class EncryptedStorageAdapter implements StoragePort {
  private keyCache: Map<string, Buffer> = new Map();

  constructor(
    private storage: StoragePort,
    private secretProvider: (userId: string) => string | Promise<string>
  ) {}

  private async getKey(userId: string): Promise<Buffer> {
    if (!this.keyCache.has(userId)) {
      const secret = await this.secretProvider(userId);
      const key = deriveKey(userId, secret);
      this.keyCache.set(userId, key);
    }
    return this.keyCache.get(userId)!;
  }

  private async encryptNode(node: MemoryNode, userId: string): Promise<MemoryNode> {
    const key = await this.getKey(userId);
    return {
      ...node,
      content: node.content ? encrypt(node.content, key) : undefined,
    };
  }

  private async decryptNode(node: MemoryNode, userId: string): Promise<MemoryNode> {
    const key = await this.getKey(userId);
    return {
      ...node,
      content: node.content ? decrypt(node.content, key) : undefined,
    };
  }

  async listNodes(userId: string, path: string): Promise<MemoryNode[]> {
    const nodes = await this.storage.listNodes(userId, path);
    return Promise.all(nodes.map((n) => this.decryptNode(n, userId)));
  }

  async getNode(userId: string, path: string): Promise<MemoryNode | null> {
    const node = await this.storage.getNode(userId, path);
    if (!node) return null;
    return this.decryptNode(node, userId);
  }

  async putNode(userId: string, node: MemoryNode): Promise<void> {
    const encrypted = await this.encryptNode(node, userId);
    await this.storage.putNode(userId, encrypted);
  }

  async deleteNode(userId: string, path: string): Promise<void> {
    await this.storage.deleteNode(userId, path);
  }

  async searchNodes(
    userId: string,
    pattern: string,
    path?: string
  ): Promise<MemoryNode[]> {
    const nodes = await this.storage.searchNodes(userId, pattern, path);
    return Promise.all(nodes.map((n) => this.decryptNode(n, userId)));
  }

  async loadPalace(userId: string): Promise<MemoryPalace> {
    const palace = await this.storage.loadPalace(userId);
    return {
      ...palace,
      rootNodes: await Promise.all(
        palace.rootNodes.map((n) => this.decryptNode(n, userId))
      ),
    };
  }

  async savePalace(userId: string, palace: MemoryPalace): Promise<void> {
    await this.storage.savePalace(userId, palace);
  }
}
