// Extract Indian phone numbers (10 digits, optionally with +91, spaces, or split into two groups)
export const extractPhoneNumber = (caption: string): string | null => {
  if (!caption) return null;

  // Handles spaces or hyphens between any digits, optionally starting with +91
  const phoneRegex = /(?:\+?91[\s-]?)?[6-9](?:[\s-]?\d){9}/;
  const match = caption.match(phoneRegex);

  if (!match) return null;

  return match[0].replace(/[\s-]/g, "").replace(/^\+?91/, "");
};

export const extractIndianPhoneFromText = (text: string): string | null => {
  if (!text) return null;

  const phoneRegex = /(?:\+?91[\s-]?)?[6-9](?:[\s-]?\d){9}/g;
  const matches = text.match(phoneRegex);

  if (!matches || matches.length === 0) return null;

  const cleaned = matches[0].replace(/[\s-]/g, "").replace(/^\+?91/, "");
  return cleaned.length === 10 ? cleaned : null;
};

// Extract price mentions like ₹549/- Sq.Ft, ₹45 Lakhs, 45 Lakhs, Rs. 50L
export const extractPrice = (caption: string): string | null => {
  if (!caption) return null;

  // Matches either:
  // 1) Starts with currency symbol (₹, Rs, INR) followed by digits and optional unit
  // 2) Digits followed directly by a clear unit (Lakhs, L, Cr, K, Sq.Ft)
  const priceRegex = /(?:(?:₹|Rs\.?|INR)\s?\d+(?:,\d+)*(?:\.\d+)?\s?(?:\/-)?)\s?(?:per\s?)?(?:Sq\.?\s?Ft|Lakhs?|L|Cr|Crores?|K)?|(?:\d+(?:,\d+)*(?:\.\d+)?\s?(?:Lakhs?|L|Cr|Crores?|K|Sq\.?\s?Ft)\b)/i;
  const match = caption.match(priceRegex);

  return match ? match[0].trim() : null;
};

// Extract address from caption text using known patterns
// Prioritises 📍 emoji lines, then Address:/Location: labels, then Indian address keywords
export const extractAddressFromCaption = (caption: string): string | null => {
  if (!caption) return null;

  const lines = caption.split(/\n/);

  // 1. Look for lines that contain 📍 emoji — collect ALL valid ones, skip directions
  const pinCandidates: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const idx = trimmed.indexOf("📍");
    if (idx !== -1) {
      const addr = trimmed.slice(idx + 2).trim(); // everything after 📍
      if (addr.length > 5) {
        // Skip if it looks like a distance/direction indicator
        // e.g. "Just 2 Mins from...", "2 KM from...", "5 Minutes from..."
        const isDirection = /^(?:just\s+)?\d+[\d\s]*(?:km|kms|min|mins|minutes?|hours?)\s*(from|away)/i.test(addr);
        if (!isDirection) {
          pinCandidates.push(addr);
        }
      }
    }
  }
  // Return the longest/most specific 📍 address found (skip short generic ones)
  if (pinCandidates.length > 0) {
    return pinCandidates.sort((a, b) => b.length - a.length)[0] || null;
  }


  // 2. Look for "Address:" or "Location:" label
  for (const line of lines) {
    const match = line.match(/(?:Address|Location)\s*[:\-]\s*(.+)/i);
    if (match && match[1] && match[1].trim().length > 5) return match[1].trim();
  }

  // 3. Look for lines containing Indian address keywords + city name
  // But SKIP lines that are hashtag blocks
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip if line is mostly hashtags (>2 hashtags = hashtag block)
    const hashtagCount = (trimmed.match(/#\w+/g) || []).length;
    if (hashtagCount > 2) continue;
    // Skip if line starts with # (a hashtag line)
    if (trimmed.startsWith("#")) continue;

    if (/(?:Nagar|Road|Avenue|Street|Colony|Layout|Bypass|Main|Stage|Phase|Survey)/i.test(trimmed) &&
        /(?:Trichy|Tiruchi|Chennai|Coimbatore|Madurai|Salem|Erode|Vellore|Tirunelveli)/i.test(trimmed)) {
      const addr = trimmed.replace(/[*_~`]/g, "").trim();
      if (addr.length > 10) return addr;
    }
  }

  return null;
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
  const domain = parts[1];
  if (!domain || !domain?.includes(".")) return null;
  // Ignore if domain looks like a social platform handle
  if (domain?.startsWith("gmail") || domain?.startsWith("yahoo") || domain?.startsWith("outlook") || domain?.includes(".")) {
    return email;
  }
  return email;
};

export const extractEmailFromWebsite = async (url: string): Promise<string | null> => {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }

    const response = await fetch(url, { signal: controller.signal as any });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const html = await response.text();
    
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const matches = html.match(emailRegex);
    
    if (!matches) return null;

    for (const match of matches) {
      const email = match.toLowerCase().trim();
      
      if (email.endsWith('.png') || email.endsWith('.jpg') || email.endsWith('.jpeg') || email.endsWith('.webp') || email.endsWith('.gif')) {
        continue;
      }
      if (email.includes('sentry.io') || email.includes('w3.org') || email.includes('example.com')) {
        continue; 
      }

      const parts = email.split("@");
      if (parts.length === 2 && parts[1] && parts[1].includes(".")) {
        return email;
      }
    }
    return null;
  } catch (error: any) {
    console.error(`Failed to extract email from website ${url}:`, error.message);
    return null;
  }
};