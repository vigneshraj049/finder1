import { extractPhoneNumber, extractPrice } from "../utils/extractInfo";

export type NormalizedScrapedPost = {
  businessName: string | null;
  propertyTitle: string | null;
  propertyType: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  budget: string | null;
  latitude: number | null;
  longitude: number | null;
  instagramPageName: string | null;
  instagramPageId: string | null;
  instagramProfileUrl: string | null;
  postUrl: string | null;
  contentType: string | null;
  hashtags: string[];
  source: string;
  scrapedAt: string;
};

export const normalizeScrapedPost = (raw: any): NormalizedScrapedPost => {
  const caption = typeof raw.caption === "string" ? raw.caption : null;
  const hashtags = normalizeHashtags(raw.hashtags);
  const ownerUsername = raw.ownerUsername ?? raw.owner_username ?? null;
  const ownerFullName = raw.ownerFullName ?? raw.owner_full_name ?? null;
  const instagramPageId = raw.ownerId ?? raw.owner_id ?? null;
  const instagramProfileUrl = raw.ownerProfileUrl ?? raw.owner_profile_url ?? null;
  const postUrl = raw.url ?? raw.postUrl ?? raw.post_url ?? null;
  const scrapedAt = raw.timestamp ? new Date(raw.timestamp).toISOString() : new Date().toISOString();

  return {
    businessName: ownerFullName || ownerUsername || raw.owner_username || raw.ownerUsername || raw.owner_full_name || raw.ownerFullName || raw.id || "Instagram Business",
    propertyTitle: caption ? caption.trim().split("\n")[0].slice(0, 120) : null,
    propertyType: "Instagram Listing",
    description: caption,
    phone: caption ? extractPhoneNumber(caption) : null,
    email: null,
    address: null,
    budget: caption ? extractPrice(caption) : null,
    latitude: null,
    longitude: null,
    instagramPageName: ownerUsername,
    instagramPageId,
    instagramProfileUrl,
    postUrl,
    contentType: raw.type ?? raw.contentType ?? "INSTAGRAM_POST",
    hashtags,
    source: "APIFY",
    scrapedAt,
  };
};

const normalizeHashtags = (raw: any): string[] => {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string");
  }

  if (typeof raw === "string") {
    return raw
      .split(/[,\s]+/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  return [];
};
