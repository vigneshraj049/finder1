import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Heart, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatPrice, truncate } from "@/lib/format";
import { getFeed } from "@/lib/publicApi";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Scrapehouse — Marketplace listings, collected daily" },
      {
        name: "description",
        content: "Browse fresh marketplace listings gathered across categories and cities.",
      },
      { property: "og:title", content: "Scrapehouse — Marketplace listings, collected daily" },
      {
        property: "og:description",
        content: "Browse fresh marketplace listings gathered across categories and cities.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const feed = useQuery({ queryKey: ["public", "feed"], queryFn: () => getFeed(12) });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <span className="font-display text-lg font-semibold">Scrapehouse</span>
          <Link to="/admin" className="text-sm font-medium text-primary hover:underline">
            Admin
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="max-w-2xl text-4xl font-semibold text-foreground">
          Marketplace listings, collected daily.
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Fresh posts pulled from across categories and cities, with prices and contact details in
          one place.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {feed.isLoading &&
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)}

          {feed.data?.map((post) => (
            <Link key={post.id} to="/posts/$postId" params={{ postId: post.id }}>
              <Card className="h-full overflow-hidden shadow-card transition-shadow hover:shadow-lg">
                <img
                  src={post.thumbnailUrl}
                  alt={truncate(post.caption, 50)}
                  loading="lazy"
                  className="h-44 w-full object-cover"
                />
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{post.categoryName}</Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" />
                      {post.locationName}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{truncate(post.caption, 70)}</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-display text-lg font-semibold">
                      {formatPrice(post.price, post.currency)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Heart className="size-3" />
                      {formatNumber(post.likes)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
