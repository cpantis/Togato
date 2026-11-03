/**
 * Stocarea fișierelor: disc local (dezvoltare, un singur server) sau S3 / Cloudflare R2.
 * Cheile au forma `<organizationId>/<categorie>/<uuid>` — niciodată derivate din numele fișierului.
 */
import fs from "fs/promises";
import path from "path";
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "../../config";

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(keys: string[]): Promise<void>;
}

const SAFE_KEY = /^[0-9a-f-]{36}\/[a-z]+\/[0-9a-f-]{36}$/;

export function assertKey(key: string) {
  if (!SAFE_KEY.test(key)) throw new Error(`cheie de stocare invalidă: ${key}`);
}

class LocalStorage implements Storage {
  constructor(private root: string) {}
  private file(key: string) {
    assertKey(key);
    return path.join(path.resolve(this.root), key);
  }
  async put(key: string, body: Buffer) {
    const f = this.file(key);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, body, { mode: 0o600 });
  }
  async get(key: string) {
    return fs.readFile(this.file(key));
  }
  async delete(keys: string[]) {
    await Promise.all(keys.map((k) => fs.rm(this.file(k), { force: true })));
  }
}

class S3Storage implements Storage {
  private client: S3Client;
  constructor(private bucket: string) {
    const c = config();
    this.client = new S3Client({
      region: c.S3_REGION,
      endpoint: c.S3_ENDPOINT,
      forcePathStyle: !!c.S3_ENDPOINT,
      credentials: { accessKeyId: c.S3_ACCESS_KEY_ID!, secretAccessKey: c.S3_SECRET_ACCESS_KEY! },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    assertKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: config().S3_ENDPOINT ? undefined : "AES256" }));
  }
  async get(key: string) {
    assertKey(key);
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  async delete(keys: string[]) {
    keys.forEach(assertKey);
    for (let i = 0; i < keys.length; i += 1000) {
      await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true } }));
    }
  }
}

let instance: Storage | null = null;
export function storage(): Storage {
  if (instance) return instance;
  const c = config();
  instance = c.STORAGE_DRIVER === "s3" ? new S3Storage(c.S3_BUCKET!) : new LocalStorage(c.STORAGE_LOCAL_DIR);
  return instance;
}
