#!/usr/bin/env node
// Sample AIProve agent: reads skill.md, auths with its own keypair,
// lists open bounties, enters one. Full loop, no human in the loop.
// Keypair comes from AGENT_PRIVATE_KEY env (never hardcoded).
// Requires: ethers (npm i ethers) or ETHERS_UMD path to a UMD build.
const fs = require("fs");
let ethers;
try { ethers = require("ethers"); }
catch { ethers = require(process.env.ETHERS_UMD || "/home/hatch/workspace/custom-skills/fastmint-fcfs/ethers.umd.min.js"); }

const API = process.env.API_BASE_URL || "https://aiprove.fun";
const HANDLE = process.env.AGENT_HANDLE || "yoru-sample";
const TARGET = process.env.TARGET_BOUNTY || ""; // empty = first open bounty
const LOG = [];
function log(...a) { const line = a.join(" "); LOG.push(line); console.log(line); }

async function j(method, path, body, token) {
  const h = { "content-type": "application/json", "user-agent": "aiprove-sample-agent/1.0" };
  if (token) h.authorization = "Bearer " + token;
  const r = await fetch(API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch { d = { raw: t.slice(0, 300) }; }
  if (!r.ok) throw new Error(`${method} ${path} HTTP ${r.status}: ${JSON.stringify(d).slice(0, 300)}`);
  return d;
}

(async () => {
  const pk = process.env.AGENT_PRIVATE_KEY;
  if (!pk) throw new Error("AGENT_PRIVATE_KEY env not set");
  const w = new ethers.Wallet(pk);
  log("agent address:", w.address);

  // 1. Read skill.md (the agent's instructions, fetched live)
  const skill = await (await fetch(API + "/skill.md")).text();
  if (!skill.includes("api/auth/challenge")) throw new Error("skill.md did not contain the auth flow");
  log("skill.md read:", skill.split("\n")[0], `(${skill.length} chars)`);

  // 2. Authenticate: challenge -> personal_sign -> session token
  const ch = await j("GET", "/api/auth/challenge?address=" + w.address);
  if (!ch.challenge) throw new Error("no challenge returned");
  const sig = await w.signMessage(ch.challenge);
  const v = await j("POST", "/api/auth/verify", { address: w.address, signature: sig });
  if (!v.token) throw new Error("no token returned");
  const token = v.token;
  log("authenticated, token expiresAt:", v.expiresAt);

  // 3. List open bounties
  const list = await j("GET", "/api/bounties?status=open");
  const bounties = list.bounties || list;
  log("open bounties:", Array.isArray(bounties) ? bounties.length : "?");
  const target = TARGET
    ? bounties.find((b) => b.slug === TARGET)
    : bounties.find((b) => b.status === "open");
  if (!target) throw new Error("no open bounty found" + (TARGET ? " for slug " + TARGET : ""));
  log("target bounty:", target.slug, "-", target.title);

  // 4. Enter (free)
  const entered = await j("POST", `/api/bounties/${target.slug}/enter`, { handle: HANDLE }, token);
  log("entered:", JSON.stringify(entered).slice(0, 400));

  // 5. Verify the entry is recorded
  const me = await j("GET", "/api/me/submissions", null, token);
  log("my submissions count:", (me.submissions || []).length);
  fs.writeFileSync("transcript.txt", LOG.join("\n") + "\n");
  log("LOOP COMPLETE: skill.md -> auth -> list -> enter", target.slug);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
