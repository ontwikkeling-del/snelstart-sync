import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderUpsertPayload, OrderLinePayload } from "./types.js";

export interface UpsertResult {
  orderId: string;
  created: boolean;
  orderLines?: {
    updated_count: number;
    inserted_count: number;
    deleted_count: number;
    total_processed: number;
  };
}

export async function upsertOrder(
  supabase: SupabaseClient,
  order: OrderUpsertPayload,
  orderLines?: OrderLinePayload[]
): Promise<UpsertResult> {
  // Resolve canonical customer name
  if (order.crm_company_name && order.company_id) {
    const { data: canonical } = await supabase.rpc("resolve_canonical_name", {
      p_company_id: order.company_id,
      p_raw_name: order.crm_company_name,
    });
    if (canonical) {
      order.crm_company_name = canonical;
    }
  }

  if (!order.crm_order_date) {
    order.crm_order_date = new Date().toISOString().split("T")[0];
  }

  const { data, error } = await supabase
    .from("orders")
    .upsert([order], {
      onConflict: "company_id,crm_order_id",
      ignoreDuplicates: false,
    })
    .select("id");

  if (error) {
    throw new Error(`Order upsert failed: ${error.message}`);
  }

  const createdOrder = data[0];
  const result: UpsertResult = {
    orderId: createdOrder.id,
    created: true,
  };

  if (orderLines && orderLines.length > 0) {
    const { data: mergeResult, error: mergeError } = await supabase.rpc(
      "merge_order_lines",
      {
        p_order_id: createdOrder.id,
        p_company_id: order.company_id,
        p_lines: orderLines.map((line) => {
          const quantity = line.quantity || 1;
          let unit_price = line.unit_price || 0;
          if (!unit_price) {
            const line_total = (line.unit_price || 0) * quantity;
            if (line_total && quantity) unit_price = line_total / quantity;
          }

          return {
            product_id: line.product_id ?? null,
            product_description: line.product_description ?? null,
            product_sku: line.product_sku ?? null,
            quantity,
            unit_price,
            discount_amount: line.discount_amount || 0,
            cost_price: line.cost_price ?? null,
          };
        }),
      }
    );

    if (mergeError) {
      throw new Error(`Order lines merge failed: ${mergeError.message}`);
    }

    result.orderLines = mergeResult;
  }

  return result;
}
