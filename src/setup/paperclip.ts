import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
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

export function setupPaperclip(config: ProjectConfig): string {
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
    return "";
  }

  // Wait for container to be running
  waitMs(3000);

  // Verify container exists
  try {
    execSync(`docker inspect ${CONTAINER}`, { stdio: "pipe" });
  } catch {
    console.log("Container not found. Check docker compose output.");
    return "";
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
    return "";
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
        return "";
      }
    } catch {
      console.log("Onboard failed:", msg);
      return "";
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
    return "";
  }

  if (!companyId || !ceoAgentId) {
    console.log("No company found. Create agents manually.");
    return "";
  }

  // Write CEO instructions + shared instructions for agents CEO will hire
  console.log("Configuring CEO agent...");
  const agentBase = `/paperclip/instances/default/companies/${companyId}/agents`;

  try {
    const ceoAgentsMd = fs.readFileSync(path.join(paperclipDir, "ceo-AGENTS.md"), "utf8");
    const triggerMd = fs.readFileSync(path.join(paperclipDir, "TRIGGER.md"), "utf8");
    const cmoAgentsMd = fs.readFileSync(path.join(paperclipDir, "cmo-AGENTS.md"), "utf8");
    const tdAgentsMd = fs.readFileSync(path.join(paperclipDir, "template-designer-AGENTS.md"), "utf8");

    const writeFile = (dir: string, filename: string, content: string) => {
      const b64 = Buffer.from(content).toString("base64");
      dockerExec(
        `node -e "const fs=require('fs');fs.mkdirSync('${dir}',{recursive:true});fs.writeFileSync('${dir}/${filename}',Buffer.from('${b64}','base64').toString())"`,
        { timeout: 10_000, encoding: "utf8" }
      );
    };

    // CEO instructions
    writeFile(`${agentBase}/${ceoAgentId}/instructions`, "AGENTS.md", ceoAgentsMd);
    writeFile(`${agentBase}/${ceoAgentId}/instructions`, "TRIGGER.md", triggerMd);

    // Shared instructions for agents the CEO will create
    const sharedDir = `/paperclip/instances/default/companies/${companyId}/shared-instructions`;
    writeFile(sharedDir, "cmo-AGENTS.md", cmoAgentsMd);
    writeFile(sharedDir, "template-designer-AGENTS.md", tdAgentsMd);
    writeFile(sharedDir, "TRIGGER.md", triggerMd);

    console.log("  CEO configured. Will hire CMO + Template Designer on first heartbeat.");
  } catch (err) {
    console.log("  Could not write instructions:", err instanceof Error ? err.message : String(err));
  }

  // Fix permissions on ALL paperclip data
  try { dockerExecRoot("chown -R node:node /paperclip"); } catch { /* non-critical */ }

  // Create CMO and Template Designer via PostgreSQL
  console.log("Creating CMO and Template Designer agents...");
  try {
    const createScript = `
const {execSync} = require('child_process');
const crypto = require('crypto');
const pgPath = execSync('find /app -path "*/pg/lib/index.js" -type f').toString().trim().split('\\n')[0];
const pg = require(pgPath);
const pool = new pg.Pool({host:'localhost',port:54329,user:'paperclip',password:'paperclip',database:'paperclip'});
const cmoId = crypto.randomUUID();
const tdId = crypto.randomUUID();
pool.query(
  'INSERT INTO agents (id, company_id, name, role, reports_to, adapter_type, adapter_config, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()), ($9,$2,$10,$11,$12,$6,$7,$8,NOW(),NOW())',
  [cmoId, '${companyId}', 'CMO', 'cmo', '${ceoAgentId}', 'claude_local', JSON.stringify({dangerouslySkipPermissions:true}), 'idle', tdId, 'Template Designer', 'designer', cmoId]
).then(() => {
  console.log('OK:' + cmoId + ':' + tdId);
  return pool.end();
}).catch(e => { console.log('ERR:' + e.message); pool.end(); });
`.trim();

    const scriptB64 = Buffer.from(createScript).toString("base64");
    dockerExec(
      `node -e "require('fs').writeFileSync('/tmp/create-agents.js',Buffer.from('${scriptB64}','base64').toString())"`,
      { timeout: 5_000, encoding: "utf8" }
    );
    const result = dockerExec("node /tmp/create-agents.js", { timeout: 15_000, encoding: "utf8" });

    if (result.includes("OK:")) {
      const parts = result.trim().split("OK:")[1].split(":");
      const cmoId = parts[0];
      const tdId = parts[1];

      // Write instruction files for the new agents
      const writeFile = (dir: string, filename: string, content: string) => {
        const b64 = Buffer.from(content).toString("base64");
        dockerExec(
          `node -e "const fs=require('fs');fs.mkdirSync('${dir}',{recursive:true});fs.writeFileSync('${dir}/${filename}',Buffer.from('${b64}','base64').toString())"`,
          { timeout: 10_000, encoding: "utf8" }
        );
      };

      const cmoAgentsMd = fs.readFileSync(path.join(paperclipDir, "cmo-AGENTS.md"), "utf8");
      const tdAgentsMd = fs.readFileSync(path.join(paperclipDir, "template-designer-AGENTS.md"), "utf8");
      const triggerMd = fs.readFileSync(path.join(paperclipDir, "TRIGGER.md"), "utf8");

      writeFile(`${agentBase}/${cmoId}/instructions`, "AGENTS.md", cmoAgentsMd);
      writeFile(`${agentBase}/${cmoId}/instructions`, "TRIGGER.md", triggerMd);
      writeFile(`${agentBase}/${tdId}/instructions`, "AGENTS.md", tdAgentsMd);
      writeFile(`${agentBase}/${tdId}/instructions`, "TRIGGER.md", triggerMd);

      // Fix permissions again after creating new dirs
      try { dockerExecRoot("chown -R node:node /paperclip"); } catch { /* */ }

      console.log("  CMO and Template Designer created!");
    } else {
      console.log("  Agent creation issue:", result.trim());
    }
  } catch (err) {
    console.log("  Could not create agents:", err instanceof Error ? err.message : String(err));
    console.log("  Create them manually in the Paperclip dashboard.");
  }

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
  return inviteUrl;
}
