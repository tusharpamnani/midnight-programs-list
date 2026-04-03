import * as fs from 'node:fs';

const STATE_FILE = 'local-state.json';

export type Collection = {
  id: string,
  name: string,
  description: string,
  maxSupply: number,
  contractAddress: string,
  creatorAddress: string,
  createdAt: string
};

export type AppState = {
  ownedTokens: Record<string, {
    tokenId: string,
    metadataHash: string,
    metadata: string,
    txId?: string,
    collectionAddress?: string
  }>,
  collections: Collection[]
};

export function loadState(): AppState {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  }
  return { ownedTokens: {}, collections: [] };
}

export function saveState(state: AppState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function addOwnedToken(tokenId: string, metadataHash: string, metadata: string, txId?: string, collectionAddress?: string) {
  const state = loadState();
  state.ownedTokens[tokenId] = { tokenId, metadataHash, metadata, txId, collectionAddress };
  saveState(state);
}

export function removeOwnedToken(tokenId: string) {
  const state = loadState();
  delete state.ownedTokens[tokenId];
  saveState(state);
}

export function addCollection(collection: Collection) {
  const state = loadState();
  if (!state.collections) state.collections = [];
  state.collections.push(collection);
  saveState(state);
}

export function getCollections() {
  const state = loadState();
  return state.collections || [];
}

export function getOwnedTokens() {
  const state = loadState();
  return state.ownedTokens || {};
}
