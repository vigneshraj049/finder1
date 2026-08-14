// Extract Indian phone numbers (10 digits, optionally with +91, spaces, or split into two groups)
export const extractPhoneNumber = (caption: string): string | null => {
  if (!caption) return null;

  const phoneRegex = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/;
  const match = caption.match(phoneRegex);

  if (!match) return null;

  return match[0].replace(/[\s-]/g, "").replace(/^\+?91/, "");
};

export const extractIndianPhoneFromText = (text: string): string | null => {
  if (!text) return null;

  const phoneRegex = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g;
  const matches = text.match(phoneRegex);

  if (!matches || matches.length === 0) return null;

  const cleaned = matches[0].replace(/[\s-]/g, "").replace(/^\+?91/, "");
  return cleaned.length === 10 ? cleaned : null;
};

// Extract price mentions like ₹549/- Sq.Ft, ₹45 Lakhs, ₹95 Lakhs Onwards
export const extractPrice = (caption: string): string | null => {
  if (!caption) return null;

  // Matches patterns like ₹549, ₹45 Lakhs, ₹999/- per Sq.Ft
  const priceRegex = /₹\s?[\d,]+(?:\.\d+)?\s?(?:\/-)?\s?(?:per\s?)?(?:Sq\.?\s?Ft|Lakhs?|Cr|Crores?)?/i;
  const match = caption.match(priceRegex);

  return match ? match[0].trim() : null;
};

// Extract email addresses from caption text
// Handles: info@company.in, mail: abc@gmail.com, contact us at xyz@domain.com
export const extractEmail = (text: string): string | null => {
  if (!text) return null;

  // Standard email regex — matches most email formats
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
  const match = text.match(emailRegex);

  if (!match) return null;

  const email = match[0].toLowerCase().trim();

  // Filter out false positives (Instagram handles like @user look like emails sometimes)
  // Real emails must have a dot in domain part
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  if (!parts[1].includes(".")) return null;
  // Ignore if domain looks like a social platform handle
  if (parts[1].startsWith("gmail") || parts[1].startsWith("yahoo") || parts[1].startsWith("outlook") || parts[1].includes(".")) {
    return email;
  }

  return email;
};