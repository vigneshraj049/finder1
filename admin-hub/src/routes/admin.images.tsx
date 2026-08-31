import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Film,
  Image as ImageIcon,
  ExternalLink,
  Layers,
  Share2,
  AlertTriangle,
  Loader2,
  CheckCircle,
  FileText,
  Palette,
  Layout,
  RefreshCw,
  Phone,
  MapPin,
  Tag,
  Info,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getAllRealProperties, RealProperty, publishToInstagram, saveInstagramDraft, API_BASE, BACKEND_URL } from "@/lib/realApi";
import { getPosts } from "@/lib/adminApi";
import { truncate } from "@/lib/format";

type ImagesSearch = {
  listingId?: number | undefined;
};

export const Route = createFileRoute("/admin/images")({
  head: () => ({
    meta: [
      { title: "Poster Creator — Scrapehouse Admin" },
      { name: "description", content: "Create and publish posters for scraped listings." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): ImagesSearch => {
    return {
      listingId: search["listingId"] ? Number(search["listingId"]) : undefined,
    };
  },
  component: AdminImages,
});

interface FormValues {
  title: string;
  businessName: string;
  description: string;
  address: string;
  budget: string;
  phone: string;
  instagramUsername: string;
  category: string;
  listingType: string;
}

const TEMPLATES = [
  { id: "full_ai_poster", name: "AI Graphic Designer (Flux)", desc: "Generates a custom AI background photo and overlays crisp marketing graphics & text sharply on top" },
  { id: "premium_flyer", name: "Marketing Flyer (Image 2 style)", desc: "Professional real estate marketing flyer layout" },
  { id: "modern_light", name: "Modern Minimalist", desc: "Clean white card, high-contrast layout" },
  { id: "dark_luxury", name: "Luxury Gold", desc: "Premium dark theme with gold accents" },
  { id: "bold_teal", name: "Vibrant Cyan", desc: "High-energy gradients and modern bold text" },
  { id: "warm_sunset", name: "Warm Sunset", desc: "Friendly coral-amber marketing style" },
];

interface FlyerFormValues {
  title: string;
  businessName: string;
  description: string;
  address: string;
  budget: string;
  phone: string;
  instagramUsername: string;
  category: string;
  listingType: string;
}

const canvasWrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines?: number
) => {
  const words = text.split(" ");
  let line = "";
  let currentY = y;
  let lineCount = 0;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      lineCount++;
      if (maxLines && lineCount >= maxLines) {
        ctx.fillText(line.trim() + "...", x, currentY);
        return;
      }
      ctx.fillText(line, x, currentY);
      line = words[n] + " ";
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
};

const canvasDrawImageCover = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) => {
  const imgRatio = img.width / img.height;
  const destRatio = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (imgRatio > destRatio) {
    sw = img.height * destRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / destRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
};

const extractFlyerHighlights = (description: string, title: string, designPlan?: any): string[] => {
  if (designPlan?.highlights?.length > 0) return designPlan.highlights;
  const text = `${title} ${description}`.toUpperCase();
  const highlights: string[] = [];
  const sqftMatch = text.match(/(\d[\d,]*)\s*(SQ\.?\s*FT|SQFT|சதுர\s*அடி)/i);
  if (sqftMatch) highlights.push(`${sqftMatch[1]} SQ.FT`);
  const facingMatch = text.match(/(NORTH|SOUTH|EAST|WEST)\s*FACING/i);
  if (facingMatch) highlights.push(facingMatch[0].toUpperCase());
  if (/LAND|PLOT|மனை/i.test(text)) highlights.push("LAND");
  if (/VILLA|HOUSE|வீடு/i.test(text)) highlights.push("HOUSE");
  if (/APARTMENT|FLAT/i.test(text)) highlights.push("APARTMENT");
  return highlights.length > 0 ? highlights : ["PREMIUM PROPERTY"];
};

/** Image 2 style — dark green marketing flyer with photo, yellow headlines, white info card */
const drawImage2MarketingFlyer = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  formValues: FlyerFormValues,
  designPlan: any,
  includeImage: boolean,
  bgImg?: HTMLImageElement | null
) => {
  const cleanText = (str: string) => (str || "").replace(/\*\*/g, "").replace(/^"|"$/g, "").trim();

  const theme = {
    primaryBg: designPlan?.colors?.primaryBg || "#062f21",
    cardBg: designPlan?.colors?.cardBg || "#ffffff",
    textPrimary: designPlan?.colors?.textPrimary || "#ffffff",
    textSecondary: designPlan?.colors?.textSecondary || "#ffe082",
    accentColor: designPlan?.colors?.accentColor || "#facc15",
    borderGold: designPlan?.colors?.borderGold || "#d4af37",
  };

  const highlights = extractFlyerHighlights(formValues.description, formValues.title, designPlan);
  const sizeHighlight = highlights.find(h => /SQ\.?FT|SQFT|சதுர/i.test(h)) || highlights[0] || "PREMIUM PROPERTY";
  const facingHighlight = highlights.find(h => /FACING|SOUTH|NORTH|EAST|WEST/i.test(h)) || "";
  const typeHighlight = highlights.find(h => /LAND|PLOT|HOUSE|VILLA|APARTMENT|மனை/i.test(h)) || formValues.category.toUpperCase();
  const subHeadline = facingHighlight
    ? `${facingHighlight} ${typeHighlight}`.toUpperCase()
    : typeHighlight.toUpperCase();
  const listingLabel = `FOR ${formValues.listingType.toUpperCase()}`;

  // Full background
  ctx.fillStyle = theme.primaryBg;
  ctx.fillRect(0, 0, 1080, 1350);

  // ── HEADER (y: 0–185) ──
  ctx.fillStyle = theme.primaryBg;
  ctx.fillRect(0, 0, 1080, 185);

  // Logo circle
  ctx.fillStyle = theme.primaryBg;
  ctx.beginPath();
  ctx.arc(100, 95, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = theme.borderGold;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = theme.borderGold;
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("LOGO", 100, 102);

  // Business name
  const nameGrad = ctx.createLinearGradient(175, 0, 700, 0);
  nameGrad.addColorStop(0, theme.textSecondary);
  nameGrad.addColorStop(0.5, theme.borderGold);
  nameGrad.addColorStop(1, theme.textSecondary);
  ctx.fillStyle = nameGrad;
  const bizName = (formValues.businessName || "FIND YOUR DREAM").toUpperCase();
  ctx.font = bizName.length > 22 ? "bold 34px sans-serif" : "bold 42px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(bizName, 175, 88);

  ctx.fillStyle = theme.textPrimary;
  ctx.font = "bold 15px sans-serif";
  ctx.fillText("— YOUR DREAM, OUR MISSION —", 175, 122);

  // REAL ESTATE seal (top right)
  ctx.fillStyle = theme.borderGold;
  ctx.beginPath();
  ctx.arc(970, 95, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.primaryBg;
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("REAL", 970, 88);
  ctx.fillText("ESTATE", 970, 106);

  // Gold divider
  ctx.strokeStyle = "rgba(212, 175, 55, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 175);
  ctx.lineTo(1040, 175);
  ctx.stroke();

  // ── PROPERTY PHOTO (y: 195–730) ──
  const photoX = 60, photoY = 195, photoW = 960, photoH = 535;
  const centerImg = bgImg ? bgImg : img;

  if (includeImage && centerImg && centerImg.complete && centerImg.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(photoX, photoY, photoW, photoH, 18);
    ctx.clip();
    canvasDrawImageCover(ctx, centerImg, photoX, photoY, photoW, photoH);
    ctx.restore();
  } else {
    ctx.fillStyle = "#0a3d2b";
    ctx.beginPath();
    ctx.roundRect(photoX, photoY, photoW, photoH, 18);
    ctx.fill();
    ctx.fillStyle = "#4a7c59";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PROPERTY PHOTO", photoX + photoW / 2, photoY + photoH / 2);
  }
  ctx.strokeStyle = theme.borderGold;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(photoX, photoY, photoW, photoH, 18);
  ctx.stroke();

  // ── HEADLINES on green (y: 750–900) ──
  ctx.fillStyle = theme.accentColor;
  ctx.font = "bold 80px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(sizeHighlight.toUpperCase(), 70, 810);

  ctx.fillStyle = theme.textPrimary;
  ctx.font = "bold 42px sans-serif";
  ctx.fillText(subHeadline, 70, 870);

  // Yellow FOR SALE banner (pointed ends)
  const bannerY = 895, bannerH = 58;
  ctx.fillStyle = theme.accentColor;
  ctx.beginPath();
  ctx.moveTo(60, bannerY);
  ctx.lineTo(340, bannerY);
  ctx.lineTo(355, bannerY + bannerH / 2);
  ctx.lineTo(340, bannerY + bannerH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#000000";
  ctx.font = "bold 26px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(listingLabel, 200, bannerY + 38);

  // ── WHITE INFO CARD (y: 975–1185) ──
  const cardX = 60, cardY = 975, cardW = 960, cardH = 210;
  ctx.fillStyle = theme.cardBg;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(212, 175, 55, 0.3)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const infoRows = [
    { icon: "■", label: sizeHighlight.toUpperCase() },
    ...(facingHighlight ? [{ icon: "☀", label: facingHighlight.toUpperCase() }] : []),
    { icon: "📍", label: cleanText(formValues.address) || "Location" },
    { icon: "🏗", label: "Ideal for Residential Construction" },
  ].slice(0, 4);

  infoRows.forEach((row, i) => {
    const rowY = cardY + 52 + i * 42;
    ctx.fillStyle = theme.primaryBg;
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(row.icon, cardX + 30, rowY);
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 24px sans-serif";
    const label = row.label.length > 42 ? row.label.slice(0, 40) + "…" : row.label;
    ctx.fillText(label, cardX + 65, rowY);
  });

  // ── FOOTER (y: 1210–1330) ──
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.roundRect(60, 1210, 960, 110, 12);
  ctx.fill();

  // Contact left
  ctx.fillStyle = theme.accentColor;
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("📞", 85, 1265);
  ctx.fillStyle = theme.textPrimary;
  ctx.font = "bold 14px sans-serif";
  ctx.fillText("CONTACT US", 120, 1248);
  ctx.fillStyle = theme.accentColor;
  ctx.font = "bold 38px sans-serif";
  ctx.fillText(formValues.phone || "Call Now", 120, 1285);

  // Instagram pill right
  const igHandle = formValues.instagramUsername
    ? `@${formValues.instagramUsername}`
    : formValues.businessName;
  const pillW = Math.min(igHandle.length * 14 + 40, 340);
  ctx.fillStyle = theme.borderGold;
  ctx.beginPath();
  ctx.roundRect(1080 - 60 - pillW, 1245, pillW, 44, 22);
  ctx.fill();
  ctx.fillStyle = theme.primaryBg;
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(igHandle, 1080 - 60 - pillW / 2, 1274);
};

function AdminImages() {
  const { listingId } = Route.useSearch();
  const queryClient = useQueryClient();

  const [formValues, setFormValues] = useState<FormValues>({
    title: "",
    businessName: "",
    description: "",
    address: "",
    budget: "",
    phone: "",
    instagramUsername: "",
    category: "Real Estate",
    listingType: "Sale",
  });

  const [selectedImage, setSelectedImage] = useState<string>("https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&h=800&q=80");
  const [hasListingMedia, setHasListingMedia] = useState<boolean>(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("full_ai_poster");
  const includeImage = true;
  const [caption, setCaption] = useState<string>("");
  const [generatedPoster, setGeneratedPoster] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [simulatePublish, setSimulatePublish] = useState<boolean>(false);
  const [customImages, setCustomImages] = useState<string[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [isGeneratingAiImage, setIsGeneratingAiImage] = useState<boolean>(false);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [designPlan, setDesignPlan] = useState<any>(null);
  const [aiBackgroundUrl, setAiBackgroundUrl] = useState<string>("");
  const [activePreviewSlide, setActivePreviewSlide] = useState<number>(2); // 0: Welcome Slide, 1: Original listing image, 2: Generated Flyer Poster
  useEffect(() => {
    if (aiBackgroundUrl && aiBackgroundUrl.startsWith("data:image") && designPlan) {
      handleGeneratePoster();
      setActivePreviewSlide(2); // Automatically display the generated flyer slide once rendered
    }
  }, [aiBackgroundUrl, designPlan]);

  const handleAIAnalysis = async () => {
    if (!selectedProperty) {
      toast.error("No property data loaded to analyze.");
      return;
    }

    setIsAnalyzing(true);
    toast.loading("AI is analyzing listing data & style guidelines...", { id: "ai-analysis" });

    try {
      const listingTitle = selectedProperty.property_title || "";
      const listingDesc = selectedProperty.description || "";
      const listingAddress = selectedProperty.address || "";
      const listingBudget = selectedProperty.budget || "";
      const listingPhone = selectedProperty.contact_phone || "";
      const listingCategory = selectedProperty.property_type || "Real Estate";
      const listingType = selectedProperty.listing_type || "Sale";
      const businessName = selectedProperty.business_name || "Find Your Dream";
      const instagramUsername = selectedProperty.instagram_username || "";

      // Populate form values with exact database details as source of truth
      setFormValues({
        title: listingTitle,
        businessName: businessName,
        description: listingDesc,
        address: listingAddress,
        budget: listingBudget,
        phone: listingPhone,
        instagramUsername: instagramUsername,
        category: listingCategory,
        listingType: listingType,
      });

      // Query the backend generatePoster endpoint to paint the design template
      const res = await fetch(`${API_BASE}/instagram/generate-poster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: listingCategory,
          title: listingTitle,
          address: listingAddress,
          referenceImage: referenceImage || "",
          businessName: businessName,
          phone: listingPhone,
          instagramUsername: instagramUsername,
          budget: listingBudget,
          listingType: listingType,
          description: listingDesc,
        }),
      });

      const data = await res.json();

      if (!data.success || !data.dataUrl) {
        throw new Error(data.message || "Failed to generate AI background design.");
      }

      setDesignPlan(data.designPlan);
      if (data.visualPrompt) setAiPrompt(data.visualPrompt);
      // Update aiBackgroundUrl to update the Live Poster Preview mockup backdrop
      setAiBackgroundUrl(data.dataUrl);
      setSelectedTemplate("full_ai_poster");

      toast.success("AI Analysis Complete! Background visual updated in Live Preview.", { id: "ai-analysis" });
    } catch (err: any) {
      console.error(err);
      toast.error(`AI Analysis failed: ${err.message || err}`, { id: "ai-analysis" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReferenceImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          setReferenceImage(base64);
          setGeneratedPoster(""); // Clear generated poster
          toast.success("Design reference uploaded! AI will analyze its layout and style.");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Canvas ref for drawing the high-res poster
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const propertyQuery = useQuery({
    queryKey: ["real", "all-properties"],
    queryFn: async () => {
      return getAllRealProperties();
    },
    staleTime: 1000 * 60 * 5,
  });

  const postsQuery = useQuery({
    queryKey: ["admin", "posts"],
    queryFn: () => getPosts({ pageSize: 1000 }),
  });

  // Find the selected listing
  const selectedProperty = useMemo(() => {
    if (!listingId || !propertyQuery.data) return null;
    const list = propertyQuery.data as RealProperty[];
    return list.find((p) => p.id === listingId) || null;
  }, [listingId, propertyQuery.data]);

  // Pre-populate form when property loads
  useEffect(() => {
    if (selectedProperty) {
      setFormValues({
        title: selectedProperty.property_title || "",
        businessName: selectedProperty.business_name || "Find Your Dream",
        description: selectedProperty.description || "",
        address: selectedProperty.address || "",
        budget: selectedProperty.budget || "",
        phone: selectedProperty.contact_phone || "",
        instagramUsername: selectedProperty.instagram_username || "",
        category: selectedProperty.property_type || "Real Estate",
        listingType: selectedProperty.listing_type || "Sale",
      });

      // Image priority:
      // 1. instagram_draft_image_url (ImageKit - permanent, never expires)
      // 2. thumbnail_url (may be expired CDN)
      // 3. media_items media_url (may be expired CDN)
      // 4. default stock photo
      const draftImageUrl = selectedProperty.instagram_draft_image_url;
      const cdnImage = selectedProperty.media_items?.find(
        (m: any) => m.media_type !== "reel" && !m.video_url && m.media_url
      )?.media_url || selectedProperty.thumbnail_url;

      const defaultStockPhoto2 = "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&h=800&q=80";

      // If we have a permanent ImageKit URL from a saved draft, use it directly
      if (draftImageUrl && draftImageUrl.startsWith("http")) {
        setSelectedImage(draftImageUrl);
        setHasListingMedia(true);
      } else if (cdnImage) {
        // CDN image may be expired — proxy it through backend and fallback gracefully
        setHasListingMedia(true);
        setSelectedImage(defaultStockPhoto2); // show stock photo while proxying
        fetch(`${API_BASE}/instagram/proxy-image?url=${encodeURIComponent(cdnImage)}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.success && d.dataUrl) {
              setSelectedImage(d.dataUrl);
            } else {
              // CDN URL expired — auto-heal: re-upload to ImageKit in background
              toast.loading("Refreshing listing photo...", { id: "refresh-media" });
              fetch(`${API_BASE}/instagram/refresh-media`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ propertyId: selectedProperty.id }),
              })
                .then((r) => r.json())
                .then((rd) => {
                  if (rd.success && rd.refreshed > 0) {
                    toast.success("Listing photo refreshed! Reloading...", { id: "refresh-media" });
                    // Re-fetch the updated media URL from DB by reloading the query
                    setTimeout(() => window.location.reload(), 1500);
                  } else {
                    toast.dismiss("refresh-media");
                    toast.warning("Original listing photo has expired. Please upload a custom photo below.", { duration: 5000 });
                  }
                })
                .catch(() => {
                  toast.dismiss("refresh-media");
                  toast.warning("Could not refresh listing photo. Please upload a custom photo below.", { duration: 5000 });
                });
            }
          })
          .catch(() => {
            toast.warning("Could not load listing photo. Please upload a custom photo below.", { duration: 5000 });
          });
      } else {
        setHasListingMedia(false);
        setSelectedImage(defaultStockPhoto2);
      }

      const priceText = selectedProperty.budget ? `Price: ${selectedProperty.budget}` : "";
      const phoneText = selectedProperty.contact_phone ? `Contact: ${selectedProperty.contact_phone}` : "";
      const locText = selectedProperty.address ? `📍 Location: ${selectedProperty.address}` : "";
      const hashtags = `#realestate #property #homeforsale #housing #investment #scrapehouse ${selectedProperty.property_type ? `#${selectedProperty.property_type.toLowerCase().replace(/\s+/g, "")}` : ""}`;

      const defaultCaption = `${selectedProperty.property_title || "New Property Available!"}

${selectedProperty.description || ""}

${priceText}
${locText}
${phoneText}

${hashtags}`;

      setCaption(selectedProperty.instagram_draft_caption || defaultCaption);
      setGeneratedPoster(""); // Clear previous generated poster
      setDesignPlan(null); // Clear previous design plan to prevent stale data overlay
      setAiBackgroundUrl(""); // Clear previous AI background url

      // Pre-generate AI prompt
      const cat = selectedProperty.property_type || "Real Estate";
      const title = selectedProperty.property_title || "";
      const loc = selectedProperty.address || "";
      setAiPrompt(`High-resolution, professional real estate architectural photography of a ${cat}, ${title}, located in ${loc}, bright sunset lighting, award-winning composition, commercial property marketing photo`);
    }
  }, [selectedProperty]);

  // Auto-run AI Analysis if query parameter is set (for automated Visual QA testing)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("autoAnalyze") === "true" && selectedProperty && !designPlan && !isAnalyzing) {
      handleAIAnalysis();
    }
  }, [selectedProperty, designPlan, isAnalyzing]);

  // Handle Input Changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  // Handle Custom Image Upload
  const handleCustomImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          setCustomImages((prev) => [base64, ...prev]);
          setSelectedImage(base64);
          setGeneratedPoster(""); // Clear generated poster
          toast.success("Custom image uploaded successfully!");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle AI Image Generation
  const handleGenerateAiImage = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Please enter a prompt for the AI to generate.");
      return;
    }

    setIsGeneratingAiImage(true);
    toast.loading("AI is painting your property image...", { id: "ai-img-gen" });

    try {
      const seed = Math.floor(Math.random() * 1000000);
      const url = `https://image.pollinations.ai/p/${encodeURIComponent(aiPrompt.trim())}?width=1080&height=1350&nologo=true&seed=${seed}&model=flux`;

      // Preload image to verify it loads correctly
      const img = new Image();
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to generate AI image."));
      });

      // Add to customImages so they can re-select it
      setCustomImages((prev) => [url, ...prev]);
      setSelectedImage(url);
      setGeneratedPoster(""); // Reset generated poster
      toast.success("AI Image successfully generated!", { id: "ai-img-gen" });
    } catch (err: any) {
      toast.error("Failed to generate AI image. Please try again.", { id: "ai-img-gen" });
    } finally {
      setIsGeneratingAiImage(false);
    }
  };

  // Re-generate default caption from updated form fields
  const handleRegenerateCaption = () => {
    const priceText = formValues.budget ? `Price: ${formValues.budget}` : "";
    const phoneText = formValues.phone ? `Contact: ${formValues.phone}` : "";
    const locText = formValues.address ? `📍 Location: ${formValues.address}` : "";
    const hashtags = `#realestate #property #homeforsale #housing #investment #scrapehouse ${formValues.category ? `#${formValues.category.toLowerCase().replace(/\s+/g, "")}` : ""}`;

    const newCaption = `${formValues.title || "New Property Available!"}

${formValues.description || ""}

${priceText}
${locText}
${phoneText}

${hashtags}`;

    setCaption(newCaption);
    toast.success("Instagram Caption updated from form values.");
  };

  // High-Resolution 1080x1350px Canvas Generation
  const handleGeneratePoster = async () => {
    if (!selectedImage) {
      toast.error("Please select a listing image first.");
      return;
    }

    setIsGenerating(true);
    toast.loading("Generating high-resolution poster...", { id: "poster-gen" });

    try {
      const canvas = canvasRef.current || document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Could not acquire 2D canvas context");
      }

      // Proxy the listing image if it's a remote URL to bypass CORS and avoid tainted canvas issues
      let imageSrc = selectedImage;
      if (selectedImage && selectedImage.startsWith("http") && !selectedImage.includes("localhost") && !selectedImage.includes("127.0.0.1")) {
        try {
          const proxyRes = await fetch(`${API_BASE}/instagram/proxy-image?url=${encodeURIComponent(selectedImage)}`);
          const proxyData = await proxyRes.json();
          if (proxyData.success && proxyData.dataUrl) {
            imageSrc = proxyData.dataUrl;
          }
        } catch (e) {
          console.warn("Failed to proxy image, drawing directly:", e);
        }
      }

      const img = new Image();
      if (includeImage && imageSrc) {
        img.crossOrigin = "anonymous";
        img.src = imageSrc;

        // Wrap in Promise to handle image loading
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => {
            console.warn("Failed to load image with CORS. Re-trying without CORS.");
            // Re-attempt without CORS
            const imgNoCORS = new Image();
            imgNoCORS.src = imageSrc;
            imgNoCORS.onload = () => {
              img.width = imgNoCORS.width;
              img.height = imgNoCORS.height;
              // Substitute the tainted image source
              resolve();
            };
            imgNoCORS.onerror = () => {
              console.warn("Failed to load image resource entirely. Skipping image overlay.");
              resolve(); // Resolve to prevent crashing poster generation
            };
          };
        });
      }

      // Image 2 style marketing flyer (AI Graphic Designer + Marketing Flyer templates)
      if (selectedTemplate === "full_ai_poster" || selectedTemplate === "premium_flyer") {
        let activeDesignPlan = designPlan;
        let activeAiBackgroundUrl = aiBackgroundUrl;

        if (!activeDesignPlan || (selectedTemplate === "full_ai_poster" && !activeAiBackgroundUrl)) {
          toast.loading("AI is building your complete real estate poster...", { id: "poster-gen" });
          const geminiRes = await fetch(`${API_BASE}/instagram/generate-poster`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              category: formValues.category || "",
              title: formValues.title || "",
              address: formValues.address || "",
              referenceImage: referenceImage || "",
              businessName: formValues.businessName || "",
              phone: formValues.phone || "",
              instagramUsername: formValues.instagramUsername || "",
              budget: formValues.budget || "",
              listingType: formValues.listingType || "",
              description: formValues.description || "",
            }),
          });
          const geminiData = await geminiRes.json();
          if (geminiData.designPlan) {
            activeDesignPlan = geminiData.designPlan;
            setDesignPlan(geminiData.designPlan);
          }
          if (geminiData.visualPrompt) setAiPrompt(geminiData.visualPrompt);
          if (geminiData.dataUrl) {
            activeAiBackgroundUrl = geminiData.dataUrl;
            setAiBackgroundUrl(geminiData.dataUrl);
          }
        }

        let bgImg: HTMLImageElement | null = null;
        if (selectedTemplate === "full_ai_poster" && activeAiBackgroundUrl) {
          bgImg = new Image();
          bgImg.src = activeAiBackgroundUrl;
          await new Promise<void>((resolve) => {
            bgImg!.onload = () => resolve();
            bgImg!.onerror = () => {
              console.warn("Failed to load AI background image.");
              resolve();
            };
          });
        }

        if (selectedTemplate === "full_ai_poster") {
          drawImage2MarketingFlyer(ctx, img, formValues, activeDesignPlan, includeImage, bgImg);
        } else {
          drawImage2MarketingFlyer(ctx, img, formValues, activeDesignPlan, includeImage);
        }
      } else if (selectedTemplate === "dark_luxury") {
        // Dark theme background
        ctx.fillStyle = "#16161a";
        ctx.fillRect(0, 0, 1080, 1350);

        // Draw image in top section (cover style)
        ctx.drawImage(img, 60, 60, 960, 650);

        // Elegant Gold Borders
        ctx.strokeStyle = "#d4af37";
        ctx.lineWidth = 10;
        ctx.strokeRect(30, 30, 1020, 1290);
        ctx.strokeStyle = "#d4af37";
        ctx.lineWidth = 2;
        ctx.strokeRect(45, 45, 990, 1260);

        // Category Badge
        ctx.fillStyle = "#d4af37";
        ctx.fillRect(60, 740, 200, 45);
        ctx.fillStyle = "#16161a";
        ctx.font = "bold 20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText((formValues.category || "REAL ESTATE").toUpperCase(), 160, 770);

        // Title
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.font = "bold 46px Georgia, serif";
        wrapText(ctx, formValues.title, 60, 840, 960, 52);

        // Price
        ctx.fillStyle = "#d4af37";
        ctx.font = "bold 52px Georgia, serif";
        ctx.fillText(formValues.budget || "Price on Request", 60, 980);

        // Listing Type Badge
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(900, 940, 120, 40);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText((formValues.listingType || "SALE").toUpperCase(), 960, 966);

        // Highlights/Description
        ctx.fillStyle = "#a1a1aa";
        ctx.font = "italic 26px sans-serif";
        ctx.textAlign = "left";
        wrapText(ctx, formValues.description, 60, 1040, 960, 34);

        // Location & Promoter Bar (Bottom Gold Accent Line)
        ctx.fillStyle = "#d4af37";
        ctx.fillRect(60, 1190, 960, 2);

        // Location
        ctx.fillStyle = "#e4e4e7";
        ctx.font = "24px sans-serif";
        ctx.fillText(`📍 ${formValues.address || "Trichy"}`, 60, 1240);

        // Contact
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 28px sans-serif";
        ctx.fillText(`📞 Call: ${formValues.phone || "Contact Info"}`, 60, 1290);

        // Promoter Business
        ctx.fillStyle = "#d4af37";
        ctx.font = "24px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`Promoted by: ${formValues.businessName}`, 1020, 1240);

      } else if (selectedTemplate === "bold_teal") {
        // High-energy bold teal gradient background
        const grad = ctx.createLinearGradient(0, 0, 1080, 1350);
        grad.addColorStop(0, "#0d9488");
        grad.addColorStop(1, "#115e59");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1080, 1350);

        // Draw image in top 60% with diagonal/cool border
        ctx.drawImage(img, 50, 50, 980, 680);

        // Category & Listing Type
        ctx.fillStyle = "#facc15"; // bright yellow
        ctx.fillRect(50, 760, 240, 50);
        ctx.fillStyle = "#115e59";
        ctx.font = "bold 22px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(formValues.category.toUpperCase(), 170, 792);

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(830, 760, 200, 50);
        ctx.fillStyle = "#0d9488";
        ctx.font = "bold 22px sans-serif";
        ctx.fillText(`FOR ${formValues.listingType.toUpperCase()}`, 930, 792);

        // Title
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.font = "black 50px sans-serif";
        wrapText(ctx, formValues.title, 50, 870, 980, 58);

        // Highlights/Details
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "26px sans-serif";
        wrapText(ctx, formValues.description, 50, 990, 980, 36);

        // Price
        ctx.fillStyle = "#facc15";
        ctx.font = "bold 56px sans-serif";
        ctx.fillText(formValues.budget || "Price on Request", 50, 1140);

        // Bottom Bar
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(50, 1180, 980, 120);

        // Contact info in Bottom Bar
        ctx.fillStyle = "#115e59";
        ctx.font = "bold 32px sans-serif";
        ctx.fillText(`📞 CALL: ${formValues.phone || "Contact Info"}`, 80, 1250);

        // Promoter Business in Bottom Bar
        ctx.fillStyle = "#0d9488";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(formValues.businessName, 1000, 1230);

      } else if (selectedTemplate === "warm_sunset") {
        // Sunset gradient
        const grad = ctx.createLinearGradient(0, 0, 1080, 1350);
        grad.addColorStop(0, "#ff7e5f");
        grad.addColorStop(1, "#feb47b");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1080, 1350);

        // Draw image in top section with rounded card look
        drawRoundedImage(ctx, img, 80, 80, 920, 600, 30);

        // White card overlay at the bottom half
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.roundRect(80, 720, 920, 550, 30);
        ctx.fill();

        // Title
        ctx.fillStyle = "#2d3748";
        ctx.textAlign = "left";
        ctx.font = "bold 44px sans-serif";
        wrapText(ctx, formValues.title, 120, 790, 840, 52);

        // Badges
        ctx.fillStyle = "#ff7e5f";
        ctx.fillRect(120, 890, 180, 36);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(formValues.category.toUpperCase(), 210, 914);

        ctx.fillStyle = "#319795"; // teal
        ctx.fillRect(320, 890, 180, 36);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(formValues.listingType.toUpperCase(), 410, 914);

        // Description
        ctx.fillStyle = "#718096";
        ctx.font = "24px sans-serif";
        ctx.textAlign = "left";
        wrapText(ctx, formValues.description, 120, 960, 840, 34);

        // Price
        ctx.fillStyle = "#ff7e5f";
        ctx.font = "bold 52px sans-serif";
        ctx.fillText(formValues.budget || "Best Pricing Available", 120, 1100);

        // Location Info
        ctx.fillStyle = "#4a5568";
        ctx.font = "22px sans-serif";
        ctx.fillText(`📍 Location: ${formValues.address}`, 120, 1155);

        // Contact Info
        ctx.fillStyle = "#2d3748";
        ctx.font = "bold 32px sans-serif";
        ctx.fillText(`📞 CALL: ${formValues.phone}`, 120, 1215);

        // Branding
        ctx.fillStyle = "#ff7e5f";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(formValues.businessName, 920, 1190);

      } else {
        // Default Modern Light Minimalist Template
        // White/Light Cream background
        ctx.fillStyle = "#faf9f6";
        ctx.fillRect(0, 0, 1080, 1350);

        // Draw image in top 60% of canvas (cover cropped)
        ctx.drawImage(img, 40, 40, 1000, 720);

        // Accent header stripe
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(40, 760, 1000, 5);

        // Category Tag (Top Right Overlay on Image)
        ctx.fillStyle = "#10b981"; // Emerald
        ctx.fillRect(800, 60, 200, 45);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(formValues.category.toUpperCase(), 900, 88);

        // Listing Type Tag
        ctx.fillStyle = "#3b82f6"; // Blue
        ctx.fillRect(800, 115, 200, 45);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText(`FOR ${formValues.listingType.toUpperCase()}`, 900, 143);

        // Title
        ctx.fillStyle = "#0f172a";
        ctx.textAlign = "left";
        ctx.font = "bold 48px sans-serif";
        wrapText(ctx, formValues.title, 60, 830, 960, 56);

        // Description
        ctx.fillStyle = "#475569";
        ctx.font = "26px sans-serif";
        wrapText(ctx, formValues.description, 60, 950, 960, 36);

        // Budget/Price
        ctx.fillStyle = "#059669"; // Emerald Price
        ctx.font = "bold 56px sans-serif";
        ctx.fillText(formValues.budget || "Contact for Price", 60, 1120);

        // Divider
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(60, 1160);
        ctx.lineTo(1020, 1160);
        ctx.stroke();

        // Location info
        ctx.fillStyle = "#64748b";
        ctx.font = "24px sans-serif";
        ctx.fillText(`📍 ${formValues.address}`, 60, 1220);

        // Contact info
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 32px sans-serif";
        ctx.fillText(`📞 CALL: ${formValues.phone}`, 60, 1285);

        // Promoter branding
        ctx.fillStyle = "#1e293b";
        ctx.font = "bold 26px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(formValues.businessName, 1020, 1220);
      }

      // Convert Canvas to data URL
      const dataUrl = canvas.toDataURL("image/png");
      setGeneratedPoster(dataUrl);
      setIsPreviewOpen(true);
      toast.success("Poster successfully generated!", { id: "poster-gen" });

    } catch (err: any) {
      console.error(err);
      toast.error(`Image generation failed: ${err.message || err}`, { id: "poster-gen" });
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper text-wrap function for canvas
  const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines?: number) => {
    const words = text.split(" ");
    let line = "";
    let currentY = y;
    let lineCount = 0;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        lineCount++;
        if (maxLines && lineCount >= maxLines) {
          ctx.fillText(line.trim() + "...", x, currentY);
          return;
        }
        ctx.fillText(line, x, currentY);
        line = words[n] + " ";
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
  };

  // Helper to draw rounded images
  const drawRoundedImage = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, width: number, height: number, radius: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.clip();
    ctx.drawImage(img, x, y, width, height);
    ctx.restore();
  };

  // Helper to draw rounded images with cover aspect ratio scaling
  const drawImageCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
    const imgRatio = img.width / img.height;
    const destRatio = w / h;
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (imgRatio > destRatio) {
      sw = img.height * destRatio;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / destRatio;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  };

  // Helper to extract property features strictly matching real details
  const extractPropertyFeatures = (description: string, title: string): string[] => {
    const text = `${title} ${description}`.toLowerCase();
    const features: string[] = [];

    if (text.includes("dtcp") || text.includes("டிடிசிபி") || text.includes("approval") || text.includes("அப்ரூவல்")) {
      features.push("DTCP Approved");
    }
    if (text.includes("clear title") || text.includes("பத்திரம்") || text.includes("பட்டா") || text.includes("patta") || text.includes("clear document")) {
      features.push("Clear Documents");
    }
    if (text.includes("prime") || text.includes("அருமையான") || text.includes("முக்கிய") || text.includes("main road")) {
      features.push("Prime Location");
    }
    if (text.includes("road") || text.includes("ரோடு") || text.includes("feet") || text.includes("அடி")) {
      const match = text.match(/(\d+)\s*(feet|foot|adi|அடி)\s*(road|ரோடு)/) || text.match(/(road|ரோடு)\s*(\d+)\s*(feet|foot|adi|அடி)/);
      if (match) {
        features.push(`${match[1]} Ft Road`);
      } else {
        features.push("Wide Road");
      }
    }
    if (text.includes("immediate") || text.includes("உடனடி") || text.includes("ready for registration") || text.includes("பதிவு")) {
      features.push("Immediate Reg.");
    }
    if (text.includes("water") || text.includes("தண்ணீர்") || text.includes("கிணறு") || text.includes("borewell")) {
      features.push("Water Facility");
    }
    if (text.includes("eb") || text.includes("electricity") || text.includes("மின்சாரம்") || text.includes("power")) {
      features.push("Electricity (EB)");
    }
    if (text.includes("gate") || text.includes("gated") || text.includes("கம்பவுண்ட்") || text.includes("compound")) {
      features.push("Gated Community");
    }

    return features.slice(0, 4); // Max 4 features
  };

  // Publish to Instagram Mutation
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProperty) throw new Error("No property selected");
      if (!generatedPoster) throw new Error("Please generate the poster first.");

      return publishToInstagram(
        selectedProperty.id,
        caption,
        generatedPoster,
        simulatePublish
      );
    },
    onSuccess: (data) => {
      toast.success(
        simulatePublish
          ? "Simulation Successful! DB status updated to 'Simulated'."
          : "Successfully published to live Instagram! DB status updated to 'Published'."
      );

      // Invalidate queries so listings page shows new status
      queryClient.invalidateQueries({ queryKey: ["real", "all-properties"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "posts"] });
    },
    onError: (err: any) => {
      const isConfigMissing = err.configMissing === true;
      if (isConfigMissing) {
        toast.error("Instagram Publish Failed: Configuration details are missing in .env.");
      } else {
        toast.error(`Instagram Publish Failed: ${err.message || JSON.stringify(err)}`);
      }
    },
  });

  // Save Draft Mutation
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProperty) throw new Error("No property selected");
      if (!generatedPoster) throw new Error("Please generate the poster first.");

      return saveInstagramDraft(selectedProperty.id, caption, generatedPoster);
    },
    onSuccess: () => {
      toast.success("Draft successfully saved!");
      queryClient.invalidateQueries({ queryKey: ["real", "all-properties"] });
    },
    onError: (err: any) => {
      toast.error(`Failed to save draft: ${err.message || JSON.stringify(err)}`);
    },
  });

  // Filter drafts from all properties in memory
  const drafts = useMemo(() => {
    if (!propertyQuery.data) return [];
    const list = propertyQuery.data as RealProperty[];
    return list.filter((p) => p.instagram_post_status === "Draft");
  }, [propertyQuery.data]);

  // Verify status of currently selected property
  const hasPublished = selectedProperty?.instagram_post_status === "Published";
  const currentStatus = selectedProperty?.instagram_post_status || "Not Posted";
  const errorMessage = selectedProperty?.instagram_error_log || null;

  return (
    <div className="space-y-6">
      {/* Canvas Element kept hidden off-screen */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Instagram Poster Creator</h1>
        <p className="text-sm text-muted-foreground">
          Generate custom 4:5 portrait posters for your property listings and publish them to Instagram.
        </p>
      </div>

      {!listingId ? (
        <div className="space-y-6">
          <Card className="p-8 text-center text-muted-foreground border-dashed">
            <AlertTriangle className="mx-auto h-8 w-8 text-yellow-500 mb-2 opacity-80" />
            <p className="text-sm font-medium text-foreground mb-4">No property listing has been selected.</p>
            <p className="text-xs mb-4">Select a property listing to create a poster.</p>
            <div className="flex justify-center gap-3">
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/all-listings">Browse All Listings</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/listings">Browse Search Results</Link>
              </Button>
            </div>
          </Card>

          {drafts.length > 0 && (
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-500" />
                  Saved Instagram Drafts ({drafts.length})
                </CardTitle>
                <CardDescription>Select a draft listing to review, edit, or publish.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {drafts.map((draft) => (
                    <Card key={draft.id} className="border border-border/80 bg-muted/5 hover:border-amber-500/50 transition-colors">
                      <CardContent className="p-4 flex flex-col justify-between h-full space-y-4">
                        <div className="space-y-2">
                          <Badge className="bg-amber-500 text-slate-900 border-none font-semibold text-[9px] h-5">Draft</Badge>
                          <h4 className="font-bold text-foreground text-sm line-clamp-1">{draft.property_title}</h4>
                          <p className="text-xs text-muted-foreground line-clamp-2">{draft.description}</p>
                          <div className="text-[11px] text-zinc-400 space-y-0.5 pt-1">
                            <div>📍 {draft.address}</div>
                            <div className="text-emerald-600 font-bold">{draft.budget}</div>
                          </div>
                        </div>

                        <Button asChild className="w-full text-xs font-semibold h-8 bg-amber-500 hover:bg-amber-600 text-slate-900 border-none">
                          <Link to="/admin/images" search={{ listingId: draft.id }}>
                            Load & Edit Draft
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : propertyQuery.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full rounded-md" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-[600px] w-full rounded-md" />
            <Skeleton className="h-[600px] w-full rounded-md" />
          </div>
        </div>
      ) : !selectedProperty ? (
        <Card className="p-8 text-center text-muted-foreground">
          <p className="text-sm font-semibold text-destructive mb-2">Listing not found</p>
          <p className="text-xs mb-4">The property listing with ID {listingId} could not be loaded.</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/all-listings">Back to Listings</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* LEFT COLUMN: EDITOR FORM & CAPTION (7 cols) */}
          <div className="lg:col-span-7 space-y-6">

            {/* Editor Action Header */}
            <div className="flex items-center justify-between border-b pb-4 border-border/40">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-foreground">Editing Listing Poster</h3>
                <p className="text-[11px] text-muted-foreground">Adjust text and assets for this draft poster.</p>
              </div>
              <Button asChild variant="outline" size="sm" className="h-8 text-xs font-semibold gap-1">
                <Link to="/admin/images">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Exit Editor
                </Link>
              </Button>
            </div>

            {/* 1. Status Indicator */}
            {hasPublished && (
              <Card className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                <CardContent className="p-4 flex items-start gap-3 text-sm font-medium">
                  <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="font-bold">Published to Instagram</p>
                    <p className="text-xs mt-1">This listing is currently active on Instagram (Post ID: {selectedProperty.instagram_post_id}).</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {currentStatus === "Simulated" && (
              <Card className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300">
                <CardContent className="p-4 flex items-start gap-3 text-sm font-medium">
                  <Info className="h-5 w-5 shrink-0 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-bold">Simulated Post</p>
                    <p className="text-xs mt-1">A mock/simulation was run for this listing. It is not posted live.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {currentStatus === "Draft" && (
              <Card className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <CardContent className="p-4 flex items-start gap-3 text-sm font-medium">
                  <FileText className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-bold">Draft Saved</p>
                    <p className="text-xs mt-1">This poster has been saved as a Draft. You can edit the details and caption below, and post to Instagram when ready.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {currentStatus === "Failed" && errorMessage && (
              <Card className="border-destructive/30 bg-destructive/10 text-destructive">
                <CardContent className="p-4 flex items-start gap-3 text-sm font-medium">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
                  <div>
                    <p className="font-bold">Last Publication Failed</p>
                    <p className="text-xs mt-1 font-mono break-all">{errorMessage}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 2. Poster Fields Editor */}
            <Card>
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Poster Information
                </CardTitle>
                <CardDescription>Customize the text content that appears on the graphic poster.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Property Title</label>
                    <input
                      name="title"
                      value={formValues.title}
                      onChange={handleInputChange}
                      className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Promoter / Business Name</label>
                    <input
                      name="businessName"
                      value={formValues.businessName}
                      onChange={handleInputChange}
                      className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Highlights / Description</label>
                  <textarea
                    name="description"
                    value={formValues.description}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Budget / Price</label>
                    <input
                      name="budget"
                      value={formValues.budget}
                      onChange={handleInputChange}
                      className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Contact Phone</label>
                    <input
                      name="phone"
                      value={formValues.phone}
                      onChange={handleInputChange}
                      className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Instagram Username</label>
                    <input
                      name="instagramUsername"
                      value={formValues.instagramUsername}
                      onChange={handleInputChange}
                      className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                      placeholder="e.g. scrapehouse"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Category</label>
                    <input
                      name="category"
                      value={formValues.category}
                      onChange={handleInputChange}
                      className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Listing Type</label>
                    <select
                      name="listingType"
                      value={formValues.listingType}
                      onChange={handleInputChange}
                      className="w-full h-9 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none"
                    >
                      <option value="Sale">Sale</option>
                      <option value="Rent">Rent</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Location / Address</label>
                  <input
                    name="address"
                    value={formValues.address}
                    onChange={handleInputChange}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  />
                </div>
              </CardContent>
            </Card>

            {/* 3. Image Selection & Reference */}
            <Card>
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-primary" />
                  Select Main Image & Design Style Reference
                </CardTitle>
                <CardDescription>Upload a design style reference, and select/upload a property photo (optional overlay).</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">

                {/* Reference Design Image Upload */}
                <div className="space-y-2 border border-border/80 rounded-lg p-4 bg-amber-500/5 border-amber-500/20">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Palette className="h-3.5 w-3.5 text-amber-500" />
                    Upload Design Reference Image (Optional)
                  </label>
                  <p className="text-[11px] text-muted-foreground">The AI will analyze this reference poster's style, colors, and layout to generate a similar design for your property details.</p>

                  <div className="flex gap-4 items-center mt-2">
                    <label className="flex flex-col items-center justify-center border border-dashed border-border hover:border-amber-500/50 rounded-lg p-3 cursor-pointer hover:bg-muted/30 transition-colors w-32 h-20 shrink-0">
                      <div className="flex flex-col items-center gap-1 text-center text-[10px]">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-foreground">Upload Style</span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleReferenceImageUpload}
                        className="hidden"
                      />
                    </label>

                    {referenceImage ? (
                      <div className="relative w-20 h-20 rounded-md overflow-hidden border border-border group">
                        <img src={referenceImage} alt="Reference" className="w-full h-full object-cover" />
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setReferenceImage(null);
                            setGeneratedPoster("");
                          }}
                          className="absolute inset-0 bg-black/60 text-white flex items-center justify-center text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">No reference image uploaded. Default premium template style will be used.</span>
                    )}
                  </div>
                </div>

              </CardContent>
            </Card>

            {/* 4. Template Selector */}
            <Card>
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Palette className="h-4 w-4 text-primary" />
                  Choose Poster Template
                </CardTitle>
                <CardDescription>Select a graphical style template for the Instagram poster card.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {TEMPLATES.map((tpl) => {
                    const isSelected = selectedTemplate === tpl.id;

                    return (
                      <div
                        key={tpl.id}
                        onClick={() => {
                          setSelectedTemplate(tpl.id);
                          setGeneratedPoster(""); // Clear generated
                        }}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40"
                          }`}
                      >
                        <div className="font-bold text-xs flex items-center gap-1.5">
                          <Layout className={`h-3.5 w-3.5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                          {tpl.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">{tpl.desc}</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* 5. Instagram Caption Area */}
            <Card>
              <CardHeader className="pb-4 border-b border-border/40 flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Instagram Caption
                  </CardTitle>
                  <CardDescription>Write or modify the text caption to be posted alongside the image.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleRegenerateCaption} className="h-7 text-xs gap-1 font-medium">
                  <RefreshCw className="h-3 w-3" />
                  Auto-fill
                </Button>
              </CardHeader>
              <CardContent className="pt-6">
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={6}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm"
                  placeholder="Construct your Instagram caption..."
                />
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN: LIVE PREVIEW & INSTAGRAM PUBLISHING (5 cols) */}
          <div className="lg:col-span-5 space-y-6">

            {/* 1. Live Interactive Preview */}
            <Card className="shadow-lg border-border/80 sticky top-4">
              <CardHeader className="pb-4 border-b border-border/50">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <span>Live Poster Preview (4:5 Ratio)</span>
                  <Badge variant="outline" className="text-[10px] font-normal uppercase">
                    1080 × 1350 px
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 flex flex-col items-center gap-6">

                {/* 4:5 Scaled Card Frame (simulates 1080x1350) */}
                <div className="w-full max-w-[340px] aspect-[4/5] rounded-lg border border-border shadow-sm overflow-hidden relative select-none bg-slate-950 flex items-center justify-center">

                  {activePreviewSlide === 0 ? (
                    <img src={`${BACKEND_URL}/uploads/brand_welcome.png`} alt="Slide 1: Welcome Branding" className="w-full h-full object-cover" />
                  ) : activePreviewSlide === 1 ? (
                    selectedImage ? (
                      <img src={selectedImage} alt="Slide 2: Original Listing Photo" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-zinc-400 text-xs font-semibold">No listing photo available</div>
                    )
                  ) : generatedPoster ? (
                    <img src={generatedPoster} alt="Live Poster Preview" className="w-full h-full object-contain" />
                  ) : (
                    <>
                      {/* AI GRAPHIC DESIGNER PREVIEW PLACEHOLDER */}
                      {selectedTemplate === "full_ai_poster" && (
                        <div className="w-full h-full bg-gradient-to-b from-[#050b1a] to-[#030712] text-white flex flex-col justify-between p-3 relative font-sans text-[8px] border-4 border-[#d4af37] rounded shadow-inner">
                          {/* Header */}
                          <div className="flex items-center gap-1.5 border-b border-[#d4af37]/40 pb-1">
                            <div className="w-6 h-6 rounded-full border-2 border-[#d4af37] bg-slate-800 flex items-center justify-center font-bold text-[6px] text-[#d4af37] shrink-0">LOGO</div>
                            <div className="truncate">
                              <h5 className="font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-400 uppercase text-[9px] leading-none truncate">{formValues.businessName || "BUSINESS NAME"}</h5>
                              <span className="text-[5px] text-zinc-400 uppercase tracking-wide">Premium Gated Community</span>
                            </div>
                          </div>

                          {/* Slanted Banner Box */}
                          <div className="bg-slate-900 border border-[#d4af37]/60 p-1.5 rounded relative overflow-hidden my-0.5 select-none">
                            <p className="text-[7px] font-bold text-white uppercase tracking-tight leading-none">WANT TO OWN A PLACE IN A PRIME LOCATION?</p>
                            <div className="flex justify-between items-center mt-1">
                              <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-red-950 font-extrabold text-[8.5px] py-0.5 px-2 rounded uppercase leading-none shadow-sm">{formValues.budget || "BEST PRICES"}</div>
                              <span className="text-[6.5px] text-zinc-300 font-medium">📍 Prime Neighborhood</span>
                            </div>
                          </div>

                          {/* Mid Content */}
                          <div className="flex flex-col flex-grow justify-between py-1 relative">
                            {/* Image Frame (Full Width with Gold Border) */}
                            <div className="w-full aspect-[16/9] max-h-[110px] rounded overflow-hidden border border-[#d4af37] bg-slate-800 shrink-0 self-center">
                              {aiBackgroundUrl ? (
                                <img src={aiBackgroundUrl} alt="Main" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-[6px] text-zinc-400 gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                  <span>AI image generating...</span>
                                </div>
                              )}
                            </div>

                            {/* Description Box Overlay */}
                            <div className="bg-slate-950/80 border border-[#d4af37]/20 p-1 rounded mt-1.5 text-center">
                              <p className="text-[6.5px] text-zinc-200 italic line-clamp-3 leading-snug font-medium">
                                {formValues.description || "Describe your premium listing highlights here..."}
                              </p>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="border-t border-[#d4af37]/40 pt-1 flex items-center justify-between text-[7px] text-zinc-300 leading-none">
                            <div className="truncate max-w-[150px]">📍 {formValues.address}</div>
                            <div className="font-bold text-[#d4af37] truncate">📞 {formValues.phone}</div>
                          </div>
                        </div>
                      )}

                      {/* PREMIUM FLYER (IMAGE 2 STYLE) PREVIEW */}
                      {selectedTemplate === "premium_flyer" && (
                        <div className="w-full h-full bg-gradient-to-b from-[#050b1a] to-[#030712] text-white flex flex-col justify-between p-3 relative font-sans text-[8px] border-4 border-[#d4af37] rounded shadow-inner">
                          {/* Header */}
                          <div className="flex items-center gap-1.5 border-b border-[#d4af37]/40 pb-1">
                            <div className="w-6 h-6 rounded-full border-2 border-[#d4af37] bg-slate-800 flex items-center justify-center font-bold text-[6px] text-[#d4af37] shrink-0">LOGO</div>
                            <div className="truncate">
                              <h5 className="font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-400 uppercase text-[9px] leading-none truncate">{formValues.businessName || "BUSINESS NAME"}</h5>
                              <span className="text-[5px] text-zinc-400 uppercase tracking-wide">Premium Gated Community</span>
                            </div>
                          </div>

                          {/* Slanted Banner Box */}
                          <div className="bg-slate-900 border border-[#d4af37]/60 p-1.5 rounded relative overflow-hidden my-0.5 select-none">
                            <p className="text-[7px] font-bold text-white uppercase tracking-tight leading-none">WANT TO OWN A PLACE IN A PRIME LOCATION?</p>
                            <div className="flex justify-between items-center mt-1">
                              <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-red-950 font-extrabold text-[8.5px] py-0.5 px-2 rounded uppercase leading-none shadow-sm">{formValues.budget || "BEST PRICES"}</div>
                              <span className="text-[6.5px] text-zinc-300 font-medium">📍 Prime Neighborhood</span>
                            </div>
                          </div>

                          {/* Mid Content */}
                          <div className="flex flex-col flex-grow justify-between py-1 relative">
                            {/* Image Frame (Full Width with Gold Border) */}
                            <div className="w-full aspect-[16/9] max-h-[110px] rounded overflow-hidden border border-[#d4af37] bg-slate-800 shrink-0 self-center">
                              {selectedImage ? (
                                <img src={selectedImage} alt="Main" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[6px] text-zinc-400">No image selected</div>
                              )}
                            </div>

                            {/* Description Box Overlay */}
                            <div className="bg-slate-950/80 border border-[#d4af37]/20 p-1 rounded mt-1.5 text-center">
                              <p className="text-[6.5px] text-zinc-200 italic line-clamp-3 leading-snug font-medium">
                                {formValues.description || "Describe your premium listing highlights here..."}
                              </p>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="border-t border-[#d4af37]/40 pt-1 flex items-center justify-between text-[7px] text-zinc-300 leading-none">
                            <div className="truncate max-w-[150px]">📍 {formValues.address}</div>
                            <div className="font-bold text-[#d4af37] truncate">📞 {formValues.phone}</div>
                          </div>
                        </div>
                      )}

                      {/* MODERN LIGHT PREVIEW */}
                      {selectedTemplate === "modern_light" && (
                        <div className="w-full h-full bg-[#f8fafc] text-slate-800 flex flex-col justify-between p-3 relative font-sans text-[8px] border border-slate-200 shadow-inner">
                          <div className="flex flex-col flex-grow justify-between relative">
                            {/* Title banner */}
                            <div className="shrink-0">
                              <h5 className="font-extrabold text-[10px] text-slate-900 leading-tight line-clamp-2">{formValues.title || "Property Title"}</h5>
                              <span className="text-[6px] font-bold text-slate-500 uppercase tracking-wider">{formValues.category} • FOR {formValues.listingType}</span>
                            </div>

                            {/* Center image frame */}
                            <div className="w-full aspect-[4/3] rounded overflow-hidden border border-slate-200 bg-slate-100 my-1">
                              {selectedImage ? (
                                <img src={selectedImage} alt="Main light" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[6px] text-slate-400">No image selected</div>
                              )}
                            </div>

                            {/* Description brief */}
                            <p className="text-[6.5px] text-slate-600 line-clamp-2 leading-relaxed italic">
                              {formValues.description || "Listing description details..."}
                            </p>
                          </div>

                          {/* Footer Info Box */}
                          <div className="border-t border-slate-200 mt-1.5 pt-1 flex items-center justify-between text-[7.5px] text-slate-700 leading-none font-medium">
                            <span className="truncate max-w-[130px]">📍 {formValues.address}</span>
                            <span className="font-extrabold text-teal-600">{formValues.budget || "View Details"}</span>
                            <span className="font-bold">📞 {formValues.phone}</span>
                          </div>
                        </div>
                      )}

                      {/* DARK LUXURY PREVIEW */}
                      {selectedTemplate === "dark_luxury" && (
                        <div className="w-full h-full bg-slate-950 text-white flex flex-col justify-between p-4 relative font-sans text-[8px] border-2 border-amber-500/20 shadow-2xl">
                          <div className="flex flex-col flex-grow justify-between">
                            {/* Luxury header */}
                            <div className="text-center shrink-0 space-y-0.5 border-b border-amber-500/20 pb-1.5">
                              <h5 className="font-serif tracking-widest text-[#d4af37] text-[10px] font-bold uppercase">{formValues.businessName}</h5>
                              <span className="text-[5px] tracking-wider text-slate-400 uppercase">Luxury Real Estate Portfolio</span>
                            </div>

                            {/* Circle image container frame */}
                            <div className="w-[90px] h-[90px] rounded-full overflow-hidden border-2 border-[#d4af37] bg-slate-900 mx-auto my-1.5 flex items-center justify-center shrink-0">
                              {selectedImage ? (
                                <img src={selectedImage} alt="Luxury visual" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[5px] text-slate-400">No Image</span>
                              )}
                            </div>

                            {/* Title and details */}
                            <div className="text-center space-y-1">
                              <h4 className="font-serif text-[#d4af37] text-[9.5px] leading-tight font-black line-clamp-1 uppercase">{formValues.title}</h4>
                              <p className="text-[6.5px] text-slate-300 line-clamp-2 italic leading-relaxed px-1">
                                {formValues.description}
                              </p>
                            </div>
                          </div>

                          {/* Contact and address footer */}
                          <div className="border-t border-amber-500/20 mt-1.5 pt-1.5 flex items-center justify-between text-[7px] text-slate-400">
                            <span className="truncate max-w-[130px]">📍 {formValues.address}</span>
                            <span className="font-bold text-[#d4af37] text-[8px]">{formValues.budget}</span>
                            <span className="font-bold text-white">📞 {formValues.phone}</span>
                          </div>
                        </div>
                      )}

                      {/* BOLD TEAL PREVIEW */}
                      {selectedTemplate === "bold_teal" && (
                        <div className="w-full h-full bg-teal-950 text-white flex flex-col justify-between p-3.5 relative font-sans text-[8px] border-l-[12px] border-teal-500 shadow-lg">
                          <div className="flex flex-col flex-grow justify-between">
                            <div className="space-y-1 shrink-0">
                              <div className="flex gap-1">
                                <Badge className="bg-yellow-400 text-teal-950 font-bold text-[8px] py-0 px-1 hover:bg-yellow-400">{formValues.category.toUpperCase()}</Badge>
                                <Badge className="bg-white text-teal-800 font-bold text-[8px] py-0 px-1 hover:bg-white">FOR {formValues.listingType.toUpperCase()}</Badge>
                              </div>
                              <h4 className="font-bold text-[13px] leading-tight line-clamp-2">{formValues.title || "Property Title"}</h4>
                              <p className="text-yellow-300 font-extrabold text-[14px]">{formValues.budget || "Budget"}</p>
                            </div>

                            <div className="bg-white rounded p-1.5 flex items-center justify-between text-[9px] text-teal-900 font-bold">
                              <span>📍 {formValues.address || "Location"}</span>
                              <span>📞 {formValues.phone || "Call"}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* WARM SUNSET PREVIEW */}
                      {selectedTemplate === "warm_sunset" && (
                        <div className="w-full h-full bg-gradient-to-br from-orange-400 to-amber-300 flex flex-col justify-between p-4 relative text-xs font-sans">
                          {selectedImage ? (
                            <div className="w-full h-[48%] rounded-lg overflow-hidden border border-orange-500/20">
                              <img src={selectedImage} alt="Main select" className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-full h-[48%] bg-muted flex items-center justify-center text-[10px]">No image selected</div>
                          )}

                          <div className="bg-white rounded-xl p-3 flex-1 mt-2.5 flex flex-col justify-between text-slate-800 shadow-sm border border-orange-500/10">
                            <div className="space-y-1">
                              <h4 className="font-bold text-[12px] leading-tight text-slate-800 line-clamp-2">{formValues.title || "Property Title"}</h4>
                              <div className="flex gap-1">
                                <Badge className="bg-orange-500 hover:bg-orange-500 text-white text-[7px] py-0.2 px-1 rounded">{formValues.category.toUpperCase()}</Badge>
                                <Badge className="bg-[#319795] hover:bg-[#319795] text-white text-[7px] py-0.2 px-1 rounded">{formValues.listingType.toUpperCase()}</Badge>
                              </div>
                            </div>

                            <div className="pt-1.5 border-t border-slate-100 flex flex-col gap-1 text-[9px] text-slate-500">
                              <span className="text-orange-500 font-extrabold text-[12px]">{formValues.budget || "Budget"}</span>
                              <span className="truncate">📍 {formValues.address}</span>
                              <span className="font-bold text-slate-700">📞 Call: {formValues.phone}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Carousel Slides Selectors */}
                <div className="flex flex-col items-center gap-1.5 w-full max-w-[340px] select-none bg-slate-900/40 p-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-black">Carousel Slide Preview</span>
                  <div className="flex gap-2 w-full">
                    <button
                      type="button"
                      onClick={() => setActivePreviewSlide(0)}
                      className={`flex-1 py-1 px-1 text-[9px] font-black rounded uppercase tracking-tighter text-center transition-all ${activePreviewSlide === 0 ? 'bg-[#d4af37] text-slate-950 font-black scale-[1.03] shadow-md' : 'bg-slate-950/80 text-zinc-400 hover:text-white border border-slate-800'}`}
                    >
                      Slide 1: Logo
                    </button>
                    {hasListingMedia && (
                      <button
                        type="button"
                        onClick={() => setActivePreviewSlide(1)}
                        className={`flex-1 py-1 px-1 text-[9px] font-black rounded uppercase tracking-tighter text-center transition-all ${activePreviewSlide === 1 ? 'bg-[#d4af37] text-slate-950 font-black scale-[1.03] shadow-md' : 'bg-slate-950/80 text-zinc-400 hover:text-white border border-slate-800'}`}
                      >
                        Slide 2: Property
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActivePreviewSlide(2)}
                      className={`flex-1 py-1 px-1 text-[9px] font-black rounded uppercase tracking-tighter text-center transition-all ${activePreviewSlide === 2 ? 'bg-[#d4af37] text-slate-950 font-black scale-[1.03] shadow-md' : 'bg-slate-950/80 text-zinc-400 hover:text-white border border-slate-800'}`}
                    >
                      Slide 3: Poster
                    </button>
                  </div>
                </div>

                {/* AI Analysis CTA */}
                <Button
                  onClick={handleAIAnalysis}
                  disabled={isAnalyzing || !selectedProperty}
                  className="w-full max-w-[340px] font-semibold gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-none shadow"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing Listing Data...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 animate-pulse text-yellow-300" />
                      AI Analysis & Design Style
                    </>
                  )}
                </Button>

                {/* Generate Poster CTA */}
                <Button
                  onClick={async () => {
                    await handleGeneratePoster();
                    setIsPreviewOpen(true);
                  }}
                  disabled={isGenerating}
                  className="w-full max-w-[340px] font-semibold gap-1.5"
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Generate Poster
                </Button>

                {/* Real generated high-res preview (shown only when generated) */}
                {generatedPoster ? (
                  <div className="w-full text-center space-y-2 border-t border-border/40 pt-4">
                    <p className="text-xs font-semibold text-emerald-600 flex items-center justify-center gap-1.5">
                      <CheckCircle className="h-4 w-4" />
                      High-Res Poster Ready for Upload!
                    </p>
                    <div className="relative max-w-[200px] mx-auto border rounded shadow-md overflow-hidden aspect-[4/5] bg-black">
                      <img src={generatedPoster} alt="High resolution output" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex justify-center gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setIsPreviewOpen(true)} className="h-8 text-xs font-semibold">
                        View Fullscreen
                      </Button>
                      <Button asChild variant="outline" size="sm" className="h-8 text-xs font-semibold">
                        <a href={generatedPoster} download={`poster_${listingId}.png`}>
                          Download Image
                        </a>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full text-center py-2 text-[10px] text-muted-foreground italic">
                    Click "Generate Poster" above to create the high-resolution image prior to publishing.
                  </div>
                )}

                {/* Publishing Controls */}
                <div className="w-full border-t border-border/40 pt-4 space-y-4">

                  <div className="flex items-center space-x-2 text-xs">
                    <input
                      type="checkbox"
                      id="simulate"
                      checked={simulatePublish}
                      onChange={(e) => setSimulatePublish(e.target.checked)}
                      className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                    />
                    <label htmlFor="simulate" className="font-semibold text-foreground cursor-pointer flex items-center gap-1">
                      Enable Simulation Mode (Local Test)
                      <Badge variant="outline" className="text-[8px] uppercase tracking-wider py-0 px-1 border-blue-500/30 text-blue-500 bg-blue-500/5">Mock</Badge>
                    </label>
                  </div>

                  <div className="flex gap-3 w-full">
                    <Button
                      onClick={() => saveDraftMutation.mutate()}
                      disabled={saveDraftMutation.isPending || !generatedPoster}
                      variant="outline"
                      className="flex-grow font-bold gap-1.5 h-11 border-amber-500/50 hover:bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    >
                      {saveDraftMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4" />
                          Save as Draft
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={() => publishMutation.mutate()}
                      disabled={publishMutation.isPending || !generatedPoster}
                      variant={hasPublished && !simulatePublish ? "secondary" : "default"}
                      className="flex-grow font-bold gap-1.5 h-11"
                    >
                      {publishMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Publishing...
                        </>
                      ) : (
                        <>
                          <Share2 className="h-4 w-4" />
                          {simulatePublish ? "Simulate Post" : "Post to Instagram"}
                        </>
                      )}
                    </Button>
                  </div>

                  {hasPublished && (
                    <div className="text-[10px] text-center text-muted-foreground leading-normal px-2">
                      💡 This listing is already published on Instagram. Re-posting will create a new Instagram post container.
                    </div>
                  )}
                </div>

              </CardContent>
            </Card>

          </div>

        </div>
      )}

      {/* Fullscreen High-Res Poster Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col items-center p-6">
          <DialogHeader className="w-full text-center pb-2 border-b">
            <DialogTitle className="text-base font-bold text-foreground">Generated High-Res Poster</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground">
              Review the final 1080x1350px image format.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-grow overflow-auto w-full flex justify-center py-3 bg-muted/20 rounded-lg border border-border/60 my-4 select-none">
            {generatedPoster ? (
              <img
                src={generatedPoster}
                alt="High-Res Poster Preview"
                className="max-h-[50vh] object-contain shadow-md rounded border aspect-[4/5]"
              />
            ) : (
              <div className="flex items-center justify-center text-xs text-muted-foreground italic h-32">
                No preview generated
              </div>
            )}
          </div>

          <div className="w-full flex gap-3">
            <Button asChild variant="outline" className="flex-grow font-semibold text-xs h-9">
              <a href={generatedPoster} download={`poster_${listingId}.png`}>
                Download Poster
              </a>
            </Button>
            <Button onClick={() => setIsPreviewOpen(false)} className="flex-grow font-semibold text-xs h-9">
              Close Preview
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
