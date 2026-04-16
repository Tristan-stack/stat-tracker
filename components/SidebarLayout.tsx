'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BarChart3, Eye, Layers, LogOut, User, Wallet } from 'lucide-react';
import { useSession, signOut } from '@/lib/auth-client';
import NotificationBell from '@/components/notifications/NotificationBell';

const links = [
  { href: '/', label: 'Stat tracking', icon: BarChart3 },
  { href: '/rugger', label: 'Ruggers', icon: Wallet },
  { href: '/watchlist', label: 'Watchlist', icon: Eye },
  { href: '/wallet-comparison', label: 'Comparaison wallets', icon: Layers },
];

function getInitials(name: string | null | undefined, email: string | undefined): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return (email ?? '??').split('@')[0].slice(0, 2).toUpperCase();
}

function CloseMobileOnNav() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    if (isMobile && pathname !== prevPathRef.current) {
      setOpenMobile(false);
    }
    prevPathRef.current = pathname;
  }, [pathname, isMobile, setOpenMobile]);

  return null;
}

function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const user = session?.user;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="StatTracker">
              <Link href="/">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-semibold">
                  S
                </span>
                <span className="truncate font-semibold">StatTracker</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
                    <SidebarMenuButton asChild isActive={isActive} tooltip={link.label}>
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

      {user && (
        <SidebarFooter className="border-t border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" tooltip={user.name ?? user.email ?? ''}>
                    <Avatar size="default" className="shrink-0">
                      {user.image && <AvatarImage src={user.image} alt={user.name ?? ''} />}
                      <AvatarFallback>{getInitials(user.name, user.email)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {user.name ?? user.email}
                      </p>
                      {user.name && (
                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                      )}
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-medium">{user.name ?? user.email}</p>
                {user.name && (
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/profile')}>
                <User className="mr-2 size-4" />
                Profil
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={async () => {
                  await signOut({
                    fetchOptions: { onSuccess: () => router.push('/sign-in') },
                  });
                  router.refresh();
                }}
              >
                <LogOut className="mr-2 size-4" />
                Déconnexion
              </DropdownMenuItem>
            </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}

export default function SidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen={true}>
      <CloseMobileOnNav />
      <AppSidebar />
      <SidebarInset className="overflow-x-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
          </div>
        </header>
        <div className="min-w-0 flex-1 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
