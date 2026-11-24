// Client-side validation mirrors the server rules for fast feedback only.
// The server re-validates everything and is the authority.

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim());

export function validateLogin({ email, password }) {
  const e = {};
  if (!isEmail(email)) e.email = 'Enter a valid email address';
  if (!password) e.password = 'Password is required';
  return e;
}

export function validateRegister({ name, email, password, confirm }) {
  const e = {};
  if (!name || name.trim().length < 2) e.name = 'Enter your full name';
  if (!isEmail(email)) e.email = 'Enter a valid email address';
  if (!password || password.length < 8) e.password = 'At least 8 characters';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) e.password = 'Use letters and numbers';
  if (confirm !== password) e.confirm = 'Passwords do not match';
  return e;
}

export function validateShipping(s) {
  const e = {};
  if (!s.name || s.name.trim().length < 2) e.name = 'Recipient name is required';
  if (!/^(\+63|0)9\d{9}$/.test(s.phone.trim())) e.phone = 'Use a PH mobile number, e.g. 09171234567';
  if (!s.addressLine || s.addressLine.trim().length < 5) e.addressLine = 'Enter street / barangay';
  if (!s.city || s.city.trim().length < 2) e.city = 'City is required';
  if (!s.province || s.province.trim().length < 2) e.province = 'Province is required';
  if (!/^\d{4}$/.test(s.postalCode.trim())) e.postalCode = '4-digit postal code (Baguio: 2600)';
  return e;
}

/** Maps server 422 field details onto form fields. */
export function fieldErrorsFrom(apiError) {
  if (!Array.isArray(apiError?.details)) return {};
  return Object.fromEntries(apiError.details.map((d) => [String(d.field || '').split('.').pop(), d.message]));
}
