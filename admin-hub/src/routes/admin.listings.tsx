import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Film,
  Image as ImageIcon,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Sparkles,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getRealPropertyResults, scoreRealProperties, RealProperty, RealMediaItem } from "@/lib/realApi";
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
  const [selectedProperty, setSelectedProperty] = useState<RealProperty | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "reels" | "photos">("all");

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

  const results = (propertyQuery.data ?? []) as RealProperty[];


  const filteredMediaItems = useMemo(() => {
    if (!selectedProperty?.media_items) return [];
    if (activeTab === "reels") {
      return selectedProperty.media_items.filter(
        (m) => m.media_type === "reel" || !!m.video_url,
      );
    }
    if (activeTab === "photos") {
      return selectedProperty.media_items.filter(
        (m) => m.media_type !== "reel" && !m.video_url,
      );
    }
    return selectedProperty.media_items;
  }, [selectedProperty, activeTab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Listings & Properties</h1>
        <p className="text-sm text-muted-foreground">
          View aggregated marketplace properties, combined with photos and Instagram reels.
        </p>
      </div>

      <Card className="shadow-card border-border/80">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border/50 pb-4">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base font-semibold">Listings & Properties</CardTitle>
            {results.length > 0 && (
              <Badge variant="outline" className="font-normal text-xs bg-muted/40">
                {results.length} Consolidated {results.length === 1 ? "Listing" : "Listings"}
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* AI Scoring Button removed */}
            {scoringDisabled && (
              <div className="text-xs text-muted-foreground">AI scoring disabled: please add OpenRouter credits.</div>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          {!searchRequestId ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No `searchRequestId` query parameter was provided. Create a search from the Finder page
              and the scraper will redirect here with `?searchRequestId=...`.
            </div>
          ) : propertyQuery.isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : propertyQuery.isError ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
              Failed to load results for search request {searchRequestId}.
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No properties were found for search request {searchRequestId}.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/60">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-[220px]">Title & Business</TableHead>
                    <TableHead className="w-[250px]">Description</TableHead>
                    <TableHead className="w-[180px]">Location / Address</TableHead>
                    <TableHead className="w-[130px]">Budget</TableHead>
                    <TableHead className="w-[180px]">Photos & Reels</TableHead>
                    <TableHead className="w-[200px]">Contact Info</TableHead>
                    <TableHead className="text-right w-[110px]">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((property) => {
                    const reelsCount = property.reels_count || 0;
                    const imagesCount = property.images_count || 0;
                    const totalMedia = property.media_count || (reelsCount + imagesCount) || 0;

                    return (
                      <TableRow key={property.id} className="hover:bg-muted/30 transition-colors">
                        {/* Title & Business Name */}
                        <TableCell className="font-medium align-top py-3.5">
                          <div className="font-semibold text-foreground leading-snug flex flex-wrap items-center gap-1.5">
                            {truncate(property.property_title ?? "No title", 60)}
                            {property.listing_type && (
                              <Badge 
                                className={
                                  property.listing_type === "Rent"
                                    ? "bg-violet-600/15 text-violet-700 dark:text-violet-300 border-violet-500/30 text-[10px] px-1.5 py-0.5 font-semibold shrink-0"
                                    : "bg-blue-600/15 text-blue-700 dark:text-blue-300 border-blue-500/30 text-[10px] px-1.5 py-0.5 font-semibold shrink-0"
                                }
                                variant="outline"
                              >
                                {property.listing_type === "Rent" ? "For Rent" : "For Sale"}
                              </Badge>
                            )}
                          </div>
                          {property.business_name && (
                            <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground font-medium">
                              <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary/50"></span>
                                {property.business_name}
                              </span>
                              {property.instagram_username && (
                                <a
                                  href={`https://www.instagram.com/${property.instagram_username}/`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline inline-flex items-center gap-0.5 pl-2.5"
                                >
                                  @{property.instagram_username}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          )}
                        </TableCell>

                        {/* Description */}
                        <TableCell className="align-top py-3.5">
                          {property.description && property.description !== "NA" ? (
                            <div className="text-xs text-muted-foreground line-clamp-3 leading-relaxed" title={property.description}>
                              {truncate(property.description, 150)}
                            </div>
                          ) : (
                            <span className="text-muted-foreground font-medium text-xs">NA</span>
                          )}
                        </TableCell>

                        {/* Address */}
                        <TableCell className="align-top py-3.5 text-sm max-w-[200px]">
                          {property.address ? (
                            <div className="flex items-start gap-1 text-foreground/90">
                              <MapPin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                              <span className="break-words whitespace-normal">
                                {property.address.replace(/[*_~`]/g, "").trim()}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground font-medium text-xs">NA</span>
                          )}
                        </TableCell>

                        {/* Budget */}
                        <TableCell className="align-top py-3.5">
                          {property.budget ? (
                            <Badge variant="secondary" className="font-medium text-xs bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                              {property.budget}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground font-medium text-xs">NA</span>
                          )}
                        </TableCell>

                        {/* Photos & Reels */}
                        <TableCell className="align-top py-3.5">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {reelsCount > 0 && (
                                <Badge className="bg-purple-600/15 text-purple-700 dark:text-purple-300 border-purple-500/30 gap-1 text-xs px-2 py-0.5 font-medium">
                                  <Film className="h-3 w-3" />
                                  {reelsCount} {reelsCount === 1 ? "Reel" : "Reels"}
                                </Badge>
                              )}
                              {imagesCount > 0 && (
                                <Badge className="bg-blue-600/15 text-blue-700 dark:text-blue-300 border-blue-500/30 gap-1 text-xs px-2 py-0.5 font-medium">
                                  <ImageIcon className="h-3 w-3" />
                                  {imagesCount} {imagesCount === 1 ? "Photo" : "Photos"}
                                </Badge>
                              )}
                              {totalMedia === 0 && (
                                <span className="text-xs text-muted-foreground">No media</span>
                              )}
                            </div>

                            {totalMedia > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedProperty(property);
                                  setActiveTab("all");
                                }}
                                className="h-7 px-2 text-xs text-primary hover:text-primary/80 justify-start -ml-2"
                              >
                                <Layers className="h-3 w-3 mr-1" />
                                View Media ({totalMedia})
                              </Button>
                            )}
                          </div>
                        </TableCell>

                        {/* Contact Information */}
                        <TableCell className="align-top py-3.5 text-xs">
                          <div className="space-y-1.5">
                            {property.contact_phone ? (
                              <a
                                href={`tel:${property.contact_phone}`}
                                className="flex items-center gap-1.5 text-foreground hover:text-primary font-semibold"
                              >
                                <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                {property.contact_phone}
                              </a>
                            ) : null}
                            {property.contact_email && property.contact_email !== "NA" ? (
                              <a
                                href={`mailto:${property.contact_email}`}
                                className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
                              >
                                <Mail className="h-3.5 w-3.5 shrink-0" />
                                {truncate(property.contact_email, 24)}
                              </a>
                            ) : null}
                            {property.website && property.website !== "NA" && property.website !== "" ? (
                              <a
                                href={property.website.startsWith("http") ? property.website : `https://${property.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
                              >
                                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                {truncate(property.website, 24)}
                              </a>
                            ) : null}
                            {!property.contact_phone && (!property.contact_email || property.contact_email === "NA") && (!property.website || property.website === "NA" || property.website === "") && (
                              <span className="text-muted-foreground font-medium">NA</span>
                            )}
                          </div>
                        </TableCell>

                        {/* Created Date */}
                        <TableCell className="text-right text-xs text-muted-foreground align-top py-3.5 whitespace-nowrap">
                          {formatDate(property.created_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Media & Reels Preview Modal */}
      <Dialog open={!!selectedProperty} onOpenChange={(open) => !open && setSelectedProperty(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedProperty && (
            <div className="space-y-5">
              <DialogHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <DialogTitle className="text-lg font-bold text-foreground">
                      {selectedProperty.property_title || "Property Media & Reels"}
                    </DialogTitle>
                    <DialogDescription className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                      {selectedProperty.address && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="h-3 w-3 text-primary" />
                          {selectedProperty.address}
                        </span>
                      )}
                      {selectedProperty.budget && (
                        <Badge variant="secondary" className="font-semibold text-xs bg-emerald-500/10 text-emerald-600">
                          {selectedProperty.budget}
                        </Badge>
                      )}
                      {selectedProperty.contact_phone && (
                        <span className="flex items-center gap-1 font-medium text-foreground">
                          <Phone className="h-3 w-3" />
                          {selectedProperty.contact_phone}
                        </span>
                      )}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Filter Tabs */}
              <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                <Button
                  variant={activeTab === "all" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("all")}
                  className="h-8 text-xs gap-1.5"
                >
                  <Layers className="h-3.5 w-3.5" />
                  All ({selectedProperty.media_items?.length || 0})
                </Button>
                <Button
                  variant={activeTab === "reels" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("reels")}
                  className="h-8 text-xs gap-1.5"
                >
                  <Film className="h-3.5 w-3.5" />
                  Reels ({selectedProperty.reels_count || 0})
                </Button>
                <Button
                  variant={activeTab === "photos" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("photos")}
                  className="h-8 text-xs gap-1.5"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  Photos ({selectedProperty.images_count || 0})
                </Button>
              </div>

              {/* Media Items Gallery */}
              {filteredMediaItems.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No media items available in this category.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredMediaItems.map((item: RealMediaItem, index: number) => {
                    const isReel = item.media_type === "reel" || !!item.video_url;

                    return (
                      <div
                        key={item.id || index}
                        className="rounded-lg border border-border/70 overflow-hidden bg-card flex flex-col justify-between shadow-sm"
                      >
                        <div className="relative bg-black/90 aspect-[4/3] flex items-center justify-center overflow-hidden">
                          {isReel && item.video_url ? (
                            <video
                              controls
                              playsInline
                              preload="metadata"
                              poster={item.media_url || undefined}
                              src={item.video_url}
                              className="w-full h-full object-contain max-h-[300px]"
                            />
                          ) : item.media_url ? (
                            <img
                              src={item.media_url}
                              alt={item.caption || "Property Photo"}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <ImageIcon className="h-8 w-8 opacity-40" />
                              <span className="text-xs">No media preview available</span>
                            </div>
                          )}

                          {/* Media Type Badge Overlay */}
                          <div className="absolute top-2 left-2">
                            {isReel ? (
                              <Badge className="bg-purple-600 text-white font-medium text-[10px] px-1.5 py-0.5 gap-1">
                                <Film className="h-2.5 w-2.5" />
                                Instagram Reel
                              </Badge>
                            ) : (
                              <Badge className="bg-black/70 text-white font-medium text-[10px] px-1.5 py-0.5 gap-1">
                                <ImageIcon className="h-2.5 w-2.5" />
                                {item.content_type === "carousel" ? "Carousel" : "Photo"}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                          {item.caption && (
                            <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                              {item.caption}
                            </p>
                          )}

                          <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                            <span>{item.published_at ? formatDate(item.published_at) : "Instagram Post"}</span>
                            {item.content_url && (
                              <a
                                href={item.content_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
                              >
                                View on Instagram
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
