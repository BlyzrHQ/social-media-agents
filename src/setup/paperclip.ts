import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { ProjectConfig } from "../types.js";

function dockerExec(paperclipDir: string, cmd: string, opts?: { timeout?: number; encoding?: "utf8" }): string {
  return execSync(`docker compose exec -T paperclip ${cmd}`, {
    cwd: paperclipDir,
    stdio: opts?.encoding ? "pipe" : "inherit",
    timeout: opts?.timeout || 30_000,
    encoding: opts?.encoding,
  }) as string;
}

function paperclipApi(paperclipDir: string, method: string, endpoint: string, body?: object): string {
  const bodyArg = body ? `-d '${JSON.stringify(body)}'` : "";
  const cmd = `node -e "
    const http = require('http');
    const opts = {hostname:'localhost',port:3100,path:'/api${endpoint}',method:'${method}',headers:{'Content-Type':'application/json'}};
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { console.log(d); process.exit(res.statusCode >= 400 ? 1 : 0); });
    });
    req.on('error', e => { console.error(e.message); process.exit(1); });
    ${body ? `req.write(JSON.stringify(${JSON.stringify(body)}));` : ""}
    req.end();
  "`;
  return dockerExec(paperclipDir, cmd, { timeout: 15_000, encoding: "utf8" });
}

export function setupPaperclip(config: ProjectConfig): void {
  const paperclipDir = path.resolve(config.brand.projectDir, "paperclip");

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
    execSync("docker compose up -d", {
      cwd: paperclipDir,
      stdio: "inherit",
      timeout: 300_000,
    });
  } catch {
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
      dockerExec(
        paperclipDir,
        'node -e "const h=require(\'http\');h.get(\'http://localhost:3100/api/health\',r=>{r.on(\'data\',()=>{});r.on(\'end\',()=>process.exit(r.statusCode===200?0:1))})"',
        { timeout: 5000, encoding: "utf8" }
      );
      ready = true;
      break;
    } catch {
      try { execSync("sleep 2", { stdio: "pipe" }); } catch { /* windows */ }
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
    dockerExec(paperclipDir, "pnpm paperclipai onboard -y", { timeout: 60_000 });
  } catch {
    console.log("Paperclip onboard may need manual setup. Visit http://localhost:3100");
    return;
  }

  // Wait a bit for the server to restart after onboard
  try { execSync("sleep 5", { stdio: "pipe" }); } catch { /* windows */ }

  // Bootstrap CEO and get invite URL
  let inviteUrl = "";
  try {
    const result = dockerExec(
      paperclipDir,
      "pnpm paperclipai auth bootstrap-ceo",
      { timeout: 30_000, encoding: "utf8" }
    );
    const urlMatch = result.match(/(http:\/\/.*\/invite\/pcp_bootstrap_\w+)/);
    if (urlMatch) {
      inviteUrl = urlMatch[1];
      console.log(`\nPaperclip invite URL: ${inviteUrl}`);
    }
  } catch {
    console.log(
      "Run this to get your Paperclip login:\n  cd paperclip && docker compose exec paperclip pnpm paperclipai auth bootstrap-ceo"
    );
  }

  // Find company ID
  let companyId = "";
  try {
    const companiesDir = dockerExec(
      paperclipDir,
      'node -e "const fs=require(\'fs\');const d=fs.readdirSync(\'/paperclip/instances/default/companies\');console.log(d[0]||\'\')"',
      { timeout: 10_000, encoding: "utf8" }
    ).trim();
    companyId = companiesDir;
  } catch {
    console.log("Could not find company ID. Create agents manually in the dashboard.");
    return;
  }

  if (!companyId) {
    console.log("No company created yet. Create agents manually after logging in.");
    return;
  }

  // Find CEO agent ID
  let ceoAgentId = "";
  try {
    const agentsDir = dockerExec(
      paperclipDir,
      `node -e "const fs=require('fs');const d=fs.readdirSync('/paperclip/instances/default/companies/${companyId}/agents');console.log(d[0]||'')"`,
      { timeout: 10_000, encoding: "utf8" }
    ).trim();
    ceoAgentId = agentsDir;
  } catch {
    console.log("Could not find CEO agent. Create agents manually in the dashboard.");
    return;
  }

  console.log("Setting up agents...");

  // Copy instruction files to CEO
  const agentBase = `/paperclip/instances/default/companies/${companyId}/agents`;
  try {
    const ceoAgentsMd = fs.readFileSync(path.join(paperclipDir, "ceo-AGENTS.md"), "utf8");
    const triggerMd = fs.readFileSync(path.join(paperclipDir, "TRIGGER.md"), "utf8");

    dockerExec(
      paperclipDir,
      `node -e "const fs=require('fs');fs.writeFileSync('${agentBase}/${ceoAgentId}/instructions/AGENTS.md',${JSON.stringify(ceoAgentsMd)})"`,
      { timeout: 10_000, encoding: "utf8" }
    );
    console.log("  CEO agent instructions configured.");

    // Create CMO agent via Paperclip CLI
    try {
      const cmoResult = dockerExec(
        paperclipDir,
        `pnpm paperclipai agent create -C ${companyId} --name CMO --role manager --reports-to ${ceoAgentId} --adapter-type claude_local --json`,
        { timeout: 30_000, encoding: "utf8" }
      );
      const cmoMatch = cmoResult.match(/"id"\s*:\s*"([a-f0-9-]+)"/);
      const cmoId = cmoMatch ? cmoMatch[1] : "";

      if (cmoId) {
        // Create instructions dir and write files
        dockerExec(
          paperclipDir,
          `node -e "const fs=require('fs');fs.mkdirSync('${agentBase}/${cmoId}/instructions',{recursive:true})"`,
          { timeout: 10_000, encoding: "utf8" }
        );

        const cmoAgentsMd = fs.readFileSync(path.join(paperclipDir, "cmo-AGENTS.md"), "utf8");
        dockerExec(
          paperclipDir,
          `node -e "const fs=require('fs');fs.writeFileSync('${agentBase}/${cmoId}/instructions/AGENTS.md',${JSON.stringify(cmoAgentsMd)});fs.writeFileSync('${agentBase}/${cmoId}/instructions/TRIGGER.md',${JSON.stringify(triggerMd)})"`,
          { timeout: 10_000, encoding: "utf8" }
        );
        console.log("  CMO agent created and configured.");
      }
    } catch {
      console.log("  Could not auto-create CMO. Create it manually in the dashboard.");
    }

    // Create Template Designer agent
    try {
      const tdResult = dockerExec(
        paperclipDir,
        `pnpm paperclipai agent create -C ${companyId} --name "Template Designer" --role ic --reports-to ${ceoAgentId} --adapter-type claude_local --json`,
        { timeout: 30_000, encoding: "utf8" }
      );
      const tdMatch = tdResult.match(/"id"\s*:\s*"([a-f0-9-]+)"/);
      const tdId = tdMatch ? tdMatch[1] : "";

      if (tdId) {
        dockerExec(
          paperclipDir,
          `node -e "const fs=require('fs');fs.mkdirSync('${agentBase}/${tdId}/instructions',{recursive:true})"`,
          { timeout: 10_000, encoding: "utf8" }
        );

        const tdAgentsMd = fs.readFileSync(path.join(paperclipDir, "template-designer-AGENTS.md"), "utf8");
        dockerExec(
          paperclipDir,
          `node -e "const fs=require('fs');fs.writeFileSync('${agentBase}/${tdId}/instructions/AGENTS.md',${JSON.stringify(tdAgentsMd)});fs.writeFileSync('${agentBase}/${tdId}/instructions/TRIGGER.md',${JSON.stringify(triggerMd)})"`,
          { timeout: 10_000, encoding: "utf8" }
        );
        console.log("  Template Designer agent created and configured.");
      }
    } catch {
      console.log("  Could not auto-create Template Designer. Create it manually in the dashboard.");
    }

    // Fix permissions
    try {
      execSync(
        `docker compose exec -T -u root paperclip chown -R node:node ${agentBase}`,
        { cwd: paperclipDir, stdio: "pipe", timeout: 10_000 }
      );
    } catch { /* non-critical */ }

  } catch (err) {
    console.log(`  Agent setup error: ${err instanceof Error ? err.message : String(err)}`);
    console.log("  You can configure agents manually in the dashboard.");
  }

  console.log("\nPaperclip is ready!");
  console.log("  Dashboard: http://localhost:3100");
  if (inviteUrl) {
    console.log(`  Login: ${inviteUrl}`);
  }
}
