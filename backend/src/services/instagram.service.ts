/**
 * instagram.service.ts
 *
 * Handles all Instagram Graph API interactions:
 *  - Building a marketing caption from a property record
 *  - Creating a media container (step 1 of 2-step publish)
 *  - Publishing the container (step 2 of 2-step publish)
 *
 * All Meta credentials are read from process.env — never hardcoded.
 */

export interface PropertyForCaption {
  property_title?: string | null;
  property_type?: string | null;
  budget?: string | null;
  listing_type?: string | null;
  address?: string | null;
  description?: string | null;
  business_name?: string | null;
  contact_phone?: string | null;
}

/**
 * Build an Instagram marketing caption from a property record.
 * Only includes lines that have actual data — no placeholder text.
 */
export const buildCaption = (property: PropertyForCaption): string => {
  const lines: string[] = [];

  if (property.business_name) {
    lines.push(`🏢 ${property.business_name}`);
  }

  if (property.property_title) {
    lines.push(`📌 ${property.property_title}`);
  }

  if (property.property_type || property.listing_type) {
    const parts = [property.property_type, property.listing_type].filter(Boolean);
    lines.push(`🏠 ${parts.join(" — For ")}`);
  }

  if (property.budget) {
    lines.push(`💰 ${property.budget}`);
  }

  if (property.address) {
    lines.push(`📍 ${property.address}`);
  }

  if (property.description) {
    // Trim to 200 chars so the caption stays readable
    const desc = property.description.length > 200
      ? property.description.slice(0, 197) + "..."
      : property.description;
    lines.push(`\n${desc}`);
  }

  if (property.contact_phone) {
    lines.push(`\n📞 ${property.contact_phone}`);
  }

  lines.push("\n#RealEstate #Property #Trichy #HomeSale #LandForSale");

  return lines.join("\n");
};

/**
 * Step 1 — Create a media container on Instagram.
 * Returns the `creation_id` to be used in publishMedia().
 *
 * @throws Error with descriptive message on API failure.
 */
export const createMediaContainer = async (
  imageUrl: string,
  caption: string
): Promise<string> => {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const businessId  = process.env.INSTAGRAM_BUSINESS_ID;
  const graphVersion = process.env.META_GRAPH_API_VERSION || "v20.0";

  if (!accessToken || !businessId) {
    throw new Error(
      "Instagram Graph API credentials are not configured. " +
      "Ensure META_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ID are set in .env"
    );
  }

  const url = `https://graph.facebook.com/${graphVersion}/${businessId}/media`;

  console.log(`[Instagram] Step 1 — Creating media container. image_url: ${imageUrl}`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: accessToken,
    }),
  });

  const data: any = await res.json();

  if (!res.ok || !data.id) {
    const detail = JSON.stringify(data.error ?? data);
    throw new Error(`Media container creation failed. Meta response: ${detail}`);
  }

  console.log(`[Instagram] Step 1 ✅ creation_id: ${data.id}`);
  return String(data.id);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Step 2 — Publish the media container to Instagram.
 * Returns the live Instagram post ID.
 *
 * @throws Error with descriptive message on API failure.
 */
export const publishMedia = async (creationId: string): Promise<string> => {
  const accessToken  = process.env.META_ACCESS_TOKEN;
  const businessId   = process.env.INSTAGRAM_BUSINESS_ID;
  const graphVersion = process.env.META_GRAPH_API_VERSION || "v20.0";

  if (!accessToken || !businessId) {
    throw new Error(
      "Instagram Graph API credentials are not configured. " +
      "Ensure META_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ID are set in .env"
    );
  }

  // ── 1. Poll Meta Container Status ──────────────────────────────────────────
  // Meta downloads and processes the image from ImageKit asynchronously.
  // We must wait until status_code becomes "FINISHED" before we publish.
  let attempts = 0;
  const maxAttempts = 10;
  const delayMs = 3000;
  let isFinished = false;

  console.log(`[Instagram] Checking processing status for container ${creationId}...`);

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const statusUrl = `https://graph.facebook.com/${graphVersion}/${creationId}?fields=status_code&access_token=${accessToken}`;
      const statusRes = await fetch(statusUrl);
      const statusData: any = await statusRes.json();

      if (statusRes.ok && statusData.status_code) {
        const code = statusData.status_code;
        console.log(`[Instagram] Container status (attempt ${attempts}/${maxAttempts}): ${code}`);

        if (code === "FINISHED") {
          isFinished = true;
          break;
        } else if (code === "ERROR") {
          throw new Error(`Meta container processing failed: ${JSON.stringify(statusData.error || statusData)}`);
        }
      } else {
        console.log(`[Instagram] Status endpoint returned: ${JSON.stringify(statusData)}`);
      }
    } catch (err: any) {
      console.warn(`[Instagram] Error checking container status: ${err.message}`);
    }

    // Wait before checking status again
    await sleep(delayMs);
  }

  if (!isFinished) {
    console.warn(`[Instagram] Container status check timed out. Proceeding to publish attempt anyway...`);
  }

  // ── 2. Call media_publish with Retries ───────────────────────────────────────
  const url = `https://graph.facebook.com/${graphVersion}/${businessId}/media_publish`;
  let publishAttempts = 0;
  const maxPublishAttempts = 3;

  while (publishAttempts < maxPublishAttempts) {
    publishAttempts++;
    console.log(`[Instagram] Publishing container ${creationId} (attempt ${publishAttempts}/${maxPublishAttempts})...`);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: accessToken,
      }),
    });

    const data: any = await res.json();

    if (res.ok && data.id) {
      console.log(`[Instagram] Step 2 ✅ live post_id: ${data.id}`);
      return String(data.id);
    }

    const errorDetail = data.error || {};
    const subcode = errorDetail.error_subcode;
    const msg = errorDetail.message || "";

    // Subcode 2207027: Media is not ready yet. Let's wait and retry.
    if (subcode === 2207027 && publishAttempts < maxPublishAttempts) {
      console.warn(`[Instagram] Media not ready yet (subcode 2207027). Retrying publish in 4 seconds...`);
      await sleep(4000);
      continue;
    }

    // Any other error or run out of attempts
    const detail = JSON.stringify(data.error ?? data);
    throw new Error(`Media publish failed (creation_id: ${creationId}). Meta response: ${detail}`);
  }

  throw new Error(`Media publish failed after max publish attempts.`);
};

