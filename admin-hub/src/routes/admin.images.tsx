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
import { getAllRealProperties, RealProperty, publishToInstagram, saveInstagramDraft } from "@/lib/realApi";
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
  const [selectedTemplate, setSelectedTemplate] = useState<string>("premium_flyer");
  const [includeImage, setIncludeImage] = useState<boolean>(true);
  const [caption, setCaption] = useState<string>("");
  const [generatedPoster, setGeneratedPoster] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [simulatePublish, setSimulatePublish] = useState<boolean>(false);
  const [customImages, setCustomImages] = useState<string[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [isGeneratingAiImage, setIsGeneratingAiImage] = useState<boolean>(false);

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
        businessName: selectedProperty.business_name || "Instagram Business",
        description: selectedProperty.description || "",
        address: selectedProperty.address || "",
        budget: selectedProperty.budget || "",
        phone: selectedProperty.contact_phone || "",
        instagramUsername: selectedProperty.instagram_username || "",
        category: selectedProperty.property_type || "Real Estate",
        listingType: selectedProperty.listing_type || "Sale",
      });

      // Default to a beautiful, clean modern house stock photo to avoid rendering scraped graphic flyers inside our premium template.
      // The user can still choose to select the scraped flyer from the list below if they want.
      const defaultStockPhoto = "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&h=800&q=80";
      setSelectedImage(defaultStockPhoto);

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

      // Pre-generate AI prompt
      const cat = selectedProperty.property_type || "Real Estate";
      const title = selectedProperty.property_title || "";
      const loc = selectedProperty.address || "";
      setAiPrompt(`High-resolution, professional real estate architectural photography of a ${cat}, ${title}, located in ${loc}, bright sunset lighting, award-winning composition, commercial property marketing photo`);
    }
  }, [selectedProperty]);

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

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = selectedImage;

      // Wrap in Promise to handle image loading
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => {
          console.warn("Failed to load image with CORS. Re-trying without CORS (fallback to color card on taint).");
          // Re-attempt without CORS
          const imgNoCORS = new Image();
          imgNoCORS.src = selectedImage;
          imgNoCORS.onload = () => {
            img.width = imgNoCORS.width;
            img.height = imgNoCORS.height;
            // Substitute the tainted image source
            resolve();
          };
          imgNoCORS.onerror = () => reject(new Error("Failed to load image resource"));
        };
      });

      // 1. Draw Background & Layout based on Templates
      if (selectedTemplate === "full_ai_poster") {
        // Use Gemini Image Generation with the full Creative Director prompt
        toast.loading("Gemini AI is designing your poster (30–60s)...", { id: "poster-gen" });

        const geminiRes = await fetch("http://localhost:5000/api/instagram/generate-poster", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessName: formValues.businessName || "",
            title: formValues.title || "",
            category: formValues.category || "",
            budget: formValues.budget || "",
            address: formValues.address || "",
            phone: formValues.phone || "",
            description: formValues.description || "",
            instagramUsername: formValues.instagramUsername || "",
            listingType: formValues.listingType || "Sale",
          }),
        });

        const geminiData = await geminiRes.json();

        if (!geminiData.success || !geminiData.dataUrl) {
          throw new Error(geminiData.message || "Gemini poster generation failed. Please try again.");
        }

        setGeneratedPoster(geminiData.dataUrl);
        setIsPreviewOpen(true);
        toast.success("AI Poster ready!", { id: "poster-gen" });
        setIsGenerating(false);
        return;

      } else if (selectedTemplate === "premium_flyer") {
        // 1. Premium Dark Blue/Navy Gradient Background
        const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1350);
        bgGrad.addColorStop(0, "#050b1a");
        bgGrad.addColorStop(0.5, "#0b152d");
        bgGrad.addColorStop(1, "#030712");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 1080, 1350);

        // Gold Glowing Outer Border
        ctx.strokeStyle = "#d4af37";
        ctx.lineWidth = 10;
        ctx.strokeRect(30, 30, 1020, 1290);

        // Header Section
        // Logo circle with Gold Crest ring
        ctx.fillStyle = "#1e293b";
        ctx.beginPath();
        ctx.arc(110, 120, 55, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#d4af37";
        ctx.lineWidth = 6;
        ctx.stroke();

        ctx.fillStyle = "#d4af37";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("LOGO", 110, 128);

        // Gold Gradient for Business Name Title
        const titleGrad = ctx.createLinearGradient(190, 0, 700, 0);
        titleGrad.addColorStop(0, "#ffe082");
        titleGrad.addColorStop(0.5, "#d4af37");
        titleGrad.addColorStop(1, "#ffe082");
        
        ctx.fillStyle = titleGrad;
        ctx.font = "black 46px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText((formValues.businessName || "BUSINESS NAME").toUpperCase(), 190, 115);

        ctx.fillStyle = "#a1a1aa";
        ctx.font = "bold 20px sans-serif";
        ctx.fillText("PREMIUM GATED COMMUNITY | QUALITY & TRUST", 190, 150);

        // Header Divider
        ctx.strokeStyle = "rgba(212, 175, 55, 0.4)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(50, 195);
        ctx.lineTo(1030, 195);
        ctx.stroke();

        // 2. Slanted Banner Box
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.moveTo(50, 215);
        ctx.lineTo(1030, 215);
        ctx.lineTo(980, 405);
        ctx.lineTo(50, 405);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "rgba(212, 175, 55, 0.7)";
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("WANT TO OWN A PLACE IN A PRIME LOCATION?", 85, 275);

        // Yellow/Gold Price Badge (3D pill style)
        const priceGrad = ctx.createLinearGradient(85, 0, 480, 0);
        priceGrad.addColorStop(0, "#facc15");
        priceGrad.addColorStop(1, "#eab308");
        ctx.fillStyle = priceGrad;
        ctx.beginPath();
        ctx.roundRect(85, 310, 420, 70, 15);
        ctx.fill();

        ctx.fillStyle = "#7f1d1d"; // Dark red text
        ctx.font = "black 34px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(formValues.budget || "BEST PRICES", 295, 356);

        // Location Info inside the banner
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 22px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`📍 LOCATED IN PRIME NEIGHBORHOOD`, 540, 350);

        // 3. Center Image Frame (Full Width with dual gold borders)
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(60, 445, 960, 520, 20);
        ctx.clip();
        ctx.drawImage(img, 60, 445, 960, 520);
        ctx.restore();

        ctx.strokeStyle = "#d4af37";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.roundRect(60, 445, 960, 520, 20);
        ctx.stroke();

        // 4. Description Box (Stylized Card overlay)
        ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
        ctx.beginPath();
        ctx.roundRect(60, 990, 960, 160, 15);
        ctx.fill();
        ctx.strokeStyle = "rgba(212, 175, 55, 0.4)";
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = "#f4f4f5";
        ctx.font = "italic 26px sans-serif";
        ctx.textAlign = "center";
        wrapText(ctx, formValues.description || "", 540, 1040, 920, 36);

        // Special Offer Banner
        ctx.fillStyle = "#d4af37";
        ctx.beginPath();
        ctx.roundRect(50, 1070, 980, 80, 15);
        ctx.fill();

        ctx.fillStyle = "#0b1329";
        ctx.font = "black 28px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("SPECIAL OFFER: FREE SITE VISIT & IMMEDIATE REGISTRATION!", 540, 1120);

        // Footer
        ctx.strokeStyle = "rgba(212, 175, 55, 0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(50, 1180);
        ctx.lineTo(1030, 1180);
        ctx.stroke();

        // Location Address
        ctx.fillStyle = "#e4e4e7";
        ctx.font = "24px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`📍 ADDRESS: ${formValues.address}`, 50, 1235);

        // Contact
        ctx.fillStyle = "#d4af37";
        ctx.font = "bold 34px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`📞 CALL: ${formValues.phone}`, 1030, 1235);

        if (formValues.instagramUsername) {
          ctx.fillStyle = "#ffffff";
          ctx.font = "24px sans-serif";
          ctx.fillText(`@${formValues.instagramUsername}`, 1030, 1290);
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
        if (formValues.instagramUsername) {
          ctx.fillStyle = "#ffffff";
          ctx.fillText(`@${formValues.instagramUsername}`, 1020, 1290);
        }

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
        if (formValues.instagramUsername) {
          ctx.fillStyle = "#115e59";
          ctx.fillText(`@${formValues.instagramUsername}`, 1000, 1270);
        }

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
        if (formValues.instagramUsername) {
          ctx.fillStyle = "#718096";
          ctx.fillText(`@${formValues.instagramUsername}`, 920, 1225);
        }

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
        if (formValues.instagramUsername) {
          ctx.fillStyle = "#3b82f6";
          ctx.fillText(`@${formValues.instagramUsername}`, 1020, 1275);
        }
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
  const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
    const words = text.split(" ");
    let line = "";
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
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

            {/* 3. Image Selection */}
            <Card>
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-primary" />
                  Select Main Image
                </CardTitle>
                <CardDescription>Select a scraped listing image or upload your own custom photo.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                
                {/* Custom File Upload Widget */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-primary/50 rounded-lg p-5 cursor-pointer hover:bg-muted/30 transition-colors h-full">
                      <div className="flex flex-col items-center gap-1.5 text-center text-xs">
                        <ImageIcon className="h-6 w-6 text-muted-foreground animate-pulse" />
                        <span className="font-semibold text-foreground">Upload Custom Image</span>
                        <span className="text-[10px] text-muted-foreground font-medium">Select a JPEG/PNG photo from your computer</span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleCustomImageUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* AI Image Generator Form */}
                  <div className="border border-border/80 rounded-lg p-4 bg-muted/10 space-y-3 flex flex-col justify-between">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-foreground flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-yellow-500 animate-spin" />
                        AI Image Generator (Flux)
                      </label>
                      <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        rows={3}
                        className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-[10px] shadow-sm resize-none focus:outline-none"
                        placeholder="Describe the property style..."
                      />
                    </div>
                    <Button
                      onClick={handleGenerateAiImage}
                      disabled={isGeneratingAiImage}
                      size="sm"
                      className="w-full text-xs font-semibold gap-1.5 h-8 bg-yellow-500 text-slate-900 hover:bg-yellow-600 border-none"
                    >
                      {isGeneratingAiImage ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Painting...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          Generate AI Image
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Custom Uploaded Images Grid */}
                {customImages.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-foreground">Uploaded Custom Images</h4>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {customImages.map((url, idx) => {
                        const isSelected = selectedImage === url;
                        return (
                          <div
                            key={`custom_${idx}`}
                            onClick={() => {
                              setSelectedImage(url);
                              setGeneratedPoster("");
                            }}
                            className={`aspect-square rounded-md overflow-hidden border-2 cursor-pointer relative transition-all ${
                              isSelected ? "border-primary ring-2 ring-primary/20 scale-95" : "border-border/60 hover:border-muted-foreground/40"
                            }`}
                          >
                            <img src={url} alt="Custom upload" className="w-full h-full object-cover" />
                            <Badge className="absolute top-1 left-1 bg-primary text-primary-foreground text-[8px] font-bold py-0.5 px-1 rounded-sm">Custom</Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}


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
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40"
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
                <div className="w-full max-w-[340px] aspect-[4/5] rounded-lg border border-border shadow-sm overflow-hidden relative select-none">
                  
                  {/* AI GRAPHIC DESIGNER PREVIEW PLACEHOLDER */}
                  {selectedTemplate === "full_ai_poster" && (
                    <div className="w-full h-full bg-gradient-to-b from-[#050b1a] to-[#030712] text-white flex flex-col justify-between p-3 relative font-sans text-[8px] border-4 border-[#d4af37] rounded overflow-hidden select-none">
                      {/* Full-bleed background image with absolute positioning */}
                      {selectedImage && (
                        <img src={selectedImage} alt="AI Background" className="absolute inset-0 w-full h-full object-cover opacity-40 z-0" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-b from-[#050b1a]/95 via-transparent to-[#030712]/95 z-10" />

                      {/* Header */}
                      <div className="flex items-center gap-1.5 border-b border-[#d4af37]/40 pb-1 z-20 relative">
                        <div className="w-6 h-6 rounded-full border-2 border-[#d4af37] bg-slate-800 flex items-center justify-center font-bold text-[6px] text-[#d4af37] shrink-0">LOGO</div>
                        <div className="truncate">
                          <h5 className="font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-400 uppercase text-[9px] leading-none truncate">{formValues.businessName || "BUSINESS NAME"}</h5>
                          <span className="text-[5px] text-zinc-400 uppercase tracking-wide">Premium Gated Community</span>
                        </div>
                      </div>

                      {/* Slanted Banner Box */}
                      <div className="bg-slate-900/90 border border-[#d4af37]/60 p-1.5 rounded relative overflow-hidden my-0.5 z-20">
                        <p className="text-[7px] font-bold text-white uppercase tracking-tight leading-none">WANT TO OWN A PLACE IN A PRIME LOCATION?</p>
                        <div className="flex justify-between items-center mt-1">
                          <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-red-950 font-extrabold text-[8.5px] py-0.5 px-2 rounded uppercase leading-none shadow-sm">{formValues.budget || "BEST PRICES"}</div>
                          <span className="text-[6.5px] text-zinc-300 font-medium">📍 Prime Neighborhood</span>
                        </div>
                      </div>

                      {/* Mid Content space */}
                      <div className="flex-grow z-20" />

                      {/* Description Box Overlay */}
                      <div className="bg-slate-950/90 border border-[#d4af37]/20 p-1.5 rounded my-1.5 text-center z-20 relative">
                        <p className="text-[6.5px] text-zinc-200 italic line-clamp-3 leading-snug font-medium">
                          {formValues.description || "Describe your premium listing highlights here..."}
                        </p>
                      </div>

                      {/* Special Offer */}
                      <div className="bg-[#d4af37] text-[#0b1329] text-center font-black text-[7.5px] py-0.5 rounded uppercase tracking-wide my-0.5 leading-none z-20 relative">
                        Special Offer: Free Site Visit & Immediate Registration!
                      </div>

                      {/* Footer */}
                      <div className="border-t border-[#d4af37]/40 pt-1 flex items-center justify-between text-[7px] text-zinc-300 leading-none z-20 relative">
                        <div className="truncate max-w-[150px]">📍 {formValues.address || "Location"}</div>
                        <div className="font-bold text-[#d4af37] truncate">📞 {formValues.phone || "Call Info"}</div>
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

                      {/* Special Offer */}
                      <div className="bg-[#d4af37] text-[#0b1329] text-center font-black text-[7.5px] py-0.5 rounded uppercase tracking-wide my-0.5 leading-none">
                        Special Offer: Free Site Visit & Immediate Registration!
                      </div>

                      {/* Footer */}
                      <div className="border-t border-[#d4af37]/40 pt-1 flex items-center justify-between text-[7px] text-zinc-300 leading-none">
                        <div className="truncate max-w-[150px]">📍 {formValues.address || "Location"}</div>
                        <div className="font-bold text-[#d4af37] truncate">📞 {formValues.phone || "Call Info"}</div>
                      </div>
                    </div>
                  )}

                  {/* MODERN LIGHT TEMPLATE PREVIEW */}
                  {selectedTemplate === "modern_light" && (
                    <div className="w-full h-full bg-[#faf9f6] flex flex-col justify-between p-3 relative font-sans text-xs">
                      {selectedImage ? (
                        <div className="w-full h-[55%] relative rounded overflow-hidden">
                          <img src={selectedImage} alt="Main select" className="w-full h-full object-cover" />
                          <Badge className="absolute top-2 right-2 bg-emerald-600 border-0 text-white text-[8px] font-bold py-0.5 px-1">{formValues.category.toUpperCase()}</Badge>
                          <Badge className="absolute top-8 right-2 bg-blue-600 border-0 text-white text-[8px] font-bold py-0.5 px-1">FOR {formValues.listingType.toUpperCase()}</Badge>
                        </div>
                      ) : (
                        <div className="w-full h-[55%] bg-muted flex items-center justify-center text-muted-foreground text-[10px]">No image selected</div>
                      )}
                      
                      <div className="flex-1 flex flex-col justify-between pt-2">
                        <div className="space-y-1">
                          <h4 className="font-bold text-slate-800 text-[13px] leading-tight line-clamp-2">{formValues.title || "Property Title"}</h4>
                          <p className="text-[10px] text-slate-600 line-clamp-2 leading-tight">{formValues.description || "Listing Highlights"}</p>
                          <p className="text-emerald-700 font-bold text-sm mt-1">{formValues.budget || "Budget"}</p>
                        </div>

                        <div className="border-t border-slate-200 pt-1.5 flex items-center justify-between text-[9px] text-slate-500">
                          <span className="truncate max-w-[150px]">📍 {formValues.address || "Location"}</span>
                          <span className="font-bold text-slate-800 truncate">📞 {formValues.phone || "Call Info"}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* DARK LUXURY TEMPLATE PREVIEW */}
                  {selectedTemplate === "dark_luxury" && (
                    <div className="w-full h-full bg-[#16161a] border-4 border-[#d4af37] flex flex-col justify-between p-3.5 relative text-xs">
                      {selectedImage ? (
                        <div className="w-full h-[52%] relative rounded overflow-hidden border border-[#d4af37]/30">
                          <img src={selectedImage} alt="Main select" className="w-full h-full object-cover" />
                          <div className="absolute top-2 left-2 bg-[#d4af37] text-[#16161a] text-[8px] font-bold py-0.5 px-1">{formValues.category.toUpperCase()}</div>
                        </div>
                      ) : (
                        <div className="w-full h-[52%] bg-muted flex items-center justify-center text-[10px]">No image selected</div>
                      )}

                      <div className="flex-1 flex flex-col justify-between pt-2 text-[#ffffff]">
                        <div className="space-y-1">
                          <h4 className="font-serif font-bold text-[14px] text-white leading-tight line-clamp-2">{formValues.title || "Property Title"}</h4>
                          <p className="text-[11px] text-[#d4af37] font-bold font-serif">{formValues.budget || "Budget"}</p>
                          <p className="text-[9px] text-zinc-400 italic line-clamp-2 leading-tight">{formValues.description || "Listing Highlights"}</p>
                        </div>

                        <div className="border-t border-[#d4af37]/40 pt-1.5 flex items-center justify-between text-[9px] text-zinc-300">
                          <span className="truncate max-w-[140px]">📍 {formValues.address || "Location"}</span>
                          <span className="font-bold text-white">📞 {formValues.phone || "Call Info"}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BOLD TEAL PREVIEW */}
                  {selectedTemplate === "bold_teal" && (
                    <div className="w-full h-full bg-gradient-to-br from-teal-600 to-teal-800 flex flex-col justify-between p-3.5 relative text-xs">
                      {selectedImage ? (
                        <div className="w-full h-[52%] relative rounded overflow-hidden">
                          <img src={selectedImage} alt="Main select" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-full h-[52%] bg-muted flex items-center justify-center text-[10px]">No image selected</div>
                      )}

                      <div className="flex-grow flex flex-col justify-between pt-2 text-white">
                        <div className="space-y-1">
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
                </div>

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
             <img
               src={generatedPoster}
               alt="High-Res Poster Preview"
               className="max-h-[50vh] object-contain shadow-md rounded border aspect-[4/5]"
             />
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
