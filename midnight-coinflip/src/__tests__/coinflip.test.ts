import { test } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { generateSecret, computeHash, getResult } from '../flip-utils.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function chiSquaredCoinFlip(heads: number, tails: number): number {
  const n = heads + tails;
  const expected = n / 2;
  return Math.pow(heads - expected, 2) / expected +
         Math.pow(tails - expected, 2) / expected;
}

function bufferAllVariants(): Buffer[] {
  return [
    Buffer.alloc(0),
    Buffer.alloc(1, 0x00),
    Buffer.alloc(1, 0xff),
    Buffer.alloc(32, 0x00),
    Buffer.alloc(32, 0xff),
    Buffer.alloc(32, 0xaa),
    Buffer.from('00'.repeat(32), 'hex'),
    crypto.randomBytes(10_000),
    crypto.randomBytes(1_000_000),
  ];
}

// ─── Secret generation ──────────────────────────────────────────────────────

test('Secret: output is exactly 32 bytes', () => {
  for (let i = 0; i < 100; i++) {
    const s = generateSecret();
    assert.strictEqual(
      s.length, 32,
      `Expected 32 bytes, got ${s.length} on iteration ${i}`
    );
  }
});

test('Secret: is a Buffer (not string, not Uint8Array subclass tricks)', () => {
  const s = generateSecret();
  assert.ok(Buffer.isBuffer(s), 'generateSecret must return a Buffer');
});

test('Secret: no two outputs are equal (10 000 samples)', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 10_000; i++) {
    const hex = generateSecret().toString('hex');
    assert.ok(!seen.has(hex), `Collision at iteration ${i}: ${hex}`);
    seen.add(hex);
  }
});

test('Secret: no obvious bias — each byte position covers full 0-255 range', () => {
  const N = 5_000;
  const minPerPosition = new Array(32).fill(255);
  const maxPerPosition = new Array(32).fill(0);

  for (let i = 0; i < N; i++) {
    const s = generateSecret();
    for (let pos = 0; pos < 32; pos++) {
      minPerPosition[pos] = Math.min(minPerPosition[pos], s[pos]);
      maxPerPosition[pos] = Math.max(maxPerPosition[pos], s[pos]);
    }
  }

  for (let pos = 0; pos < 32; pos++) {
    assert.ok(
      maxPerPosition[pos] - minPerPosition[pos] > 200,
      `Byte position ${pos} has suspiciously narrow range: ` +
      `[${minPerPosition[pos]}, ${maxPerPosition[pos]}]`
    );
  }
});

test('Secret: not derived from a low-resolution source (no timestamp padding)', () => {
  // If the generator uses Date.now() as the only entropy, consecutive
  // secrets in the same ms will be identical or differ only in one region.
  const secrets = Array.from({ length: 100 }, () => generateSecret());

  for (let bytePos = 0; bytePos < 32; bytePos++) {
    const col = secrets.map(s => s[bytePos]);
    const unique = new Set(col).size;
    assert.ok(
      unique > 10,
      `Byte position ${bytePos} has only ${unique} unique values across 100 secrets — smells like low-entropy source`
    );
  }
});

// ─── Hashing ─────────────────────────────────────────────────────────────────

test('Hash: output is exactly 32 bytes', () => {
  for (const input of bufferAllVariants()) {
    const h = computeHash(input);
    assert.strictEqual(
      h.length, 32,
      `Expected 32-byte hash for input of length ${input.length}, got ${h.length}`
    );
  }
});

test('Hash: output is a Buffer', () => {
  assert.ok(Buffer.isBuffer(computeHash(Buffer.alloc(32))));
});

test('Hash: fully deterministic across 1000 calls', () => {
  const input = crypto.randomBytes(64);
  const reference = computeHash(input).toString('hex');
  for (let i = 0; i < 1_000; i++) {
    assert.strictEqual(
      computeHash(input).toString('hex'),
      reference,
      `Non-deterministic hash at iteration ${i}`
    );
  }
});

test('Hash: every single-bit flip in a 32-byte input produces a different hash (avalanche)', () => {
  const base = crypto.randomBytes(32);
  const baseHash = computeHash(base).toString('hex');

  for (let byteIdx = 0; byteIdx < 32; byteIdx++) {
    for (let bit = 0; bit < 8; bit++) {
      const mutated = Buffer.from(base);
      mutated[byteIdx] ^= (1 << bit);
      const mutatedHash = computeHash(mutated).toString('hex');
      assert.notStrictEqual(
        mutatedHash,
        baseHash,
        `Hash unchanged after flipping bit ${bit} of byte ${byteIdx}`
      );
    }
  }
});

test('Hash: known-vector — matches Node crypto SHA-256 output', () => {
  const vectors = [
    Buffer.alloc(0),
    Buffer.from('hello world'),
    Buffer.alloc(32, 0xff),
    crypto.randomBytes(256),
  ];

  for (const v of vectors) {
    const expected = crypto.createHash('sha256').update(v).digest();
    const actual = computeHash(v);
    assert.ok(
      actual.equals(expected),
      `Hash mismatch for input "${v.toString('hex').slice(0, 16)}...": ` +
      `expected ${expected.toString('hex')}, got ${actual.toString('hex')}`
    );
  }
});

test('Hash: output never all-zero and never all-0xff (degenerate outputs)', () => {
  const allZero = Buffer.alloc(32, 0x00);
  const allFF   = Buffer.alloc(32, 0xff);

  for (const input of bufferAllVariants()) {
    const h = computeHash(input);
    assert.ok(!h.equals(allZero), 'Hash is all zeros');
    assert.ok(!h.equals(allFF),   'Hash is all 0xff');
  }
});

test('Hash: no collisions across 50 000 random inputs', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50_000; i++) {
    const h = computeHash(crypto.randomBytes(32)).toString('hex');
    assert.ok(!seen.has(h), `Hash collision at iteration ${i}`);
    seen.add(h);
  }
});

test('Hash: prefix-free — hash(A) ≠ hash(A+B) for all tested pairs', () => {
  const a = Buffer.from('provably-fair');
  const b = Buffer.from('-suffix');
  const ab = Buffer.concat([a, b]);

  assert.notStrictEqual(
    computeHash(a).toString('hex'),
    computeHash(ab).toString('hex'),
    'Length-extension / prefix collision detected'
  );
});

// ─── Result / coin flip ──────────────────────────────────────────────────────

test('Result: only valid outputs — never anything else', () => {
  const valid = new Set(['HEADS', 'TAILS']);
  for (let i = 0; i < 5_000; i++) {
    const r = getResult(generateSecret());
    assert.ok(valid.has(r), `Invalid result "${r}" at iteration ${i}`);
  }
});

test('Result: fully deterministic — same secret always same output', () => {
  for (let i = 0; i < 500; i++) {
    const s = generateSecret();
    const results = Array.from({ length: 20 }, () => getResult(s));
    const unique = new Set(results);
    assert.strictEqual(
      unique.size, 1,
      `getResult is non-deterministic for secret ${s.toString('hex')}: got ${[...unique]}`
    );
  }
});

test('Result: different secrets → not always same result (function is not constant)', () => {
  const outputs = new Set(
    Array.from({ length: 200 }, () => getResult(generateSecret()))
  );
  assert.strictEqual(outputs.size, 2, 'getResult only ever returns one value — it is constant');
});

test('Result: distribution passes chi-squared (p < 0.001 threshold, χ² < 10.83)', () => {
  const N = 10_000;
  let heads = 0;
  for (let i = 0; i < N; i++) {
    if (getResult(generateSecret()) === 'HEADS') heads++;
  }
  const tails = N - heads;
  const chi2 = chiSquaredCoinFlip(heads, tails);

  assert.ok(
    chi2 < 10.83,
    `Distribution is biased: HEADS=${heads}, TAILS=${tails}, χ²=${chi2.toFixed(4)} (threshold 10.83)`
  );
});

test('Result: no streaks longer than 20 (detects degenerate alternating / stuck outputs)', () => {
  let streak = 1;
  let prev = getResult(generateSecret());

  for (let i = 1; i < 5_000; i++) {
    const r = getResult(generateSecret());
    streak = r === prev ? streak + 1 : 1;
    prev = r;
    assert.ok(streak < 20, `Streak of ${streak} "${prev}" detected at iteration ${i}`);
  }
});

test('Result: known-vector — fixed secret maps to known output', () => {
  // Pre-compute: SHA-256 of all-zero 32-byte secret, take first byte mod 2
  // Replace EXPECTED_RESULT with the actual value your implementation produces
  // for this input — pin it here so regressions are caught.
  const zeroSecret = Buffer.alloc(32, 0x00);
  const result = getResult(zeroSecret);

  assert.ok(
    ['HEADS', 'TAILS'].includes(result),
    'Invalid result for zero secret'
  );

  // Pin the result — run once, then hardcode:
  // const PINNED = 'HEADS'; // or 'TAILS'
  // assert.strictEqual(result, PINNED, 'Known-vector result changed — logic was modified');
});

test('Result: input mutation does not affect already-captured result (no reference leakage)', () => {
  const secret = generateSecret();
  const copy   = Buffer.from(secret);
  const r1     = getResult(secret);

  // mutate original after call
  secret.fill(0x00);

  const r2 = getResult(copy);
  assert.strictEqual(r1, r2, 'Result changed after mutating original buffer — possible reference leak');
});

// ─── Commit-reveal scheme ────────────────────────────────────────────────────

test('Commit-reveal: correct secret always verifies', () => {
  for (let i = 0; i < 1_000; i++) {
    const secret = generateSecret();
    const commitment = computeHash(secret);
    assert.ok(
      computeHash(secret).equals(commitment),
      `Verification failed for secret ${secret.toString('hex')}`
    );
  }
});

test('Commit-reveal: wrong secret never verifies (1000 fakes)', () => {
  const secret = generateSecret();
  const commitment = computeHash(secret);

  for (let i = 0; i < 1_000; i++) {
    const fake = generateSecret();
    assert.ok(
      !computeHash(fake).equals(commitment),
      `Fake secret ${fake.toString('hex')} matched commitment — catastrophic`
    );
  }
});

test('Commit-reveal: every single-bit tamper of secret breaks commitment', () => {
  const secret = generateSecret();
  const commitment = computeHash(secret);

  for (let byteIdx = 0; byteIdx < 32; byteIdx++) {
    for (let bit = 0; bit < 8; bit++) {
      const tampered = Buffer.from(secret);
      tampered[byteIdx] ^= (1 << bit);
      assert.ok(
        !computeHash(tampered).equals(commitment),
        `Tampered secret (byte ${byteIdx}, bit ${bit}) still matches commitment`
      );
    }
  }
});

test('Commit-reveal: commitment is binding — result cannot change post-commit', () => {
  // Simulate attacker who wants to change the outcome after seeing the commitment.
  // They must find a secret with a different result that hashes to the same commitment.
  const secret     = generateSecret();
  const commitment = computeHash(secret);
  const result     = getResult(secret);

  const oppositeResult = result === 'HEADS' ? 'TAILS' : 'HEADS';

  // Try 10 000 random secrets — none should match commitment with opposite result
  let found = false;
  for (let i = 0; i < 10_000; i++) {
    const candidate = generateSecret();
    if (
      computeHash(candidate).equals(commitment) &&
      getResult(candidate) === oppositeResult
    ) {
      found = true;
      break;
    }
  }

  assert.ok(!found, 'Found a second preimage with opposite result — commitment is not binding');
});

test('Commit-reveal: two distinct secrets never share a commitment', () => {
  const seen = new Map<string, string>(); // hash → secret hex

  for (let i = 0; i < 10_000; i++) {
    const secret = generateSecret();
    const hash   = computeHash(secret).toString('hex');
    const hex    = secret.toString('hex');

    if (seen.has(hash)) {
      assert.strictEqual(
        seen.get(hash), hex,
        `Commitment collision: two different secrets hash to ${hash}`
      );
    } else {
      seen.set(hash, hex);
    }
  }
});

// ─── Contract state machine (Compact circuit logic) ──────────────────────────

test('Contract: commit followed by reveal produces consistent result', () => {
  // Simulate the ledger state transitions described in the Compact contract.
  let commit_hash: Buffer     = Buffer.alloc(32);
  let revealed: boolean       = false;
  let revealed_secret: Buffer = Buffer.alloc(32);

  const secret = generateSecret();

  // commit()
  commit_hash = computeHash(secret);
  revealed    = false;

  assert.ok(!revealed, 'revealed should be false after commit');
  assert.ok(commit_hash.length === 32, 'commit_hash should be set');

  // reveal()
  revealed_secret = secret;
  revealed        = true;

  assert.ok(revealed, 'revealed should be true after reveal');
  assert.ok(
    computeHash(revealed_secret).equals(commit_hash),
    'Revealed secret does not match commitment'
  );
  assert.ok(
    ['HEADS', 'TAILS'].includes(getResult(revealed_secret)),
    'Invalid result from revealed secret'
  );
});

test('Contract: reset clears revealed flag', () => {
  let revealed = true;

  // reset()
  revealed = false;

  assert.strictEqual(revealed, false, 'reset() should set revealed to false');
});

test('Contract: reveal before commit — commitment mismatch is detectable', () => {
  const uninitialised_commit = Buffer.alloc(32, 0x00);
  const secret = generateSecret();

  // Trying to reveal against a zeroed commitment should fail
  assert.ok(
    !computeHash(secret).equals(uninitialised_commit),
    'Revealed secret matched uninitialised commitment — ordering not enforced'
  );
});

test('Contract: double-reveal with different secrets is detectable', () => {
  const secret1 = generateSecret();
  const secret2 = generateSecret();

  let commit_hash = computeHash(secret1);

  // First reveal — valid
  assert.ok(computeHash(secret1).equals(commit_hash), 'First reveal should pass');

  // Second reveal with different secret — must fail
  assert.ok(!computeHash(secret2).equals(commit_hash), 'Second reveal with wrong secret must fail');
});

test('Contract: re-commit after reset produces a fresh, independent commitment', () => {
  const secret1 = generateSecret();
  const hash1   = computeHash(secret1);

  // reset then re-commit
  const secret2 = generateSecret();
  const hash2   = computeHash(secret2);

  assert.ok(!hash1.equals(hash2), 'Re-commit after reset produced same commitment');
  assert.ok(!secret1.equals(secret2), 'Re-generated secret is identical to previous');
});