import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trash2, Search as SearchIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createCategory,
  createLocation,
  deleteCategory,
  deleteLocation,
  getCategories,
  getLocations,
} from "@/lib/adminApi";
import {
  createRealSearch,
  getRealCategories,
  getRealLocations,
  startRealScraper,
} from "@/lib/realApi";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
      meta: [
      { title: "Finder — Scrapehouse Admin" },
      { name: "description", content: "Manage the categories and locations the scraper targets." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Finder — Scrapehouse Admin" },
      { property: "og:description", content: "Manage the categories and locations the scraper targets." },
    ],
  }),
  component: AdminSettings,
});

type Item = { id: string; name: string };

// Preset options shown in the dropdown. Edit this list to match what you
// actually want to be scrape-able — selecting one adds it immediately.
const CATEGORY_PRESETS = [
  "Furniture",
  "Vehicles",
  "Electronics",
  "Real Estate",
  "Fashion",
  "Home & Garden",
  "Jobs",
  "Services",
];

const LOCATION_PRESETS = [
  "Thanjavur",
  "Tanjore",
  "Trichy",
  "Chennai",
  "Madurai",
  "Coimbatore",
  "Kumbakonam",
  "Salem",
  "Erode",
  "Tirunelveli",
  "Vellore",
  "Karur",
  "Bengaluru",
  "Hyderabad",
  "Mumbai",
];

function RunScraperCard() {
  const navigate = useNavigate();
  const [categoryId, setCategoryId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);

  const categories = useQuery({
    queryKey: ["real", "categories"],
    queryFn: getRealCategories,
  });

  const locations = useQuery({
    queryKey: ["real", "locations"],
    queryFn: getRealLocations,
  });

  const handleSearch = async () => {
    if (!categoryId || !locationId) {
      toast.error("Select a category and a location first");
      return;
    }

    setIsRunning(true);
    try {
      const searchRequest = await createRealSearch(Number(categoryId), Number(locationId));
      toast.success("Search created — running scraper, this can take a moment");

      await startRealScraper(searchRequest.id);
      toast.success("Scraper finished");

      navigate({
        to: "/admin/listings",
        search: { searchRequestId: searchRequest.id },
      });
    } catch (error) {
      console.error(error);
      toast.error("Scraper run failed. Check the backend is running on localhost:5000.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="text-base">Run scraper</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger aria-label="Category">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.data?.map((category) => (
                <SelectItem key={category.id} value={String(category.id)}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger aria-label="Location">
              <SelectValue placeholder="Select a location" />
            </SelectTrigger>
            <SelectContent>
              {locations.data?.map((location) => (
                <SelectItem key={location.id} value={String(location.id)}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={handleSearch} disabled={isRunning || !categoryId || !locationId}>
            {isRunning ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Searching…
              </>
            ) : (
              <>
                <SearchIcon className="mr-2 size-4" />
                Search
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Run a live scraper search and then view results on the Listings page.
        </p>
      </CardContent>
    </Card>
  );
}

function ManagerCard({
  title,
  placeholder,
  presets,
  items,
  isLoading,
  onCreate,
  onDelete,
}: {
  title: string;
  placeholder: string;
  presets: string[];
  items: Item[] | undefined;
  isLoading: boolean;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const existingNames = new Set((items ?? []).map((i) => i.name.toLowerCase()));
  const availablePresets = presets.filter((p) => !existingNames.has(p.toLowerCase()));

  const [customText, setCustomText] = useState("");

  const handleSelect = (value: string) => {
    if (!value) return;
    onCreate(value);
  };

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={`Add custom ${title.toLowerCase()} (e.g. Thanjavur)...`}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customText.trim()) {
                e.preventDefault();
                onCreate(customText.trim());
                setCustomText("");
              }
            }}
            className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (customText.trim()) {
                onCreate(customText.trim());
                setCustomText("");
              }
            }}
          >
            Add
          </Button>
        </div>

        <Select onValueChange={handleSelect} value="">
          <SelectTrigger aria-label={placeholder}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {availablePresets.length === 0 && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                All presets already added
              </div>
            )}
            {availablePresets.map((preset) => (
              <SelectItem key={preset} value={preset}>
                {preset}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ul className="divide-y divide-border rounded-md border border-border">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="p-3">
                <Skeleton className="h-5 w-32" />
              </li>
            ))}
          {items?.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">Nothing here yet.</li>
          )}
          {items?.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="truncate text-sm font-medium">{item.name}</span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Delete ${item.name}`}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{item.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes it from future scraping runs. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(item.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AdminSettings() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: getCategories });
  const locations = useQuery({ queryKey: ["admin", "locations"], queryFn: getLocations });

  const addCategory = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      toast.success("Category added");
      invalidate();
    },
  });
  const removeCategory = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      toast.success("Category deleted");
      invalidate();
    },
  });
  const addLocation = useMutation({
    mutationFn: createLocation,
    onSuccess: () => {
      toast.success("Location added");
      invalidate();
    },
  });
  const removeLocation = useMutation({
    mutationFn: deleteLocation,
    onSuccess: () => {
      toast.success("Location deleted");
      invalidate();
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Finder</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control which categories and locations the scraper covers.
        </p>
      </div>

      <RunScraperCard />

      <div className="grid gap-6 lg:grid-cols-2">
        <ManagerCard
          title="Categories"
          placeholder="Select a category to add"
          presets={CATEGORY_PRESETS}
          items={categories.data}
          isLoading={categories.isLoading}
          onCreate={(name) => addCategory.mutate(name)}
          onDelete={(id) => removeCategory.mutate(id)}
        />
        <ManagerCard
          title="Locations"
          placeholder="Select a location to add"
          presets={LOCATION_PRESETS}
          items={locations.data}
          isLoading={locations.isLoading}
          onCreate={(name) => addLocation.mutate(name)}
          onDelete={(id) => removeLocation.mutate(id)}
        />
      </div>
    </div>
  );
}