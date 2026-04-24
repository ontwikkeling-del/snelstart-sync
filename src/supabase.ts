import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { CompanyConnection, SyncLogHandle } from "./types.js";

let client: SupabaseClient;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn verplicht");
    }
    client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}

/**
 * Haal alle actieve SnelStart connecties op.
 */
export async function getActiveSnelStartConnections(): Promise<
  (CompanyConnection & { company_name?: string })[]
> {
  const supabase = getSupabase();

  // Eerst connector_definition_id voor snelstart ophalen
  const { data: def, error: defErr } = await supabase
    .from("connector_definitions")
    .select("id")
    .eq("slug", "snelstart")
    .single();

  if (defErr || !def) {
    throw new Error(`SnelStart connector definitie niet gevonden: ${defErr?.message}`);
  }

  const { data: connections, error } = await supabase
    .from("company_connections")
    .select("*, companies(name)")
    .eq("connector_definition_id", def.id)
    .eq("status", "connected")
    .eq("sync_enabled", true);

  if (error) {
    throw new Error(`Connecties ophalen mislukt: ${error.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (connections ?? []).map((c: any) => ({
    ...c,
    company_name: c.companies?.name ?? "Onbekend",
  })) as (CompanyConnection & { company_name?: string })[];
}

/**
 * Lees een secret uit Vault via RPC.
 */
export async function readVaultSecret(secretId: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("read_vault_secret", {
    p_secret_id: secretId,
  });

  if (error || !data) {
    throw new Error(`Vault secret lezen mislukt: ${error?.message}`);
  }

  return data as string;
}

/**
 * Start een sync log entry.
 */
export async function startSyncLog(
  connectionId: string,
  companyId: string,
  entity: string,
  syncType: "full" | "incremental"
): Promise<SyncLogHandle | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("connection_sync_logs")
    .insert({
      connection_id: connectionId,
      company_id: companyId,
      external_entity: entity,
      sync_type: syncType,
      status: "running",
      triggered_by: "cron",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error(`Sync log aanmaken mislukt: ${error?.message}`);
    return null;
  }

  // Mark cursor as running
  await supabase.from("connection_sync_cursors").upsert(
    {
      connection_id: connectionId,
      external_entity: entity,
      status: "running",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id,external_entity" }
  );

  return {
    logId: data.id,
    connectionId,
    companyId,
    entity,
    startedAt: new Date(),
    recordsFetched: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    recordsErrored: 0,
  };
}

/**
 * Rond een sync log af.
 */
export async function completeSyncLog(
  handle: SyncLogHandle,
  status: "completed" | "failed",
  errorMessage?: string
): Promise<void> {
  const supabase = getSupabase();
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - handle.startedAt.getTime();

  const finalStatus =
    status === "completed" && handle.recordsErrored > 0
      ? "completed_with_errors"
      : status;

  await supabase
    .from("connection_sync_logs")
    .update({
      status: finalStatus,
      records_fetched: handle.recordsFetched,
      records_created: handle.recordsCreated,
      records_updated: handle.recordsUpdated,
      records_errored: handle.recordsErrored,
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      error_message: errorMessage ?? null,
    })
    .eq("id", handle.logId);

  // Update cursor
  await supabase.from("connection_sync_cursors").upsert(
    {
      connection_id: handle.connectionId,
      external_entity: handle.entity,
      status: finalStatus === "failed" ? "error" : "idle",
      last_synced_at: completedAt.toISOString(),
      records_processed: handle.recordsFetched,
      updated_at: completedAt.toISOString(),
    },
    { onConflict: "connection_id,external_entity" }
  );
}

/**
 * Haal de sync cursor op.
 */
export async function getSyncCursor(
  connectionId: string,
  entity: string
): Promise<{ last_synced_at: string | null; last_modified_cursor: string | null } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("connection_sync_cursors")
    .select("last_synced_at, last_modified_cursor")
    .eq("connection_id", connectionId)
    .eq("external_entity", entity)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Update de sync cursor met last_modified_cursor.
 */
export async function updateSyncCursor(
  connectionId: string,
  entity: string,
  lastModifiedCursor: string
): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("connection_sync_cursors").upsert(
    {
      connection_id: connectionId,
      external_entity: entity,
      last_modified_cursor: lastModifiedCursor,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id,external_entity" }
  );
}
