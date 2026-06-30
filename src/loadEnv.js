import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const file of [".env.local", ".env"]) {
  const envPath = path.join(root, file);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}



