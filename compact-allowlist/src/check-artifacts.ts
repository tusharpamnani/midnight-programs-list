import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractSourcePath = path.resolve(
  __dirname,
  '..',
  'contracts',
  'zk-allowlist.compact',
);
const generatedContractPath = path.resolve(
  __dirname,
  '..',
  'contracts',
  'managed',
  'zk-allowlist',
  'contract',
  'index.js',
);

export function ensureCompiledArtifacts() {
  if (!fs.existsSync(contractSourcePath)) {
    throw new Error(
      'Missing contracts/zk-allowlist.compact. Restore the contract source before compiling.',
    );
  }

  if (!fs.existsSync(generatedContractPath)) {
    throw new Error(
      'Missing compiled contract artifacts. Run `npm run compile` before `npm run deploy` or `npm run zk -- submit-proof`.',
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    ensureCompiledArtifacts();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}