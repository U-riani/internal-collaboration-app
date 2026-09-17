import path from "node:path";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, unlink, access } from "node:fs/promises";
import { constants } from "node:fs";
// Private storage behind authenticated API downloads. The directory must never
// be exposed through a public static-file route or web-server alias.
export function localStorage(root) {
  const base = path.resolve(root);
  function location(bucket, key) {
    const value = path.resolve(base, bucket, key);
    if (!value.startsWith(`${base}${path.sep}`))
      throw new Error("Invalid storage key");
    return value;
  }
  return {
    async health() {
      await mkdir(base, { recursive: true });
      await access(base, constants.R_OK | constants.W_OK);
      return true;
    },
    async fPutObject(bucket, key, source) {
      const file = location(bucket, key);
      await mkdir(path.dirname(file), { recursive: true });
      await copyFile(source, file);
    },
    async getObject(bucket, key) {
      return createReadStream(location(bucket, key));
    },
    async removeObject(bucket, key) {
      await unlink(location(bucket, key)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    },
  };
}
