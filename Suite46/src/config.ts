export const ORDER_ENDPOINT = import.meta.env.VITE_ORDER_ENDPOINT || "";
export const CREATE_CHECKOUT_SESSION_ENDPOINT =
  import.meta.env.VITE_CREATE_CHECKOUT_SESSION_ENDPOINT || "/.netlify/functions/create-checkout-session";
export const TAX_RATE_DEFAULT = 0.07;
export const TIP_PRESETS = [0, 0.1, 0.15, 0.2];

// Optional: map item IDs to Stripe Price IDs if you have them
export const STRIPE_PRICE_MAP: Record<string, string> = {
  // "snapper_fries": "price_123",
};
