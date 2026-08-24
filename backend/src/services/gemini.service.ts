import { extractPhoneNumber, extractPrice, extractEmail, extractIndianPhoneFromText } from "../utils/extractInfo";

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

  const addressInstruction = missingFields.includes("address")
    ? `\n- For "address": Extract the FULL address including street name, area/neighbourhood, and city. Do NOT just write the city name alone (e.g., do NOT return just "Trichy"). Look for any printed text on the image that says a street name, plot number, area name, or landmark. Example of a good address: "Vai Ramalinga Nagar 1st Main Road, Woraiyur, Trichy".`
    : "";

  const prompt = `You are a Vision OCR assistant for Real Estate listings.
Look carefully at ALL the text printed anywhere on this image and extract the following information:
${missingFields.join(", ")}
${addressInstruction}

- For "budgetText": Look for any price mentions like "Lakhs", "Sq.Ft", etc. Support Tamil price text like "சதுரடி 699" (translates to "₹699 per Sq.Ft"), "இலட்சம்" (Lakhs), or "ரூபாய்" (Rupees).

Return ONLY a valid JSON object with the exact keys listed above. If a field is not visible in the image, return "NA" for that key. Do not make up information.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiApiKey}`;

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

// 2B. Video OCR Extraction (Only for videos/reels)
export const extractFromVideoOCR = async (
  videoUrl: string,
  missingFields: string[],
  retries = 1
): Promise<Partial<ExtractedListing>> => {
  if (missingFields.length === 0) return {};

  try {
    const response = await fetch(videoUrl);
    if (!response.ok) return {};
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Video = buffer.toString("base64");

    const addressInstruction = missingFields.includes("address")
      ? `\n- For "address": Extract the FULL address including street name, area/neighbourhood, and city. Do NOT just write the city name alone (e.g., do NOT return just "Trichy"). Look for any printed text on the video frames that says a street name, plot number, area name, or landmark.`
      : "";

    const prompt = `You are a Video analysis assistant for Real Estate listings.
Watch this short reel/video carefully and extract the following missing information:
${missingFields.join(", ")}
${addressInstruction}

- For "contactPhone": Look for any 10-digit phone number displayed on screen in text overlay. Example: "9940288821".
- For "budgetText": Look for any price mentions. Support Tamil price text like "சதுரடி 699" (translates to "₹699 per Sq.Ft"), "இலட்சம்" (Lakhs), or "ரூபாய்" (Rupees).

Return ONLY a valid JSON object with the exact keys listed above. If a field is not visible in the video, return "NA" for that key. Do not make up information.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiApiKey}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const geminiRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inlineData: { mimeType: "video/mp4", data: base64Video } }
              ]
            }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
          }),
        });

        if (!geminiRes.ok) {
          if (attempt < retries) {
            await sleep(attempt * 1000);
            continue;
          }
          break;
        }

        const data = await geminiRes.json();
        const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawJson) return {};

        const cleanText = rawJson.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
        return JSON.parse(cleanText);
      } catch (error) {
        if (attempt < retries) await sleep(attempt * 1000);
      }
    }
  } catch (err: any) {
    console.error(`Failed to download/parse video for OCR:`, err.message);
  }
  return {};
};

// 3. Final LLM Normalization
export const normalizeListingData = async (
  mergedData: any,
  retries = 2
): Promise<ExtractedListing> => {
  
  const prompt = `You are an expert real estate data normalizer for Indian property listings.
You are given a raw merged data object from our Parallel Data Pipeline (containing regex data, image OCR data, video thumbnail OCR data, and website scraper data).
Your job is to normalize this into a final clean JSON object by intelligently picking the best available contact information and extracting the property details.

Parallel Agent Data:
${JSON.stringify(mergedData, null, 2)}

Instructions for Address / Location:
- We need the location split into two parts: "city" and "local_area".
- "city": The main city (e.g., "Trichy"). Translate Tamil script to English.
- "local_area": The specific street, avenue, or neighbourhood mentioned in the caption or OCR (e.g., "Woraiyur", "Meenambiga Avenue", "Thillai Nagar").
- IMPORTANT: The field "rawAddress" in the Parallel Agent Data may already have a pre-extracted address. If it is not "NA", use it as the primary source for both city and local_area.
- If the text says "Meenambiga Avenue - Woraiyur", put "Meenambiga Avenue - Woraiyur" in "local_area".
- Do NOT put the city name in "local_area". If no local area is mentioned, return "NA" for "local_area".

Instructions for other fields:
- title: Short, clean property title (max 10 words).
- description: 1-2 concise sentences summarizing the property features and offering.
- contactPhone: 10-digit Indian phone number without spaces or country code (or "NA"). Use the one provided in raw data if valid.
- contactEmail: Email address (or "NA"). Use the one provided in raw data if valid.
- budgetText: Price, rate per sq.ft, or budget mentioned (e.g. "₹549/- Sq.Ft", "₹45 Lakhs"). Support Tamil keywords like "சதுரடி 699" (translates to "₹699 per Sq.Ft") or "இலட்சம்" (Lakhs). Output in a normalized clean format (e.g. "₹699 per Sq.Ft" or "₹45 Lakhs").

Return valid JSON with keys: title, description, city, local_area, contactPhone, contactEmail, budgetText.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiApiKey}`;

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

      // Clean phone cleanly using extractIndianPhoneFromText
      let phone = parsed.contactPhone || mergedData.rawPhone || mergedData.agent2_imageData?.contactPhone || mergedData.agent3_videoData?.contactPhone || "NA";
      if (phone && phone !== "NA") {
        const extractedPhone = extractIndianPhoneFromText(String(phone));
        if (extractedPhone) {
          phone = extractedPhone;
        } else {
          phone = String(phone).replace(/[^0-9]/g, "");
          if (phone.length > 10 && phone.startsWith("91")) phone = phone.slice(2);
          if (phone.length > 10) phone = phone.slice(0, 10); // Keep only first 10 digits
        }
      }
      
      const fallbackEmail = mergedData.rawEmail || mergedData.agent1_websiteData || mergedData.agent2_imageData?.contactEmail || mergedData.agent3_videoData?.contactEmail || "NA";
      const fallbackBudget = mergedData.rawBudget || mergedData.agent2_imageData?.budgetText || mergedData.agent3_videoData?.budgetText || "NA";

      // ADDRESS: Prioritise rawAddress (direct regex from caption) over AI output
      let finalAddress = "NA";
      if (mergedData.rawAddress && mergedData.rawAddress !== "NA") {
        // Caption regex found a clean address — trust it completely
        finalAddress = mergedData.rawAddress;
      } else {
        let city = parsed.city && parsed.city !== "NA" ? parsed.city : "NA";
        let localArea = parsed.local_area && parsed.local_area !== "NA" ? parsed.local_area : "NA";

        // FALLBACK: If LLM missed local area but Vision OCR found an address, use the OCR address!
        if (localArea === "NA") {
          const ocrAddr = mergedData.agent2_imageData?.address || mergedData.agent3_videoData?.address;
          if (ocrAddr && ocrAddr !== "NA") {
            finalAddress = ocrAddr;
            city = "NA";
          }
        }

        if (finalAddress === "NA") {
          if (localArea !== "NA" && city !== "NA") {
            finalAddress = `${localArea}, ${city}`;
          } else if (localArea !== "NA") {
            finalAddress = localArea;
          } else if (city !== "NA") {
            finalAddress = city;
          }
        }
      }

      return {
        title: parsed.title && parsed.title !== "NA" ? parsed.title : "NA",
        description: parsed.description && parsed.description !== "NA" ? parsed.description : "NA",
        address: finalAddress,
        contactPhone: phone && phone !== "NA" ? phone : "NA",
        contactEmail: parsed.contactEmail && parsed.contactEmail !== "NA" ? parsed.contactEmail : fallbackEmail,
        budgetText: parsed.budgetText && parsed.budgetText !== "NA" ? parsed.budgetText : fallbackBudget,
      };
    } catch (error: any) {
      console.error(`Gemini normalization attempt ${attempt} failed:`, error?.message || error);
      if (attempt < retries) await sleep(attempt * 1000);
    }
  }

  // Fallback when Gemini API fails - use rawAddress from caption extraction if available
  return {
    title: "NA",
    description: (mergedData.rawCaption || "").slice(0, 300) || "NA",
    address: (mergedData.rawAddress && mergedData.rawAddress !== "NA") ? mergedData.rawAddress : "NA",
    contactPhone: mergedData.rawPhone || "NA",
    contactEmail: mergedData.rawEmail || "NA",
    budgetText: mergedData.rawBudget || "NA",
  };
};