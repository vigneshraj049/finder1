// Shared data shapes used by both the public pages and the admin section.
// Swap these mocks for real API responses later.

export type Category = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type Location = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type ScrapedPost = {
  id: string;
  thumbnailUrl: string;
  caption: string;
  price: number | null;
  currency: string;
  phone: string | null;
  ownerUsername: string;
  likes: number;
  categoryId: string;
  locationId: string;
  scrapedAt: string;
};

export type SearchRequestStatus = "pending" | "running" | "completed" | "failed";

export type SearchRequest = {
  id: string;
  categoryId: string;
  locationId: string;
  status: SearchRequestStatus;
  createdAt: string;
};

export const categories: Category[] = [
  { id: "c1", name: "Furniture", slug: "furniture", createdAt: "2026-01-12T09:00:00Z" },
  { id: "c2", name: "Vehicles", slug: "vehicles", createdAt: "2026-01-18T09:00:00Z" },
  { id: "c3", name: "Electronics", slug: "electronics", createdAt: "2026-02-02T09:00:00Z" },
  { id: "c4", name: "Real Estate", slug: "real-estate", createdAt: "2026-02-20T09:00:00Z" },
  { id: "c5", name: "Fashion", slug: "fashion", createdAt: "2026-03-05T09:00:00Z" },
  { id: "c6", name: "Home & Garden", slug: "home-garden", createdAt: "2026-03-27T09:00:00Z" },
];

export const locations: Location[] = [
  { id: "l1", name: "Mumbai", slug: "mumbai", createdAt: "2026-01-10T09:00:00Z" },
  { id: "l2", name: "Bengaluru", slug: "bengaluru", createdAt: "2026-01-11T09:00:00Z" },
  { id: "l3", name: "Delhi NCR", slug: "delhi-ncr", createdAt: "2026-01-22T09:00:00Z" },
  { id: "l4", name: "Pune", slug: "pune", createdAt: "2026-02-14T09:00:00Z" },
  { id: "l5", name: "Hyderabad", slug: "hyderabad", createdAt: "2026-03-01T09:00:00Z" },
];

const captions = [
  "Solid teak dining table, seats six, barely used and in great condition",
  "2019 Royal Enfield Classic 350, single owner, full service history available",
  "MacBook Air M2 16GB with original box, charger and AppleCare until 2027",
  "2BHK sea facing apartment for rent, fully furnished with modular kitchen",
  "Vintage denim jacket, size M, washed once, shipping across the country",
  "Handmade ceramic planters set of four, glazed matte finish, indoor safe",
  "Ergonomic mesh office chair with lumbar support and adjustable armrests",
  "Sony A7 III body with two batteries and a 50mm prime lens, mint condition",
  "Compact washing machine 6.5kg, front load, moving out sale this weekend",
  "Custom oak bookshelf, 6ft tall, dowel joinery, can deliver within the city",
  "Bicycle with hydraulic disc brakes, recently serviced, new tyres fitted",
  "Studio apartment near the metro, ready to move, includes parking spot",
];

function seededImage(i: number) {
  return `https://picsum.photos/seed/listing-${i}/160/160`;
}

export let posts: ScrapedPost[] = Array.from({ length: 84 }, (_, i) => {
  const caption = captions[i % captions.length]!;
  return {
    id: `p${i + 1}`,
    thumbnailUrl: seededImage(i + 1),
    caption: `${caption}${i % 3 === 0 ? " — price negotiable" : ""}`,
    price: i % 7 === 0 ? null : 1500 + ((i * 3371) % 84000),
    currency: "INR",
    phone: i % 5 === 0 ? null : `+91 9${String(800000000 + i * 137911).slice(0, 9)}`,
    ownerUsername: ["urban_finds", "casa.market", "gearhead_88", "the.thrift.co", "cityresale"][i % 5]!,
    likes: (i * 47) % 1900,
    categoryId: categories[i % categories.length]!.id,
    locationId: locations[i % locations.length]!.id,
    scrapedAt: new Date(Date.UTC(2026, 6, 1 + (i % 40), 8 + (i % 12), (i * 7) % 60)).toISOString(),
  };
});

const statuses: SearchRequestStatus[] = ["pending", "running", "completed", "failed"];

export const searchRequests: SearchRequest[] = Array.from({ length: 26 }, (_, i) => ({
  id: `s${i + 1}`,
  categoryId: categories[(i * 2) % categories.length]!.id,
  locationId: locations[(i * 3) % locations.length]!.id,
  status: statuses[i % statuses.length]!,
  createdAt: new Date(Date.UTC(2026, 7, 1 + (i % 11), 6 + (i % 14), (i * 13) % 60)).toISOString(),
}));

export function addMockPost(post: ScrapedPost) {
  posts = [post, ...posts];
}

export function removeMockPost(id: string) {
  posts = posts.filter((p) => p.id !== id);
}
