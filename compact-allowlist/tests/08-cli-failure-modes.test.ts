// ─── 8. CLI Failure Modes ───────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';

const CLI = 'npx tsx src/zk-cli.ts';
const CWD = process.cwd();

function run(args: string): { stdout: string; code: number; parsed?: any } {
  try {
    const stdout = execSync(`${CLI} ${args}`, { cwd: CWD, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    try { return { stdout, code: 0, parsed: JSON.parse(stdout) }; } catch { return { stdout, code: 0 }; }
  } catch (err: any) {
    const stdout = err.stdout?.toString() ?? '';
    try { return { stdout, code: err.status ?? 1, parsed: JSON.parse(stdout) }; } catch { return { stdout, code: err.status ?? 1 }; }
  }
}

describe('CLI Failure Modes', () => {
  const dataDir = 'data';
  let hadData = false;

  beforeEach(() => {
    hadData = fs.existsSync(dataDir);
  });

  afterEach(() => {
    // Only clean up if we created data
    if (!hadData && fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  // ── Missing arguments ───────────────────────────────────────────────────
  it('add-member without --secret → error', () => {
    // Need a tree first
    run('init --depth 4 --force true');
    const r = run('add-member');
    expect(r.code).not.toBe(0);
    expect(r.parsed?.success).toBe(false);
  });

  it('gen-proof without --secret → error', () => {
    run('init --depth 4 --force true');
    const r = run('gen-proof --context ctx');
    expect(r.code).not.toBe(0);
    expect(r.parsed?.success).toBe(false);
  });

  it('gen-proof without --context → error', () => {
    run('init --depth 4 --force true');
    const r = run('gen-proof --secret alice');
    expect(r.code).not.toBe(0);
  });

  it('verify-proof without file → error', () => {
    const r = run('verify-proof');
    expect(r.code).not.toBe(0);
  });

  // ── Unknown command ────────────────────────────────────────────────────
  it('unknown command → error with helpful message', () => {
    const r = run('explode');
    expect(r.code).not.toBe(0);
    expect(r.parsed?.error).toContain('Unknown command');
  });

  // ── No tree initialized ────────────────────────────────────────────────
  it('export-root before init → error', () => {
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
    const r = run('export-root');
    expect(r.code).not.toBe(0);
  });

  it('add-member before init → error', () => {
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
    const r = run('add-member --secret alice');
    expect(r.code).not.toBe(0);
  });

  // ── Duplicate init without force ──────────────────────────────────────
  it('init twice without --force → error', () => {
    run('init --depth 4 --force true');
    const r = run('init --depth 4');
    expect(r.code).not.toBe(0);
    expect(r.parsed?.error).toContain('already exists');
  });

  it('init twice with --force → succeeds', () => {
    run('init --depth 4 --force true');
    const r = run('init --depth 4 --force true');
    expect(r.code).toBe(0);
    expect(r.parsed?.success).toBe(true);
  });

  // ── Corrupted tree.json ────────────────────────────────────────────────
  it('corrupted tree.json → error on export-root', () => {
    run('init --depth 4 --force true');
    fs.writeFileSync('data/tree.json', '{{{CORRUPT');
    const r = run('export-root');
    expect(r.code).not.toBe(0);
  });

  // ── Non-existent proof file ────────────────────────────────────────────
  it('verify-proof with non-existent file → error', () => {
    const r = run('verify-proof /tmp/does_not_exist_42.json');
    expect(r.code).not.toBe(0);
    expect(r.parsed?.error).toContain('not found');
  });

  // ── gen-proof for non-member ──────────────────────────────────────────
  it('gen-proof for non-member → error', () => {
    run('init --depth 4 --force true');
    run('add-member --secret alice');
    const r = run('gen-proof --secret eve --context ctx');
    expect(r.code).not.toBe(0);
    expect(r.parsed?.error).toContain('not found');
  });

  // ── Duplicate member ──────────────────────────────────────────────────
  it('adding same secret twice → error', () => {
    run('init --depth 4 --force true');
    run('add-member --secret alice');
    const r = run('add-member --secret alice');
    expect(r.code).not.toBe(0);
    expect(r.parsed?.error).toContain('already in tree');
  });

  // ── help always works ─────────────────────────────────────────────────
  it('help command always succeeds', () => {
    const r = run('help');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('ZK Allowlist CLI');
  });
});
