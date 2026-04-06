import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { ProjectConfig } from "../types.js";

function dockerExec(paperclipDir: string, cmd: string, opts?: { timeout?: number; encoding?: "utf8" }): string {
  return execSync(`docker compose exec -T paperclip ${cmd}`, {
    cwd: paperclipDir,
    stdio: opts?.encoding ? "pipe" : "inherit",
    timeout: opts?.timeout || 30_000,
    encoding: opts?.encoding,
  }) as string;
}

function waitMs(ms: number) {
  execSync(`node -e "setTimeout(()=>{},${ms})"`, { stdio: "pipe" });
}

export function setupPaperclip(config: ProjectConfig): void {
  const paperclipDir = path.resolve(config.brand.projectDir, "paperclip");

  // Check Docker
  try { execSync("docker --version", { stdio: "pipe" }); } catch {
    throw new Error("Docker is not installed. Install Docker Desktop from https://docker.com");
  }
  try { execSync("docker ps", { stdio: "pipe" }); } catch {
    throw new Error("Docker is not running. Start Docker Desktop.");
  }

  // Start Paperclip
  try {
    execSync("docker compose up -d", { cwd: paperclipDir, stdio: "inherit", timeout: 300_000 });
  } catch {
    console.log("Failed to start Paperclip. Run manually:");
    console.log(`  cd ${paperclipDir} && docker compose up -d`);
    return;
  }

  // Wait for ready (up to 90 seconds)
  console.log("Waiting for Paperclip to start...");
  let ready = false;
  for (let i = 0; i < 45; i++) {
    try {
      dockerExec(paperclipDir,
        `node -e "const h=require('http');h.get('http://localhost:3100/api/health',r=>{r.on('data',()=>{});r.on('end',()=>process.exit(r.statusCode===200?0:1))})"`,
        { timeout: 5000, encoding: "utf8" });
      ready = true;
      break;
    } catch { waitMs(2000); }
  }

  if (!ready) {
    console.log("Paperclip is still starting. Check http://localhost:3100 in a few moments.");
    return;
  }

  // Onboard
  console.log("Running Paperclip onboard...");
  try {
    dockerExec(paperclipDir, "pnpm paperclipai onboard -y", { timeout: 120_000 });
    console.log("Onboard complete.");
  } catch (err) {
    console.log("Onboard failed:", err instanceof Error ? err.message : String(err));
    return;
  }

  // Wait for restart
  console.log("Waiting for restart...");
  waitMs(10_000);

  // Bootstrap CEO
  console.log("Creating admin account...");
  let inviteUrl = "";
  try {
    const result = dockerExec(paperclipDir, "pnpm paperclipai auth bootstrap-ceo", { timeout: 30_000, encoding: "utf8" });
    const urlMatch = result.match(/(http:\/\/.*\/invite\/pcp_bootstrap_\w+)/);
    if (urlMatch) {
      inviteUrl = urlMatch[1];
      console.log(`Invite URL: ${inviteUrl}`);
    }
  } catch (err) {
    console.log("Bootstrap failed. Run manually:");
    console.log("  cd paperclip && docker compose exec paperclip pnpm paperclipai auth bootstrap-ceo");
  }

  // Find company and CEO agent
  let companyId = "";
  let ceoAgentId = "";
  try {
    companyId = dockerExec(paperclipDir,
      `node -e "const fs=require('fs');const d=fs.readdirSync('/paperclip/instances/default/companies');console.log(d[0]||'')"`,
      { timeout: 10_000, encoding: "utf8" }).trim();
    ceoAgentId = dockerExec(paperclipDir,
      `node -e "const fs=require('fs');const d=fs.readdirSync('/paperclip/instances/default/companies/${companyId}/agents');console.log(d[0]||'')"`,
      { timeout: 10_000, encoding: "utf8" }).trim();
  } catch {
    console.log("Could not find company/CEO. Create agents manually.");
    return;
  }

  if (!companyId || !ceoAgentId) {
    console.log("No company found. Create agents manually after logging in.");
    return;
  }

  console.log("Creating agents...");
  const agentBase = `/paperclip/instances/default/companies/${companyId}/agents`;
  const cmoId = crypto.randomUUID();
  const tdId = crypto.randomUUID();

  // Insert agents directly into PostgreSQL
  try {
    const insertSql = `
      INSERT INTO agent (id, company_id, name, role, reports_to, adapter_type, adapter_config, status, created_at, updated_at)
      VALUES
        ('${cmoId}', '${companyId}', 'CMO', 'cmo', '${ceoAgentId}', 'claude_local', '{"dangerouslySkipPermissions":true}', 'idle', NOW(), NOW()),
        ('${tdId}', '${companyId}', 'Template Designer', 'designer', '${cmoId}', 'claude_local', '{"dangerouslySkipPermissions":true}', 'idle', NOW(), NOW())
      ON CONFLICT DO NOTHING;
    `.replace(/\n/g, " ").replace(/\s+/g, " ");

    dockerExec(paperclipDir,
      `node -e "
        const pg = require('/app/node_modules/pg/lib/index.js');
        const pool = new pg.Pool({host:'localhost',port:54329,user:'paperclip',password:'paperclip',database:'paperclip'});
        pool.query(\\"${insertSql.replace(/"/g, '\\"')}\\").then(() => {
          console.log('Agents inserted');
          return pool.end();
        }).catch(e => { console.log('DB error:', e.message); pool.end(); });
      "`,
      { timeout: 15_000, encoding: "utf8" });
    console.log("  CMO and Template Designer created in database.");
  } catch (err) {
    console.log("  DB insert failed:", err instanceof Error ? err.message : String(err));
    console.log("  Create CMO and Template Designer manually in the dashboard.");
  }

  // Write instruction files
  const ceoAgentsMd = fs.readFileSync(path.join(paperclipDir, "ceo-AGENTS.md"), "utf8");
  const cmoAgentsMd = fs.readFileSync(path.join(paperclipDir, "cmo-AGENTS.md"), "utf8");
  const tdAgentsMd = fs.readFileSync(path.join(paperclipDir, "template-designer-AGENTS.md"), "utf8");
  const triggerMd = fs.readFileSync(path.join(paperclipDir, "TRIGGER.md"), "utf8");

  const writeFile = (agentId: string, filename: string, content: string) => {
    const escaped = content.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
    dockerExec(paperclipDir,
      `node -e "const fs=require('fs');fs.mkdirSync('${agentBase}/${agentId}/instructions',{recursive:true});fs.writeFileSync('${agentBase}/${agentId}/instructions/${filename}','${escaped}')"`,
      { timeout: 10_000, encoding: "utf8" });
  };

  try {
    writeFile(ceoAgentId, "AGENTS.md", ceoAgentsMd);
    writeFile(cmoId, "AGENTS.md", cmoAgentsMd);
    writeFile(cmoId, "TRIGGER.md", triggerMd);
    writeFile(tdId, "AGENTS.md", tdAgentsMd);
    writeFile(tdId, "TRIGGER.md", triggerMd);
    console.log("  Instructions configured for all agents.");
  } catch (err) {
    console.log("  Could not write instructions:", err instanceof Error ? err.message : String(err));
  }

  // Fix permissions
  try {
    execSync(`docker compose exec -T -u root paperclip chown -R node:node ${agentBase}`,
      { cwd: paperclipDir, stdio: "pipe", timeout: 10_000 });
  } catch { /* non-critical */ }

  // Restart Paperclip so it picks up the new agents
  try {
    execSync("docker compose restart", { cwd: paperclipDir, stdio: "pipe", timeout: 60_000 });
    waitMs(5000);
  } catch { /* non-critical */ }

  console.log("\nPaperclip is ready!");
  console.log("  Dashboard: http://localhost:3100");
  if (inviteUrl) console.log(`  Login: ${inviteUrl}`);
}
