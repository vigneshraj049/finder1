// Data access for the public pages. Swap for real API calls later.

import {
  categories,
  locations,
  posts,
  type Category,
  type Location,
  type ScrapedPost,
} from "./mockData";

const delay = (ms = 150) => new Promise((r) => setTimeout(r, ms));

export type PublicPost = ScrapedPost & { categoryName: string; locationName: string };

function decorate(post: ScrapedPost): PublicPost {
  return {
    ...post,
    categoryName: categories.find((c) => c.id === post.categoryId)?.name ?? "Unknown",
    locationName: locations.find((l) => l.id === post.locationId)?.name ?? "Unknown",
  };
}

export async function getFeed(limit = 12): Promise<PublicPost[]> {
  await delay();
  return posts.slice(0, limit).map(decorate);
}

export async function getPost(id: string): Promise<PublicPost | null> {
  await delay();
  const post = posts.find((p) => p.id === id);
  return post ? decorate(post) : null;
}

export async function getPublicCategories(): Promise<Category[]> {
  await delay();
  return categories;
}

export async function getPublicLocations(): Promise<Location[]> {
  await delay();
  return locations;
}
