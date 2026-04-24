import type {
  SnelStartFactuur,
  SnelStartRelatie,
  SnelStartArtikel,
  SnelStartTransformConfig,
  OrderUpsertPayload,
  OrderLinePayload,
} from "./types.js";

/**
 * Transform een SnelStart factuur + relatie naar OrderUpsertPayload + OrderLinePayload[].
 */
export function transformFactuur(
  factuur: SnelStartFactuur,
  relatie: SnelStartRelatie | null,
  artikelen: Map<string, SnelStartArtikel>,
  config: SnelStartTransformConfig
): { order: OrderUpsertPayload; orderLines: OrderLinePayload[] } {
  const orderAmount = factuur.regels.reduce((sum, regel) => sum + regel.totaal, 0);

  const segment = resolveSegment(relatie, config);
  const customerType = segment.toLowerCase() === "consument" ? "consument" : "zakelijk";

  const order: OrderUpsertPayload = {
    crm_order_id: factuur.factuurnummer,
    company_id: config.companyId,
    crm_company_name: relatie?.naam ?? null,
    crm_order_date: factuur.factuurdatum?.split("T")[0] ?? null,
    order_amount: Math.round(orderAmount * 100) / 100,
    order_status: "completed",
    crm_segment: segment,
    crm_customer_type: customerType,
    system_company_id: relatie?.id ?? null,
    system_order_id: factuur.id,
    email: relatie?.email ?? null,
    contact_phone: relatie?.telefoon ?? null,
    crm_customer_code: relatie?.kvkNummer ?? null,
    shipping_city: relatie?.vestigingsAdres?.plaats ?? null,
    shipping_postal_code: relatie?.vestigingsAdres?.postcode ?? null,
    shipping_address_line_1: relatie?.vestigingsAdres?.straat ?? null,
    shipping_country: relatie?.vestigingsAdres?.land?.naam ?? null,
  };

  const orderLines: OrderLinePayload[] = factuur.regels
    .filter((regel) => regel.totaal !== 0)
    .map((regel) => {
      const artikelId = regel.artikel?.id;
      const artikel = artikelId ? artikelen.get(artikelId) : undefined;

      const quantity = regel.aantal || 1;
      let unitPrice = regel.stuksprijs || 0;

      if (regel.kortingsPercentage && regel.kortingsPercentage > 0) {
        unitPrice = unitPrice * (1 - regel.kortingsPercentage / 100);
      }

      return {
        product_id: artikelId ?? null,
        product_sku: artikel?.artikelcode ?? null,
        product_description: regel.omschrijving || artikel?.omschrijving || null,
        quantity,
        unit_price: Math.round(unitPrice * 100) / 100,
        discount_amount: 0,
        cost_price: null,
      };
    });

  return { order, orderLines };
}

function resolveSegment(
  relatie: SnelStartRelatie | null,
  config: SnelStartTransformConfig
): string {
  if (!relatie || !config.segmentMapping) {
    return config.defaultSegment || "zakelijk";
  }

  for (const soort of relatie.relatiesoort) {
    const mapped = config.segmentMapping[soort];
    if (mapped) return mapped;
  }

  return config.defaultSegment || "zakelijk";
}
