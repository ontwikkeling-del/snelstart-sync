// ─── SnelStart API Types ────────────────────────────────

export interface SnelStartFactuur {
  id: string;
  factuurnummer: string;
  factuurdatum: string;
  vervalDatum?: string;
  factuurBedrag: number;
  openstaandSaldo?: number;
  relatie: { id: string; uri?: string };
  regels: SnelStartFactuurRegel[];
  modifiedOn?: string;
}

export interface SnelStartFactuurRegel {
  omschrijving: string;
  aantal: number;
  stuksprijs: number;
  kortingsPercentage?: number;
  totaal: number;
  artikel?: { id: string; uri?: string };
}

export interface SnelStartRelatie {
  id: string;
  naam: string;
  relatiesoort: string[];
  email?: string;
  telefoon?: string;
  vestigingsAdres?: {
    straat?: string;
    postcode?: string;
    plaats?: string;
    land?: { naam?: string };
  };
  kvkNummer?: string;
  modifiedOn?: string;
}

export interface SnelStartArtikel {
  id: string;
  artikelcode: string;
  omschrijving: string;
  verkoopprijs?: number;
  modifiedOn?: string;
}

export interface SnelStartCredentials {
  clientKey: string;
  subscriptionKey: string;
}

export interface SnelStartToken {
  accessToken: string;
  subscriptionKey: string;
  expiresAt: number; // Unix ms
}

// ─── Order Types ────────────────────────────────────────

export interface OrderUpsertPayload {
  crm_order_id: string;
  company_id: string;
  crm_first_name?: string | null;
  crm_last_name?: string | null;
  email?: string | null;
  order_amount?: number | null;
  crm_order_date?: string | null;
  shipping_cost?: number | null;
  crm_segment?: string | null;
  crm_customer_type?: string | null;
  crm_company_name?: string | null;
  system_company_id?: string | null;
  system_order_id?: string | null;
  order_status?: string | null;
  crm_customer_code?: string | null;
  contact_phone?: string | null;
  shipping_address_line_1?: string | null;
  shipping_postal_code?: string | null;
  shipping_city?: string | null;
  shipping_country?: string | null;
}

export interface OrderLinePayload {
  product_id?: string | null;
  product_description?: string | null;
  product_sku?: string | null;
  quantity: number;
  unit_price: number;
  discount_amount?: number;
  cost_price?: number | null;
}

// ─── Connector Hub Types ────────────────────────────────

export interface CompanyConnection {
  id: string;
  company_id: string;
  connector_definition_id: string;
  display_name: string | null;
  external_account_id: string | null;
  access_token_secret_id: string | null;
  refresh_token_secret_id: string | null;
  api_key_secret_id: string | null;
  status: string;
  sync_enabled: boolean;
  entity_config: Record<string, unknown>;
  last_health_check_at: string | null;
}

export interface SyncLogHandle {
  logId: string;
  connectionId: string;
  companyId: string;
  entity: string;
  startedAt: Date;
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsErrored: number;
}

export interface SnelStartSegmentMapping {
  [relatiesoort: string]: string;
}

export interface SnelStartTransformConfig {
  companyId: string;
  segmentMapping?: SnelStartSegmentMapping;
  defaultSegment?: string;
}
