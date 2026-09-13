import fs from "fs/promises";
import path from "path";
import { StorageProvider } from "./storage-provider";
import { AppError } from "@/lib/errors/exceptions";

export class LocalStorageProvider implements StorageProvider {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = path.resolve(baseDir || path.join(process.cwd(), ".storage"));
  }

  private resolveSafePath(key: string): string {
    // Strip leading slashes/backslashes and normalize
    const cleanKey = key.replace(/^[/\\]+/, "");
    const normalizedKey = path.normalize(cleanKey);
    const fullPath = path.resolve(this.baseDir, normalizedKey);

    // Prevent path traversal
    if (!fullPath.startsWith(this.baseDir)) {
      throw new AppError(
        "INVALID_STORAGE_PATH",
        "مسیر ذخیره‌سازی فایل نامعتبر است و ممکن است به خارج از فضای مجاز اشاره کند."
      );
    }

    return fullPath;
  }

  async put(key: string, buffer: Buffer): Promise<void> {
    const fullPath = this.resolveSafePath(key);
    const parentDir = path.dirname(fullPath);
    await fs.mkdir(parentDir, { recursive: true });
    await fs.writeFile(fullPath, buffer);
  }

  async get(key: string): Promise<Buffer> {
    const fullPath = this.resolveSafePath(key);
    try {
      return await fs.readFile(fullPath);
    } catch {
      throw new AppError(
        "FILE_NOT_FOUND",
        "فایل مورد نظر در فضای ذخیره‌سازی ابری/محلی یافت نشد."
      );
    }
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.resolveSafePath(key);
    try {
      await fs.unlink(fullPath);
    } catch {
      // Idempotent: ignore if not found
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = this.resolveSafePath(key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
