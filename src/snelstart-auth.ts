import type { SnelStartCredentials, SnelStartToken } from "./types.js";

const TOKEN_URL = "https://auth.snelstart.nl/b2b/token";

/**
 * Parse JSON credentials uit Vault.
 * Verwacht: { "client_key": "...", "subscription_key": "..." }
 */
export function parseCredentials(raw: string): SnelStartCredentials {
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Ongeldige credentials JSON — verwacht { client_key, subscription_key }");
  }

  const clientKey = parsed.client_key;
  const subscriptionKey = parsed.subscription_key;

  if (!clientKey || !subscriptionKey) {
    throw new Error("Credentials missen client_key of subscription_key");
  }

  return { clientKey, subscriptionKey };
}

/**
 * Authenticeer bij SnelStart B2B API.
 */
export async function authenticate(credentials: SnelStartCredentials): Promise<SnelStartToken> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const body = new URLSearchParams({
      grant_type: "clientkey",
      clientkey: credentials.clientKey,
    });

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 400) {
        throw new Error("Client Key is ongeldig");
      }
      throw new Error(`SnelStart auth fout (${res.status}): ${errText}`);
    }

    const data = await res.json();

    return {
      accessToken: data.access_token,
      subscriptionKey: credentials.subscriptionKey,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };
  } finally {
    clearTimeout(timeout);
  }
}
