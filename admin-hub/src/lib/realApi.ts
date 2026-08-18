const API_BASE = import.meta.env["VITE_API_URL"]
  ? `${import.meta.env["VITE_API_URL"]}/api`
  : "http://localhost:5000/api";

export interface RealCategory {
  id: number;
  name: string;
}

export interface RealLocation {
  id: number;
  name: string;
}

export interface RealPost {
  id: number;
  instagram_id: string;
  short_code: string;
  caption: string | null;
  hashtags: string[];
  display_url: string | null;
  owner_username: string | null;
  owner_full_name: string | null;
  post_url: string | null;
  likes_count: number;
  timestamp: string;
  phone_number: string | null;
  price_text: string | null;
}

export interface RealMediaItem {
  id: number;
  media_type: "post" | "reel" | string;
  content_type: "image" | "carousel" | "video" | string;
  content_url: string;
  media_url?: string | null;
  video_url?: string | null;
  caption?: string | null;
  likes_count?: number;
  published_at?: string | null;
}

export interface RealProperty {
  id: number;
  property_title: string | null;
  property_type: string | null;
  description: string | null;
  budget: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  ai_score: number | null;
  ai_summary: string | null;
  business_name?: string | null;
  instagram_username?: string | null;
  instagram_profile_url?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  contactNumber?: string | null;
  contactEmail?: string | null;
  media_count?: number;
  reels_count?: number;
  images_count?: number;
  thumbnail_url?: string | null;
  video_url?: string | null;
  reels?: string[];
  media_items?: RealMediaItem[];
  created_at: string;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  const json = await res.json();
  return json.data as T;
}

export const getRealCategories = () =>
  fetch(`${API_BASE}/categories`).then((res) => handle<RealCategory[]>(res));

export const getRealLocations = () =>
  fetch(`${API_BASE}/locations`).then((res) => handle<RealLocation[]>(res));

export const createRealSearch = (categoryId: number, locationId: number) =>
  fetch(`${API_BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId, locationId }),
  }).then((res) =>
    handle<{
      searchRequest: { id: number };
      category: RealCategory;
      location: RealLocation;
    }>(res).then((data) => data.searchRequest),
  );

export const startRealScraper = (searchRequestId: number) =>
  fetch(`${API_BASE}/scraper/start/${searchRequestId}`, {
    method: "POST",
  }).then((res) => {
    if (!res.ok) throw new Error(`Scraper failed: ${res.status}`);
    return res.json();
  });

export const scoreRealProperties = (searchRequestId: number) =>
  fetch(`${API_BASE}/scoring/${searchRequestId}`, {
    method: "POST",
  }).then((res) => {
    if (!res.ok) throw new Error(`Scoring failed: ${res.status}`);
    return res.json();
  });

export const getRealPropertyResults = (searchRequestId: number) =>
  fetch(`${API_BASE}/results/properties/${searchRequestId}`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);

      const json = await res.json();

      return (json.data ?? []).map((item: RealProperty) => ({
        ...item,
        contact_phone: item.contact_phone ?? item.contactNumber ?? "",
        contact_email: item.contact_email ?? item.contactEmail ?? "",
        contactNumber: item.contactNumber ?? item.contact_phone ?? "",
        contactEmail: item.contactEmail ?? item.contact_email ?? "",
      }));
    });

export const getAllRealProperties = () =>
  fetch(`${API_BASE}/results/all-properties`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);

      const json = await res.json();

      return (json.data ?? []).map((item: RealProperty) => ({
        ...item,
        contact_phone: item.contact_phone ?? item.contactNumber ?? "",
        contact_email: item.contact_email ?? item.contactEmail ?? "",
        contactNumber: item.contactNumber ?? item.contact_phone ?? "",
        contactEmail: item.contactEmail ?? item.contact_email ?? "",
      }));
    });

export const getRealResults = (searchRequestId: number) =>
  fetch(`${API_BASE}/results/${searchRequestId}`).then((res) =>
    handle<RealPost[]>(res)
  );