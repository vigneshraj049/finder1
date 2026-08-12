import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Heart, MapPin, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import { getPost } from "@/lib/publicApi";

export const Route = createFileRoute("/posts/$postId")({
  head: () => ({
    meta: [
      { title: "Listing details — Scrapehouse" },
      { name: "description", content: "Price, contact details and stats for this scraped listing." },
      { property: "og:title", content: "Listing details — Scrapehouse" },
      {
        property: "og:description",
        content: "Price, contact details and stats for this scraped listing.",
      },
    ],
  }),
  component: PostDetail,
});

function PostDetail() {
  const { postId } = Route.useParams();
  const post = useQuery({ queryKey: ["public", "post", postId], queryFn: () => getPost(postId) });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-4">
          <Link to="/" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="size-4" />
            Back to listings
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        {post.isLoading && <Skeleton className="h-96 rounded-xl" />}

        {!post.isLoading && !post.data && (
          <p className="text-muted-foreground">This listing is no longer available.</p>
        )}

        {post.data && (
          <Card className="overflow-hidden shadow-card">
            <img
              src={post.data.thumbnailUrl.replace("/160/160", "/1200/700")}
              alt={post.data.caption}
              className="h-72 w-full object-cover sm:h-96"
            />
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{post.data.categoryName}</Badge>
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="size-3.5" />
                  {post.data.locationName}
                </span>
              </div>
              <h1 className="text-2xl font-semibold">{post.data.caption}</h1>
              <p className="font-display text-3xl font-semibold text-primary">
                {formatPrice(post.data.price, post.data.currency)}
              </p>
              <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <span className="flex items-center gap-2">
                  <Phone className="size-4" />
                  {post.data.phone ?? "No phone listed"}
                </span>
                <span className="flex items-center gap-2">
                  <Heart className="size-4" />
                  {formatNumber(post.data.likes)} likes
                </span>
                <span>Posted by @{post.data.ownerUsername}</span>
                <span>Scraped {formatDate(post.data.scrapedAt)}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
