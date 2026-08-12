import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getRealPropertyResults, scoreRealProperties, RealProperty } from "@/lib/realApi";
import { formatDate, truncate } from "@/lib/format";

export const Route = createFileRoute("/admin/listings")({
  head: () => ({
    meta: [
      { title: "Listings — Scrapehouse Admin" },
      { name: "description", content: "View scraped marketplace listings for a search request." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Listings — Scrapehouse Admin" },
      { property: "og:description", content: "View scraped marketplace listings for a search request." },
    ],
  }),
  component: AdminListings,
});

function AdminListings() {
  const [searchRequestId, setSearchRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setSearchRequestId(params.get("searchRequestId"));
  }, []);

  const queryClient = useQueryClient();

  const propertyQuery = useQuery({
    queryKey: ["real", "properties", searchRequestId],
    queryFn: async () => {
      if (!searchRequestId) {
        throw new Error("Missing searchRequestId");
      }
      return getRealPropertyResults(Number(searchRequestId));
    },
    enabled: !!searchRequestId,
    staleTime: 1000 * 60 * 5,
  });

  const scoreMutation = useMutation({
    mutationFn: async () => {
      if (!searchRequestId) {
        throw new Error("Missing searchRequestId");
      }
      try {
        return await scoreRealProperties(Number(searchRequestId));
      } catch (err: any) {
        const txt = String(err?.message || err || "");
        if (txt.includes("Scoring failed: 402") || txt.includes("402")) {
          setScoringDisabled(true);
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["real", "properties", searchRequestId] });
    },
  });

  const [scoringDisabled, setScoringDisabled] = useState(false);

  const results = propertyQuery.data ?? [] as RealProperty[];

  const searchIdDisplay = useMemo(
    () => (searchRequestId ? `Search request ${searchRequestId}` : "No search request selected"),
    [searchRequestId],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Listings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View scraped marketplace posts for a specific search request.
        </p>
      </div>

      <Card className="shadow-card">
        <CardHeader className="flex items-center justify-between gap-4">
          <CardTitle className="text-base">{searchIdDisplay}</CardTitle>
          {!scoringDisabled && (
            <Button
              onClick={() => scoreMutation.mutate()}
              disabled={!searchRequestId || scoreMutation.isLoading || propertyQuery.isLoading}
            >
              {scoreMutation.isLoading ? "Scoring..." : "Run AI Scoring"}
            </Button>
          )}
          {scoringDisabled && (
            <div className="text-sm text-muted-foreground">AI scoring disabled: please add OpenRouter credits.</div>
          )}
        </CardHeader>
        <CardContent>
          {!searchRequestId ? (
            <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
              No `searchRequestId` query parameter was provided. Create a search from the Finder page
              and the scraper will redirect here with `?searchRequestId=...`.
            </div>
          ) : propertyQuery.isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : propertyQuery.isError ? (
            <div className="rounded-md border border-destructive bg-red-50 p-6 text-sm text-destructive">
              Failed to load results for search request {searchRequestId}.
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
              No properties were found for search request {searchRequestId}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>AI Score</TableHead>
                    <TableHead>AI Summary</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((property) => (
                    <TableRow key={property.id}>
                      <TableCell className="max-w-[280px] truncate">
                        {truncate(property.property_title ?? property.description ?? "No title", 80)}
                      </TableCell>
                      <TableCell>{property.property_type ?? "—"}</TableCell>
                      <TableCell>{property.budget ?? "—"}</TableCell>
                      <TableCell>{property.ai_score ?? "—"}</TableCell>
                      <TableCell className="max-w-[320px] truncate">
                        {property.ai_summary ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDate(property.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
