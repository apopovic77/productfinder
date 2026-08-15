import { ONEAL_API_BASE, ONEAL_API_KEY } from '../config/apiConfig';

export interface OrderItemPayload {
  product_id?: string;
  product_code?: string;
  product_name: string;
  color?: string;
  size?: string;
  quantity: number;
  price_gross?: number;
  currency?: string;
}

export interface OrderResult {
  order_number: string;
  status: string;
  total_quantity: number;
  item_count: number;
}

/** Submits the cart as a B2B order. Throws on any non-2xx response. */
export async function submitOrder(args: {
  items: OrderItemPayload[];
  customerName?: string;
  note?: string;
}): Promise<OrderResult> {
  const res = await fetch(`${ONEAL_API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': ONEAL_API_KEY },
    body: JSON.stringify({
      source: 'web',
      customer_name: args.customerName || undefined,
      note: args.note || undefined,
      items: args.items,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`order failed: ${res.status} ${detail.slice(0, 200)}`);
  }
  return res.json();
}
