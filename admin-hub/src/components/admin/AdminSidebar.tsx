import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, List, Settings, ArrowLeft, Radar } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, exact: true },
  { title: "All Listings", url: "/admin/all-listings", icon: List, exact: false },
  { title: "Search Results", url: "/admin/listings", icon: List, exact: false },
  { title: "Finder", url: "/admin/settings", icon: Settings, exact: false },
] as const;

export function AdminSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const isActive = (url: string, exact: boolean) =>
    exact ? pathname === url || pathname === `${url}/` : pathname.startsWith(url);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Radar className="size-4" />
          </span>
          <span className="truncate font-display text-base font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            Scrapehouse
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url, item.exact)}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/" className="flex items-center gap-2">
                    <ArrowLeft className="size-4" />
                    <span>Back to site</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
