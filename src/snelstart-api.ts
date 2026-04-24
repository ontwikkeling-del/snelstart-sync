import type {
  SnelStartToken,
  SnelStartFactuur,
  SnelStartRelatie,
  SnelStartArtikel,
} from "./types.js";

const API_BASE = "https://b2bapi.snelstart.nl/v2";
const REQUEST_DELAY_MS = 1_000; // 1 req/s rate limit
const MAX_CACHE_ENTRIES = 500;

// ─── LRU Cache ──────────────────────────────────────────

class LRUCache<T> {
  private cache = new Map<string, T>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const val = this.cache.get(key);
    if (val !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, val);
    }
    return val;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

// ─── Client ─────────────────────────────────────────────

export class SnelStartClient {
  private token: SnelStartToken;
  private lastRequestAt = 0;
  private cache = new LRUCache<unknown>(MAX_CACHE_ENTRIES);

  constructor(token: SnelStartToken) {
    this.token = token;
  }

  private async rateLimitedFetch(url: string): Promise<Response> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < REQUEST_DELAY_MS) {
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS - elapsed));
    }
    this.lastRequestAt = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token.accessToken}`,
          "Ocp-Apim-Subscription-Key": this.token.subscriptionKey,
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`SnelStart API ${res.status}: ${errText}`);
      }

      return res;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async cachedGet<T>(cacheKey: string, url: string): Promise<T> {
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached as T;

    const res = await this.rateLimitedFetch(url);
    const data = await res.json();
    this.cache.set(cacheKey, data);
    return data as T;
  }

  async getVerkoopfacturen(modifiedSince?: string): Promise<SnelStartFactuur[]> {
    let url = `${API_BASE}/verkoopfacturen`;
    if (modifiedSince) {
      url += `?$filter=modifiedOn ge datetime'${modifiedSince}'`;
    }
    const res = await this.rateLimitedFetch(url);
    return res.json();
  }

  async getRelatie(relatieId: string): Promise<SnelStartRelatie> {
    return this.cachedGet<SnelStartRelatie>(
      `relatie:${relatieId}`,
      `${API_BASE}/relaties/${relatieId}`
    );
  }

  async getArtikel(artikelId: string): Promise<SnelStartArtikel> {
    return this.cachedGet<SnelStartArtikel>(
      `artikel:${artikelId}`,
      `${API_BASE}/artikelen/${artikelId}`
    );
  }
}
