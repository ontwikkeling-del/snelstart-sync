import type { CompanyConnection, SnelStartTransformConfig, SnelStartSegmentMapping } from "./types.js";
import { readVaultSecret, getSupabase, startSyncLog, completeSyncLog, getSyncCursor, updateSyncCursor } from "./supabase.js";
import { parseCredentials, authenticate } from "./snelstart-auth.js";
import { SnelStartClient } from "./snelstart-api.js";
import { transformFactuur } from "./snelstart-transform.js";
import { upsertOrder } from "./order-upsert.js";
import { logSection, logDetail, logSummary } from "./logger.js";

const DEFAULT_LOOKBACK_DAYS = 3;

interface SyncResult {
  company: string;
  found: number;
  processed: number;
  errors: number;
  durationMs: number;
}

/**
 * Sync een enkele SnelStart connectie.
 */
export async function syncConnection(
  connection: CompanyConnection & { company_name?: string }
): Promise<SyncResult> {
  const companyName = connection.company_name ?? "Onbekend";
  const startTime = Date.now();
  let found = 0;
  let processed = 0;
  let errors = 0;

  logSection(companyName, "Sync gestart");

  // 1. Credentials uit Vault
  const secretId = connection.api_key_secret_id;
  if (!secretId) {
    throw new Error("Geen api_key_secret_id op connectie");
  }

  const rawSecret = await readVaultSecret(secretId);
  const credentials = parseCredentials(rawSecret);
  logDetail("Credentials opgehaald uit Vault");

  // 2. Authenticeer
  const token = await authenticate(credentials);
  const expiresIn = new Date(token.expiresAt).toLocaleTimeString("nl-NL");
  logDetail(`SnelStart token verkregen (geldig tot ${expiresIn})`);

  // 3. Sync window bepalen
  const cursor = await getSyncCursor(connection.id, "verkoopfacturen");
  let modifiedSince: string | undefined;

  if (cursor?.last_modified_cursor) {
    modifiedSince = cursor.last_modified_cursor;
  } else if (cursor?.last_synced_at) {
    modifiedSince = cursor.last_synced_at;
  } else {
    // Eerste run: afgelopen X dagen
    const lookback = new Date();
    lookback.setDate(lookback.getDate() - DEFAULT_LOOKBACK_DAYS);
    modifiedSince = lookback.toISOString();
  }

  const now = new Date().toISOString();
  logDetail(`Sync window: ${modifiedSince.split("T")[0]} → ${now.split("T")[0]}`);

  // 4. Start sync log
  const syncType = cursor?.last_synced_at ? "incremental" : "full";
  const syncLog = await startSyncLog(connection.id, connection.company_id, "verkoopfacturen", syncType);

  try {
    // 5. Fetch facturen
    const client = new SnelStartClient(token);
    const facturen = await client.getVerkoopfacturen(modifiedSince);
    found = facturen.length;
    logDetail(`Facturen gevonden: ${found}`);

    if (syncLog) {
      syncLog.recordsFetched = found;
    }

    // 6. Transform config
    const entityConfig = connection.entity_config ?? {};
    const config: SnelStartTransformConfig = {
      companyId: connection.company_id,
      segmentMapping: (entityConfig.segmentMapping as SnelStartSegmentMapping) ?? undefined,
      defaultSegment: (entityConfig.defaultSegment as string) ?? "zakelijk",
    };

    const supabase = getSupabase();

    // 7. Process elke factuur
    let latestModifiedOn = modifiedSince;

    for (const factuur of facturen) {
      try {
        // Relatie ophalen
        const relatie = await client.getRelatie(factuur.relatie.id);

        // Artikelen ophalen
        const artikelen = new Map<string, Awaited<ReturnType<typeof client.getArtikel>>>();
        for (const regel of factuur.regels) {
          if (regel.artikel?.id && !artikelen.has(regel.artikel.id)) {
            try {
              const artikel = await client.getArtikel(regel.artikel.id);
              artikelen.set(regel.artikel.id, artikel);
            } catch {
              // Artikel niet gevonden — niet fataal
            }
          }
        }

        // Transform
        const { order, orderLines } = transformFactuur(factuur, relatie, artikelen, config);

        // Upsert
        await upsertOrder(supabase, order, orderLines);

        processed++;
        if (syncLog) syncLog.recordsCreated++;

        logDetail(
          `Factuur ${factuur.factuurnummer}: €${order.order_amount?.toFixed(2)} → upsert OK`
        );

        // Track latest modifiedOn
        if (factuur.modifiedOn && factuur.modifiedOn > latestModifiedOn) {
          latestModifiedOn = factuur.modifiedOn;
        }
      } catch (err) {
        errors++;
        if (syncLog) syncLog.recordsErrored++;
        logDetail(`Factuur ${factuur.factuurnummer}: FOUT — ${(err as Error).message}`);
      }
    }

    // 8. Update cursor
    if (latestModifiedOn) {
      await updateSyncCursor(connection.id, "verkoopfacturen", latestModifiedOn);
    }

    // 9. Complete sync log
    if (syncLog) {
      await completeSyncLog(syncLog, "completed");
    }
  } catch (err) {
    if (syncLog) {
      await completeSyncLog(syncLog, "failed", (err as Error).message);
    }
    throw err;
  }

  const durationMs = Date.now() - startTime;
  logSummary(companyName, { found, processed, errors, durationMs });

  return { company: companyName, found, processed, errors, durationMs };
}
