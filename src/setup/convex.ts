import { execSync } from "child_process";
import * as path from "path";

export function setupConvex(projectDir: string): { url: string; token: string } {
  const dir = path.resolve(projectDir);

  // Check if npx convex is available
  try {
    execSync("npx convex --version", { stdio: "pipe" });
  } catch {
    throw new Error(
      "Convex CLI not found. Install it with: npm install -g convex"
    );
  }

  // Init convex in the project
  try {
    execSync("npx convex init", { cwd: dir, stdio: "inherit" });
  } catch {
    console.log("Convex init may have already been run, continuing...");
  }

  // Deploy the schema
  try {
    execSync("npx convex deploy --yes", { cwd: dir, stdio: "inherit" });
  } catch {
    console.log(
      "Convex deploy requires login. Run 'npx convex login' first, then 'npx convex deploy' in your project directory."
    );
  }

  // Read the convex URL from .env.local if it exists
  const fs = require("fs");
  let url = "";
  let token = "";
  const envLocal = path.join(dir, ".env.local");
  if (fs.existsSync(envLocal)) {
    const content = fs.readFileSync(envLocal, "utf8");
    const urlMatch = content.match(/CONVEX_URL=(.+)/);
    if (urlMatch) url = urlMatch[1].trim();
  }

  return { url, token };
}
