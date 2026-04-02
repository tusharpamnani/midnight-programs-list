const API_URL = "http://localhost:3001/api";

export async function commit(): Promise<string> {
  const res = await fetch(`${API_URL}/commit`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Commit failed");
  }
  const data = await res.json();
  return data.commitHash;
}

export async function reveal(): Promise<string> {
  const res = await fetch(`${API_URL}/reveal`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Reveal failed");
  }
  const data = await res.json();
  return data.secret;
}

export async function getResult(secretHex: string): Promise<"HEADS" | "TAILS"> {
  const lastByte = parseInt(secretHex.slice(-2), 16);
  return lastByte % 2 === 0 ? "HEADS" : "TAILS";
}

// Client-side verification using Web Crypto API to PROVE fairness
export async function verify(secretHex: string, commitHashHex: string): Promise<boolean> {
  // The secret from the backend is a 32-byte hex string
  const secretBuffer = new Uint8Array(
    secretHex.match(/[\da-f]{2}/gi)!.map((h) => parseInt(h, 16))
  );

  const hashBuffer = await crypto.subtle.digest("SHA-256", secretBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const computedHashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return computedHashHex === commitHashHex;
}
