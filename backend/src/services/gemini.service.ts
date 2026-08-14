import { extractPhoneNumber, extractPrice, extractEmail } from "../utils/extractInfo";

const geminiApiKey = process.env.GEMINI_API_KEY;

if (!geminiApiKey) {
  throw new Error("GEMINI_API_KEY is not set in environment variables");
}

export interface ExtractedListing {
  title: string;
  description: string;
  address: string;
  contactPhone: string;
  contactEmail: string;
  budgetText: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to fetch image and return base64
const fetchImageAsBase64 = async (url: string): Promise<{ mimeType: string; data: string } | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = response.headers.get("content-type") || "image/jpeg";
    return {
      mimeType,
      data: buffer.toString("base64"),
    };
  } catch (error) {
    console.error("Failed to fetch image for OCR:", error);
    return null;
  }
};

// 1. Raw Regex Extraction
export const performRegexExtraction = (caption: string) => {
  const cleanCaption = (caption || "").trim();
  return {
    phone: extractPhoneNumber(cleanCaption) || "NA",
    email: extractEmail(cleanCaption) || "NA",
    budget: extractPrice(cleanCaption) || "NA",
  };
};

// 2. Image OCR Extraction (Only for missing fields)
export const extractFromImageOCR = async (
  imageUrl: string,
  missingFields: string[],
  retries = 1
): Promise<Partial<ExtractedListing>> => {
  if (missingFields.length === 0) return {};

  const imageData = await fetchImageAsBase64(imageUrl);
  if (!imageData) return {};

  const prompt = `You are a Vision OCR assistant for Real Estate.
Please read the text printed on this image and extract the following missing information if present:
${missingFields.join(", ")}

Return ONLY a valid JSON object with the keys for the fields you found. If a field is not found in the image, return "NA" for that key. Do not make up information.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiApiKey}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: imageData.mimeType, data: imageData.data } }
            ]
          }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
        }),
      });

      if (!response.ok) {
        if (attempt < retries) {
          await sleep(attempt * 1000);
          continue;
        }
        break;
      }

      const data = await response.json();
      const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJson) return {};

      const cleanText = rawJson.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      return JSON.parse(cleanText);
    } catch (error) {
      if (attempt < retries) await sleep(attempt * 1000);
    }
  }
  return {};
};

// 3. Final LLM Normalization
export const normalizeListingData = async (
  mergedData: any,
  retries = 2
): Promise<ExtractedListing> => {
  
  const prompt = `You are an expert real estate data normalizer for Indian property listings.
You are given a raw merged data object containing text from an Instagram caption, regex-extracted fields, and OCR-extracted fields from an image/video.
Your job is to normalize this into a final clean JSON object.

Raw Merged Data:
${JSON.stringify(mergedData, null, 2)}

Instructions for Address / Location:
- Search the caption and OCR text for ANY location, area, street, landmark, city.
- Examples: "Thillai Nagar, Trichy", "Woraiyur", "Trichy - Chennai Bypass".
- Translate Tamil script (e.g. "திருச்சி") to English ("Trichy").
- Ensure the city name is included (e.g. "Thillai Nagar, Trichy").
- If completely unknown, return "NA".

Instructions for other fields:
- title: Short, clean property title (max 10 words).
- description: 1-2 concise sentences summarizing the property features and offering.
- contactPhone: 10-digit Indian phone number without spaces or country code (or "NA"). Use the one provided in raw data if valid.
- contactEmail: Email address (or "NA"). Use the one provided in raw data if valid.
- budgetText: Price, rate per sq.ft, or budget mentioned (e.g. "₹549/- Sq.Ft", "₹45 Lakhs").

Return valid JSON with keys: title, description, address, contactPhone, contactEmail, budgetText.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiApiKey}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
        }),
      });

      if (!response.ok) {
        if (attempt < retries) {
          await sleep(attempt * 1000);
          continue;
        }
        break;
      }

      const data = await response.json();
      const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJson) throw new Error("Empty response from Gemini");

      const cleanText = rawJson.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(cleanText);

      // Clean phone
      let phone = parsed.contactPhone || mergedData.phone || "NA";
      if (phone && phone !== "NA") {
        phone = String(phone).replace(/[^0-9]/g, "");
        if (phone.length > 10 && phone.startsWith("91")) phone = phone.slice(2);
      }

      return {
        title: parsed.title && parsed.title !== "NA" ? parsed.title : "NA",
        description: parsed.description && parsed.description !== "NA" ? parsed.description : "NA",
        address: parsed.address && parsed.address !== "NA" ? parsed.address : "NA",
        contactPhone: phone && phone !== "NA" ? phone : "NA",
        contactEmail: parsed.contactEmail && parsed.contactEmail !== "NA" ? parsed.contactEmail : (mergedData.email || "NA"),
        budgetText: parsed.budgetText && parsed.budgetText !== "NA" ? parsed.budgetText : (mergedData.budget || "NA"),
      };
    } catch (error: any) {
      console.error(`Gemini normalization attempt ${attempt} failed:`, error?.message || error);
      if (attempt < retries) await sleep(attempt * 1000);
    }
  }

  // Fallback
  return {
    title: "NA",
    description: (mergedData.caption || "").slice(0, 300) || "NA",
    address: (mergedData.caption || "").toLowerCase().includes("trichy") ? "Trichy" : "NA",
    contactPhone: mergedData.phone || "NA",
    contactEmail: mergedData.email || "NA",
    budgetText: mergedData.budget || "NA",
  };
};