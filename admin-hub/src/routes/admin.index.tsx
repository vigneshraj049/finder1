import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FolderTree, MapPin, Images, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { getDashboardStats, getRecentSearchRequests } from "@/lib/adminApi";
import { formatDate, formatNumber } from "@/lib/format";
import type { SearchRequestStatus } from "@/lib/mockData";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Scrapehouse Admin" },
      { name: "description", content: "Overview of scraping activity and recent search requests." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Dashboard — Scrapehouse Admin" },
      { property: "og:description", content: "Overview of scraping activity and recent search requests." },
    ],
  }),
  component: AdminDashboard,
});

const statusLabel: Record<SearchRequestStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

function AdminDashboard() {
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: getDashboardStats });
  const recent = useQuery({
    queryKey: ["admin", "recent-requests"],
    queryFn: () => getRecentSearchRequests(10),
  });

  const cards = [
    { label: "Total Categories", value: stats.data?.totalCategories, icon: FolderTree },
    { label: "Total Locations", value: stats.data?.totalLocations, icon: MapPin },
    { label: "Total Scraped Posts", value: stats.data?.totalPosts, icon: Images },
    { label: "Total Search Requests", value: stats.data?.totalSearchRequests, icon: Search },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A snapshot of everything the scraper has collected.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
              <card.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {card.value === undefined ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="font-display text-3xl font-semibold text-foreground">
                  {formatNumber(card.value)}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Recent search requests</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={4}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {recent.data?.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.categoryName}</TableCell>
                    <TableCell>{row.locationName}</TableCell>
                    <TableCell>
                      <Badge variant={row.status}>{statusLabel[row.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDate(row.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
