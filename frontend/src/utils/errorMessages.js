/** Friendly copy for backend error codes (error envelope -> UI). */
const MESSAGES = {
  NETWORK_ERROR: 'Cannot reach the server. Check your connection.',
  AUTH_REQUIRED: 'Please sign in to continue.',
  TOKEN_EXPIRED: 'Your session expired. Please sign in again.',
  TOKEN_INVALID: 'Please sign in again.',
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  EMAIL_TAKEN: 'That email already has an account. Try signing in.',
  FORBIDDEN: 'You do not have access to this page.',
  NOT_FOUND: 'We could not find that.',
  INSUFFICIENT_STOCK: 'Not enough stock for that quantity.',
  OUT_OF_STOCK: 'Someone just bought the last unit. Your cart was not charged.',
  PRODUCT_UNAVAILABLE: 'An item is no longer sold. Remove it from your cart.',
  CART_EMPTY: 'Your cart is empty.',
  CART_INCOMPATIBLE: 'Some parts in your cart are not compatible. See the compatibility panel.',
  COUPON_NOT_FOUND: 'That coupon code does not exist.',
  COUPON_EXPIRED: 'That coupon has expired.',
  COUPON_INACTIVE: 'That coupon is not active.',
  COUPON_NOT_STARTED: 'That coupon is not valid yet.',
  COUPON_EXHAUSTED: 'That coupon has been fully used.',
  COUPON_MIN_SPEND_NOT_MET: 'Your cart does not meet the coupon minimum spend.',
  COUPON_CUSTOMER_LIMIT_REACHED: 'You have already used this coupon.',
  ORDER_NOT_CANCELLABLE: 'Only unpaid orders can be cancelled.',
  ILLEGAL_TRANSITION: 'That status change is not allowed.',
  AI_UNAVAILABLE: 'The AI advisor is unavailable right now. Showing keyword results instead.',
  AI_RATE_LIMITED: 'You have reached the AI advisor limit. Try again in a few minutes.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment.',
  BUILD_INCOMPATIBLE: 'Fix compatibility errors first.',
  BUILD_LIMIT_REACHED: 'You can save up to 10 builds.',
  PAYMENT_GATEWAY_UNAVAILABLE: 'The payment page could not be opened. Your order is saved – retry from your order.',
};

export function messageFor(error) {
  if (!error) return '';
  if (error.status === 422 && error.code === 'VALIDATION_ERROR') return 'Please check the highlighted fields.';
  return MESSAGES[error.code] || error.message || 'Something went wrong.';
}
