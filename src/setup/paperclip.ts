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

function createAgentViaApi(paperclipDir: string, companyId: string, agent: { name: string; role: string; reportsTo?: string; adapterType: string }): string | null {
  try {
    const body = JSON.stringify({
      name: agent.name,
      role: agent.role,
      reportsTo: agent.reportsTo || null,
      adapterType: agent.adapterType,
      adapterConfig: { dangerouslySkipPermissions: true },
    });
    const result = dockerExec(
      paperclipDir,
      `node -e "
        const http = require('http');
        const body = '${body.replace(/'/g, "\\'")}';
        const opts = {hostname:'localhost',port:3100,path:'/api/companies/${companyId}/agents',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}};
        const req = http.request(opts, res => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => console.log(d));
        });
        req.write(body);
        req.end();
      "`,
      { timeout: 15_000, encoding: "utf8" }
    );
    const match = result.match(/"id"\s*:\s*"([a-f0-9-]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function setupPaperclip(config: ProjectConfig): void {
  const paperclipDir = path.resolve(config.brand.projectDir, "paperclip");

  // Check Docker
  try {
    execSync("docker --version", { stdio: "pipe" });
  } catch {
    throw new Error("Docker is not installed. Install Docker Desktop from https://docker.com and try again.");
  }

  try {
    execSync("docker ps", { stdio: "pipe" });
  } catch {
    throw new Error("Docker is not running. Start Docker Desktop and try again.");
  }

  // Start Paperclip
  try {
    execSync("docker compose up -d", {
      cwd: paperclipDir,
      stdio: "inherit",
      timeout: 300_000,
    });
  } catch {
    console.log("Failed to start Paperclip. Start it manually:");
    console.log(`  cd ${paperclipDir} && docker compose up -d`);
    return;
  }

  // Wait for ready
  console.log("Waiting for Paperclip to start...");
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      dockerExec(
        paperclipDir,
        `node -e "const h=require('http');h.get('http://localhost:3100/api/health',r=>{r.on('data',()=>{});r.on('end',()=>process.exit(r.statusCode===200?0:1))})"`,
        { timeout: 5000, encoding: "utf8" }
      );
      ready = true;
      break;
    } catch {
      try { execSync("sleep 2", { stdio: "pipe" }); } catch { /* windows */ }
    }
  }

  if (!ready) {
    console.log("Paperclip is still starting. Check http://localhost:3100 in a few moments.");
    return;
  }

  // Onboard
  try {
    dockerExec(paperclipDir, "pnpm paperclipai onboard -y", { timeout: 60_000 });
  } catch {
    console.log("Paperclip onboard may need manual setup. Visit http://localhost:3100");
    return;
  }

  // Wait for server restart
  try { execSync("sleep 5", { stdio: "pipe" }); } catch { /* windows */ }

  // Bootstrap CEO
  let inviteUrl = "";
  try {
    const result = dockerExec(paperclipDir, "pnpm paperclipai auth bootstrap-ceo", { timeout: 30_000, encoding: "utf8" });
    const urlMatch = result.match(/(http:\/\/.*\/invite\/pcp_bootstrap_\w+)/);
    if (urlMatch) {
      inviteUrl = urlMatch[1];
      console.log(`\nPaperclip invite URL: ${inviteUrl}`);
    }
  } catch {
    console.log("Run this to get your login:\n  cd paperclip && docker compose exec paperclip pnpm paperclipai auth bootstrap-ceo");
  }

  // Find company ID
  let companyId = "";
  try {
    companyId = dockerExec(
      paperclipDir,
      `node -e "const fs=require('fs');const d=fs.readdirSync('/paperclip/instances/default/companies');console.log(d[0]||'')"`,
      { timeout: 10_000, encoding: "utf8" }
    ).trim();
  } catch {
    console.log("Could not find company ID. Create agents manually.");
    return;
  }

  if (!companyId) {
    console.log("No company created. Create agents manually after logging in.");
    return;
  }

  // Find CEO agent ID
  let ceoAgentId = "";
  try {
    ceoAgentId = dockerExec(
      paperclipDir,
      `node -e "const fs=require('fs');const d=fs.readdirSync('/paperclip/instances/default/companies/${companyId}/agents');console.log(d[0]||'')"`,
      { timeout: 10_000, encoding: "utf8" }
    ).trim();
  } catch {
    console.log("Could not find CEO agent.");
    return;
  }

  console.log("Setting up agents...");
  const agentBase = `/paperclip/instances/default/companies/${companyId}/agents`;

  // Helper to write file inside container
  const writeAgentFile = (agentId: string, filename: string, content: string) => {
    const escaped = content.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
    dockerExec(
      paperclipDir,
      `node -e "const fs=require('fs');fs.mkdirSync('${agentBase}/${agentId}/instructions',{recursive:true});fs.writeFileSync('${agentBase}/${agentId}/instructions/${filename}','${escaped}')"`,
      { timeout: 10_000, encoding: "utf8" }
    );
  };

  // Read instruction files
  const ceoAgentsMd = fs.readFileSync(path.join(paperclipDir, "ceo-AGENTS.md"), "utf8");
  const cmoAgentsMd = fs.readFileSync(path.join(paperclipDir, "cmo-AGENTS.md"), "utf8");
  const tdAgentsMd = fs.readFileSync(path.join(paperclipDir, "template-designer-AGENTS.md"), "utf8");
  const triggerMd = fs.readFileSync(path.join(paperclipDir, "TRIGGER.md"), "utf8");

  // Configure CEO
  try {
    writeAgentFile(ceoAgentId, "AGENTS.md", ceoAgentsMd);
    console.log("  CEO agent configured.");
  } catch {
    console.log("  Could not configure CEO agent.");
  }

  // Create CMO via API
  const cmoId = createAgentViaApi(paperclipDir, companyId, {
    name: "CMO",
    role: "manager",
    reportsTo: ceoAgentId,
    adapterType: "claude_local",
  });
  if (cmoId) {
    try {
      writeAgentFile(cmoId, "AGENTS.md", cmoAgentsMd);
      writeAgentFile(cmoId, "TRIGGER.md", triggerMd);
      console.log("  CMO agent created and configured.");
    } catch {
      console.log("  CMO created but could not write instructions.");
    }
  } else {
    console.log("  Could not create CMO. Create it manually in the dashboard.");
  }

  // Create Template Designer via API
  const tdId = createAgentViaApi(paperclipDir, companyId, {
    name: "Template Designer",
    role: "ic",
    reportsTo: cmoId || ceoAgentId,
    adapterType: "claude_local",
  });
  if (tdId) {
    try {
      writeAgentFile(tdId, "AGENTS.md", tdAgentsMd);
      writeAgentFile(tdId, "TRIGGER.md", triggerMd);
      console.log("  Template Designer agent created and configured.");
    } catch {
      console.log("  Template Designer created but could not write instructions.");
    }
  } else {
    console.log("  Could not create Template Designer. Create it manually in the dashboard.");
  }

  // Fix permissions
  try {
    execSync(
      `docker compose exec -T -u root paperclip chown -R node:node ${agentBase}`,
      { cwd: paperclipDir, stdio: "pipe", timeout: 10_000 }
    );
  } catch { /* non-critical */ }

  console.log("\nPaperclip is ready!");
  console.log("  Dashboard: http://localhost:3100");
  if (inviteUrl) {
    console.log(`  Login: ${inviteUrl}`);
  }
}
