import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { ProjectConfig } from "../types.js";

const CONTAINER = "paperclip-paperclip-1";

function dockerExec(cmd: string, opts?: { timeout?: number; encoding?: "utf8" }): string {
  return execSync(`docker exec ${CONTAINER} ${cmd}`, {
    stdio: opts?.encoding ? "pipe" : "inherit",
    timeout: opts?.timeout || 60_000,
    encoding: opts?.encoding,
  }) as string;
}

function dockerExecRoot(cmd: string, opts?: { timeout?: number }): void {
  execSync(`docker exec -u root ${CONTAINER} ${cmd}`, {
    stdio: "pipe",
    timeout: opts?.timeout || 30_000,
  });
}

function waitMs(ms: number) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // busy wait — works on all platforms unlike sleep
  }
}

export function setupPaperclip(config: ProjectConfig): void {
  const paperclipDir = path.resolve(config.brand.projectDir, "paperclip");

  // Check Docker
  try { execSync("docker --version", { stdio: "pipe" }); } catch {
    throw new Error("Docker is not installed.");
  }
  try { execSync("docker ps", { stdio: "pipe" }); } catch {
    throw new Error("Docker is not running.");
  }

  // Start container
  console.log("Starting Paperclip container...");
  try {
    execSync("docker compose up -d", { cwd: paperclipDir, stdio: "inherit", timeout: 300_000 });
  } catch {
    console.log("Failed to start Paperclip.");
    console.log(`  cd ${paperclipDir} && docker compose up -d`);
    return;
  }

  // Wait for container to be running
  waitMs(3000);

  // Verify container exists
  try {
    execSync(`docker inspect ${CONTAINER}`, { stdio: "pipe" });
  } catch {
    console.log("Container not found. Check docker compose output.");
    return;
  }

  // Wait for Paperclip HTTP to be ready (up to 120 seconds)
  console.log("Waiting for Paperclip to be ready...");
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const result = dockerExec(
        'node -e "const h=require(\'http\');const r=h.get(\'http://localhost:3100/api/health\',res=>{let d=\'\';res.on(\'data\',c=>d+=c);res.on(\'end\',()=>{console.log(res.statusCode);process.exit(res.statusCode===200?0:1)})});r.on(\'error\',()=>process.exit(1))"',
        { timeout: 10_000, encoding: "utf8" }
      );
      if (result.trim().includes("200")) {
        ready = true;
        break;
      }
    } catch { /* not ready yet */ }
    waitMs(2000);
  }

  if (!ready) {
    console.log("Paperclip is still starting. Visit http://localhost:3100 when ready.");
    return;
  }
  console.log("Paperclip is running.");

  // Fix data directory permissions before onboard
  try { dockerExecRoot("chown -R node:node /paperclip"); } catch { /* non-critical */ }

  // Onboard
  console.log("Running onboard...");
  try {
    dockerExec("pnpm paperclipai onboard -y", { timeout: 120_000 });
    console.log("Onboard complete.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Check if onboard actually succeeded despite timeout
    try {
      const configExists = dockerExec(
        'node -e "const fs=require(\'fs\');console.log(fs.existsSync(\'/paperclip/instances/default/config.json\'))"',
        { timeout: 5_000, encoding: "utf8" }
      );
      if (configExists.trim().includes("true")) {
        console.log("Onboard completed (config exists).");
      } else {
        console.log("Onboard failed:", msg);
        return;
      }
    } catch {
      console.log("Onboard failed:", msg);
      return;
    }
  }

  // Wait for server to restart after onboard
  console.log("Waiting for restart...");
  waitMs(10_000);

  // Wait for health again after restart
  for (let i = 0; i < 30; i++) {
    try {
      dockerExec(
        'node -e "const h=require(\'http\');h.get(\'http://localhost:3100/api/health\',r=>{r.on(\'data\',()=>{});r.on(\'end\',()=>process.exit(r.statusCode===200?0:1))}).on(\'error\',()=>process.exit(1))"',
        { timeout: 5_000, encoding: "utf8" }
      );
      break;
    } catch { waitMs(2000); }
  }

  // Bootstrap CEO
  console.log("Creating admin account...");
  let inviteUrl = "";
  try {
    const result = dockerExec("pnpm paperclipai auth bootstrap-ceo", { timeout: 30_000, encoding: "utf8" });
    const urlMatch = result.match(/(http:\/\/.*\/invite\/pcp_bootstrap_\w+)/);
    if (urlMatch) {
      inviteUrl = urlMatch[1];
      console.log(`  Invite URL: ${inviteUrl}`);
    }
  } catch {
    console.log("  Bootstrap failed. Run manually:");
    console.log(`  docker exec ${CONTAINER} pnpm paperclipai auth bootstrap-ceo`);
  }

  // Find company and CEO
  let companyId = "";
  let ceoAgentId = "";
  try {
    companyId = dockerExec(
      'node -e "const fs=require(\'fs\');const d=fs.readdirSync(\'/paperclip/instances/default/companies\');console.log(d[0]||\'\')"',
      { timeout: 10_000, encoding: "utf8" }
    ).trim();
    ceoAgentId = dockerExec(
      `node -e "const fs=require('fs');const d=fs.readdirSync('/paperclip/instances/default/companies/${companyId}/agents');console.log(d[0]||'')"`,
      { timeout: 10_000, encoding: "utf8" }
    ).trim();
  } catch {
    console.log("Could not find company/CEO. Create agents manually.");
    return;
  }

  if (!companyId || !ceoAgentId) {
    console.log("No company found. Create agents manually.");
    return;
  }

  // Create CMO and Template Designer in PostgreSQL
  console.log("Creating CMO and Template Designer agents...");
  const cmoId = crypto.randomUUID();
  const tdId = crypto.randomUUID();

  try {
    // Write a temp script file instead of inline — avoids shell escaping issues
    const scriptContent = `
const {execSync} = require('child_process');
const crypto = require('crypto');
const pgPath = execSync('find /app -path "*/pg/lib/index.js" -type f 2>/dev/null').toString().trim().split('\\n')[0];
if (!pgPath) { console.log('pg not found'); process.exit(1); }
const pg = require(pgPath);
const pool = new pg.Pool({host:'localhost',port:54329,user:'paperclip',password:'paperclip',database:'paperclip'});
pool.query(
  'INSERT INTO agents (id, company_id, name, role, reports_to, adapter_type, adapter_config, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()), ($9,$2,$10,$11,$12,$6,$7,$8,NOW(),NOW())',
  ['${cmoId}', '${companyId}', 'CMO', 'cmo', '${ceoAgentId}', 'claude_local', JSON.stringify({dangerouslySkipPermissions:true}), 'idle', '${tdId}', 'Template Designer', 'designer', '${cmoId}']
).then(() => { console.log('OK'); return pool.end(); }).catch(e => { console.log('ERR:' + e.message); pool.end(); });
`.trim();

    // Write script to container
    const b64 = Buffer.from(scriptContent).toString("base64");
    dockerExec(
      `node -e "require('fs').writeFileSync('/tmp/create-agents.js', Buffer.from('${b64}','base64').toString())"`,
      { timeout: 5_000, encoding: "utf8" }
    );

    // Run it
    const result = dockerExec("node /tmp/create-agents.js", { timeout: 15_000, encoding: "utf8" });
    if (result.includes("OK")) {
      console.log("  CMO and Template Designer created.");
    } else {
      console.log("  Agent creation issue:", result.trim());
    }
  } catch (err) {
    console.log("  DB insert failed:", err instanceof Error ? err.message : String(err));
    console.log("  Create CMO and Template Designer manually in the dashboard.");
  }

  // Write instruction files
  console.log("Writing agent instructions...");
  const agentBase = `/paperclip/instances/default/companies/${companyId}/agents`;

  try {
    const ceoAgentsMd = fs.readFileSync(path.join(paperclipDir, "ceo-AGENTS.md"), "utf8");
    const cmoAgentsMd = fs.readFileSync(path.join(paperclipDir, "cmo-AGENTS.md"), "utf8");
    const tdAgentsMd = fs.readFileSync(path.join(paperclipDir, "template-designer-AGENTS.md"), "utf8");
    const triggerMd = fs.readFileSync(path.join(paperclipDir, "TRIGGER.md"), "utf8");

    const writeFile = (agentId: string, filename: string, content: string) => {
      const b64 = Buffer.from(content).toString("base64");
      dockerExec(
        `node -e "const fs=require('fs');const dir='${agentBase}/${agentId}/instructions';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/${filename}',Buffer.from('${b64}','base64').toString())"`,
        { timeout: 10_000, encoding: "utf8" }
      );
    };

    writeFile(ceoAgentId, "AGENTS.md", ceoAgentsMd);
    writeFile(cmoId, "AGENTS.md", cmoAgentsMd);
    writeFile(cmoId, "TRIGGER.md", triggerMd);
    writeFile(tdId, "AGENTS.md", tdAgentsMd);
    writeFile(tdId, "TRIGGER.md", triggerMd);
    console.log("  Instructions configured.");
  } catch (err) {
    console.log("  Could not write instructions:", err instanceof Error ? err.message : String(err));
  }

  // Fix permissions on ALL paperclip data (not just agents)
  try { dockerExecRoot("chown -R node:node /paperclip"); } catch { /* non-critical */ }

  // Restart to pick up new agents
  console.log("Restarting Paperclip...");
  try {
    execSync("docker compose restart", { cwd: paperclipDir, stdio: "pipe", timeout: 60_000 });
    waitMs(8000);

    // Wait for health after restart
    for (let i = 0; i < 30; i++) {
      try {
        dockerExec(
          'node -e "const h=require(\'http\');h.get(\'http://localhost:3100/api/health\',r=>{r.on(\'data\',()=>{});r.on(\'end\',()=>process.exit(r.statusCode===200?0:1))}).on(\'error\',()=>process.exit(1))"',
          { timeout: 5_000, encoding: "utf8" }
        );
        break;
      } catch { waitMs(2000); }
    }
  } catch { /* non-critical */ }

  console.log("\nPaperclip is ready!");
  console.log("  Dashboard: http://localhost:3100");
  if (inviteUrl) console.log(`  Login: ${inviteUrl}`);
}
