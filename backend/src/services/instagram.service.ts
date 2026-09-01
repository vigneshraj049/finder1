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
  instagram_username?: string | null;
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
    // Show full description as it is (no truncation)
    lines.push(`\n${property.description}`);
  }

  if (property.contact_phone) {
    lines.push(`\n📞 ${property.contact_phone}`);
  }

  if (property.instagram_username) {
    lines.push(`📱 Source: @${property.instagram_username.replace(/^@/, "")}`);
  }

  lines.push("\n#RealEstate #Property #Trichy #HomeSale #LandForSale");

  return lines.join("\n");
};

/**
 * Create a carousel (sidecar) container on Instagram.
 *
 * 1. Creates an item container for each image URL with is_carousel_item=true.
 * 2. Creates a parent carousel container referencing all item container IDs.
 *
 * Returns the parent container ID.
 */
export const createCarouselContainer = async (
  imageUrls: (string | { url: string; isVideo?: boolean })[],
  caption: string
): Promise<string> => {
  const accessToken  = process.env.META_ACCESS_TOKEN;
  const businessId   = process.env.INSTAGRAM_BUSINESS_ID;
  const graphVersion = process.env.META_GRAPH_API_VERSION || "v20.0";

  if (!accessToken || !businessId) {
    throw new Error(
      "Instagram Graph API credentials are not configured. " +
      "Ensure META_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ID are set in .env"
    );
  }

  // Step 1: Create a container for each image/video
  const childIds: string[] = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const item = imageUrls[i];
    const isVideo = typeof item === "object" ? !!item.isVideo : false;
    const url = typeof item === "object" ? item.url : item;

    console.log(`[Instagram] Creating carousel item container ${i + 1}/${imageUrls.length}: ${url} (isVideo: ${isVideo})`);

    const body: Record<string, any> = {
      is_carousel_item: true,
      access_token: accessToken,
    };

    if (isVideo) {
      body.media_type = "VIDEO";
      body.video_url = url;
    } else {
      body.image_url = url;
    }

    const res = await fetch(`https://graph.facebook.com/${graphVersion}/${businessId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data: any = await res.json();
    if (!res.ok || !data.id) {
      const errDetail = JSON.stringify(data.error || data);
      throw new Error(`Failed to create carousel item ${i + 1}. Meta response: ${errDetail}`);
    }

    const childId = String(data.id);

    // If item is a video, wait until Meta finishes processing it before attaching to parent container
    if (isVideo) {
      console.log(`[Instagram] Waiting for video child container ${childId} processing...`);
      let isReady = false;
      for (let poll = 0; poll < 20; poll++) {
        await sleep(3000);
        try {
          const statusRes = await fetch(`https://graph.facebook.com/${graphVersion}/${childId}?fields=status_code&access_token=${accessToken}`);
          const statusData: any = await statusRes.json();
          const code = statusData.status_code;
          console.log(`[Instagram] Child video container ${childId} status (poll ${poll + 1}/20): ${code}`);
          if (code === "FINISHED") {
            isReady = true;
            break;
          }
          if (code === "ERROR") {
            console.warn(`[Instagram] Child video container ${childId} failed processing.`);
            break;
          }
        } catch (e) {}
      }
      if (!isReady) {
        console.warn(`[Instagram] Child video container ${childId} status poll finished or timed out.`);
      }
    }

    childIds.push(childId);
  }

  // Step 2: Create the parent carousel container
  console.log(`[Instagram] Creating parent carousel container with items: ${childIds.join(", ")}`);
  const parentRes = await fetch(`https://graph.facebook.com/${graphVersion}/${businessId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "CAROUSEL",
      children: childIds,
      caption,
      access_token: accessToken,
    }),
  });

  const parentData: any = await parentRes.json();
  if (!parentRes.ok || !parentData.id) {
    const errDetail = JSON.stringify(parentData.error || parentData);
    throw new Error(`Failed to create parent carousel container. Meta response: ${errDetail}`);
  }

  console.log(`[Instagram] Parent carousel container created successfully ID: ${parentData.id}`);
  return String(parentData.id);
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

/**
 * Create a native Instagram REEL container (media_type = 'REELS').
 */
export const createReelContainer = async (
  videoUrl: string,
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

  console.log(`[Instagram] Creating native Reel container. video_url: ${videoUrl}`);

  const res = await fetch(`https://graph.facebook.com/${graphVersion}/${businessId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      access_token: accessToken,
    }),
  });

  const data: any = await res.json();

  if (!res.ok || !data.id) {
    const detail = JSON.stringify(data.error ?? data);
    throw new Error(`Reel container creation failed. Meta response: ${detail}`);
  }

  console.log(`[Instagram] Reel container created ID: ${data.id}`);
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

