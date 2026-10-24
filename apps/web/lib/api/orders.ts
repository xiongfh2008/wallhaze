/** Credentialed backend adapter. Missing API configuration returns unavailable. */

import type { PaymentOrder } from "./credits";
import { apiRequest, resolveApiBaseUrl, type ApiResult } from "./client";

/**
 * Service gate. Flipping this is part of the future Orders API integration —
 * never from UI code.
 */
export const ORDER_SERVICES_CONFIGURED = Boolean(resolveApiBaseUrl());


export interface OrdersAdapter {
  /** Newest-first, cursor-paginated order list for the signed-in user. */
  listOrders(cursor?: string): Promise<ApiResult<{ items: PaymentOrder[]; nextCursor: string | null }>>;
  getOrder(id: string): Promise<ApiResult<PaymentOrder>>;
}

class GatedOrdersAdapter implements OrdersAdapter {
  async listOrders(
    _cursor?: string
  ): Promise<ApiResult<{ items: PaymentOrder[]; nextCursor: string | null }>> {
    return apiRequest(`/v1/orders${_cursor ? `?cursor=${encodeURIComponent(_cursor)}` : ""}`);
  }

  async getOrder(_id: string): Promise<ApiResult<PaymentOrder>> {
    return apiRequest(`/v1/orders/${encodeURIComponent(_id)}`);
  }
}

/** App-wide singleton. Tests may construct their own GatedOrdersAdapter. */
export const ordersAdapter: OrdersAdapter = new GatedOrdersAdapter();
