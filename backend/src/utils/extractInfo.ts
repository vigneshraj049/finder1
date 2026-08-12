// Extract Indian phone numbers (10 digits, optionally with +91, spaces, or split into two groups)
export const extractPhoneNumber = (caption: string): string | null => {
  if (!caption) return null;

  // Matches: +91 98765 43210, 9876543210, 98765 43210, 98765-43210
  const phoneRegex = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/;
  const match = caption.match(phoneRegex);

  if (!match) return null;

  // Clean up: remove spaces, dashes, +91 prefix
  return match[0].replace(/[\s-]/g, "").replace(/^\+?91/, "");
};

// Extract price mentions like ₹549/- Sq.Ft, ₹45 Lakhs, ₹95 Lakhs Onwards
export const extractPrice = (caption: string): string | null => {
  if (!caption) return null;

  // Matches patterns like ₹549, ₹45 Lakhs, ₹999/- per Sq.Ft
  const priceRegex = /₹\s?[\d,]+(?:\.\d+)?\s?(?:\/-)?\s?(?:per\s?)?(?:Sq\.?\s?Ft|Lakhs?|Cr|Crores?)?/i;
  const match = caption.match(priceRegex);

  return match ? match[0].trim() : null;
};