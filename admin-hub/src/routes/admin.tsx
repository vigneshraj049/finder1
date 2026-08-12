import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Scrapehouse" },
      { name: "description", content: "Manage scraped listings, categories and locations." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Admin — Scrapehouse" },
      { property: "og:description", content: "Manage scraped listings, categories and locations." },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center gap-2 border-b border-border bg-card px-4">
            <SidebarTrigger />
            <span className="font-display text-sm font-semibold text-foreground">Admin</span>
          </header>
          <main className="min-w-0 flex-1 p-4 md:p-8">
            <Outlet />
          </main>
        </div>
      </div>
      <Toaster />
    </SidebarProvider>
  );
}
