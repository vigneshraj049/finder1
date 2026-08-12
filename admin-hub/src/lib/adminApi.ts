// All admin data access goes through this module.
// Replace each function body with a real API call when the backend is ready.

import {
  categories as seedCategories,
  locations as seedLocations,
  posts as seedPosts,
  searchRequests as seedRequests,
  type Category,
  type Location,
  type ScrapedPost,
  type SearchRequest,
} from "./mockData";

// In-memory stores so create/delete feel real in the UI until the API exists.
let categoryStore: Category[] = [...seedCategories];
let locationStore: Location[] = [...seedLocations];
let postStore: ScrapedPost[] = [...seedPosts];
const requestStore: SearchRequest[] = [...seedRequests];

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export type DashboardStats = {
  totalCategories: number;
  totalLocations: number;
  totalPosts: number;
  totalSearchRequests: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  await delay();
  return {
    totalCategories: categoryStore.length,
    totalLocations: locationStore.length,
    totalPosts: postStore.length,
    totalSearchRequests: requestStore.length,
  };
}

export type SearchRequestRow = SearchRequest & {
  categoryName: string;
  locationName: string;
};

export async function getRecentSearchRequests(limit = 10): Promise<SearchRequestRow[]> {
  await delay();
  return [...requestStore]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((r) => ({
      ...r,
      categoryName: categoryStore.find((c) => c.id === r.categoryId)?.name ?? "Unknown",
      locationName: locationStore.find((l) => l.id === r.locationId)?.name ?? "Unknown",
    }));
}

export type PostsQuery = { search?: string; page?: number; pageSize?: number };
export type PostsPage = { rows: ScrapedPost[]; total: number; page: number; pageSize: number };

export async function getPosts({
  search = "",
  page = 1,
  pageSize = 20,
}: PostsQuery = {}): Promise<PostsPage> {
  await delay();
  const q = search.trim().toLowerCase();
  const filtered = q
    ? postStore.filter(
        (p) =>
          p.caption.toLowerCase().includes(q) || p.ownerUsername.toLowerCase().includes(q),
      )
    : postStore;
  const start = (page - 1) * pageSize;
  return {
    rows: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
  };
}

export async function deletePost(id: string): Promise<void> {
  await delay();
  postStore = postStore.filter((p) => p.id !== id);
}

export async function getCategories(): Promise<Category[]> {
  await delay();
  return [...categoryStore];
}

export async function createCategory(name: string): Promise<Category> {
  await delay();
  const category: Category = {
    id: `c-${Date.now()}`,
    name: name.trim(),
    slug: slugify(name),
    createdAt: new Date().toISOString(),
  };
  categoryStore = [...categoryStore, category];
  return category;
}

export async function deleteCategory(id: string): Promise<void> {
  await delay();
  categoryStore = categoryStore.filter((c) => c.id !== id);
}

export async function getLocations(): Promise<Location[]> {
  await delay();
  return [...locationStore];
}

export async function createLocation(name: string): Promise<Location> {
  await delay();
  const location: Location = {
    id: `l-${Date.now()}`,
    name: name.trim(),
    slug: slugify(name),
    createdAt: new Date().toISOString(),
  };
  locationStore = [...locationStore, location];
  return location;
}

export async function deleteLocation(id: string): Promise<void> {
  await delay();
  locationStore = locationStore.filter((l) => l.id !== id);
}
