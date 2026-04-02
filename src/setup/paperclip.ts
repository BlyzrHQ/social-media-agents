import { execSync } from "child_process";
import * as path from "path";

export function setupPaperclip(projectDir: string): void {
  const paperclipDir = path.resolve(projectDir, "paperclip");

  // Check Docker
  try {
    execSync("docker --version", { stdio: "pipe" });
  } catch {
    throw new Error(
      "Docker is not installed. Install Docker Desktop from https://docker.com and try again."
    );
  }

  // Check if Docker is running
  try {
    execSync("docker ps", { stdio: "pipe" });
  } catch {
    throw new Error(
      "Docker is not running. Start Docker Desktop and try again."
    );
  }

  // Start Paperclip
  try {
    execSync("docker compose up -d --build", {
      cwd: paperclipDir,
      stdio: "inherit",
      timeout: 300_000,
    });
  } catch (err) {
    console.log(
      "Failed to start Paperclip. You can start it manually later with:"
    );
    console.log(`  cd ${paperclipDir} && docker compose up -d`);
    return;
  }

  // Wait for it to be ready
  console.log("Waiting for Paperclip to start...");
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      execSync(
        'docker compose exec -T paperclip node -e "require(\'http\').get(\'http://localhost:3100/api/health\', r => { r.on(\'data\', () => {}); r.on(\'end\', () => process.exit(r.statusCode === 200 ? 0 : 1)) })"',
        { cwd: paperclipDir, stdio: "pipe", timeout: 5000 }
      );
      ready = true;
      break;
    } catch {
      execSync("sleep 2", { stdio: "pipe" });
    }
  }

  if (!ready) {
    console.log(
      "Paperclip is still starting. Check http://localhost:3100 in a few moments."
    );
    return;
  }

  // Run onboard
  try {
    execSync(
      "docker compose exec -T paperclip pnpm paperclipai onboard -y",
      { cwd: paperclipDir, stdio: "inherit", timeout: 60_000 }
    );
  } catch {
    console.log("Paperclip onboard may need manual setup. Visit http://localhost:3100");
  }

  // Bootstrap CEO
  try {
    const result = execSync(
      "docker compose exec -T paperclip pnpm paperclipai auth bootstrap-ceo",
      { cwd: paperclipDir, encoding: "utf8", timeout: 30_000 }
    );
    const urlMatch = result.match(/(http:\/\/.*\/invite\/pcp_bootstrap_\w+)/);
    if (urlMatch) {
      console.log(`\nPaperclip invite URL: ${urlMatch[1]}`);
    }
  } catch {
    console.log(
      "Run this to get your Paperclip login: cd paperclip && docker compose exec paperclip pnpm paperclipai auth bootstrap-ceo"
    );
  }
}
