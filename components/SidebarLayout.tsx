'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { IconChartBar, IconWallet } from '@tabler/icons-react';

const links = [
  { href: '/', label: 'Stat tracking', icon: IconChartBar },
  { href: '/rugger', label: 'Ruggers', icon: IconWallet },
];

function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md px-2 py-2 font-semibold"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm">
            S
          </span>
          <span>StatTracker</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {links.map((link) => {
                const isActive =
                  link.href === '/'
                    ? pathname === '/'
                    : pathname === link.href || pathname.startsWith(`${link.href}/`);
                const Icon = link.icon;
                return (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={link.href}>
                        <Icon className="size-4 shrink-0" />
                        <span>{link.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export default function SidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

  return (
    <SidebarProvider
      defaultOpen={true}
      open={isDesktop ? true : undefined}
      onOpenChange={isDesktop ? () => {} : undefined}
    >
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger />
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
