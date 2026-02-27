'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-mobile';
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
  SidebarTrigger,
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
import { IconChartBar, IconLogout, IconUser, IconWallet } from '@tabler/icons-react';
import { useSession, signOut } from '@/lib/auth-client';

const links = [
  { href: '/', label: 'Stat tracking', icon: IconChartBar },
  { href: '/rugger', label: 'Ruggers', icon: IconWallet },
];

function getInitials(name: string | null | undefined, email: string | undefined): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return (email ?? '??').split('@')[0].slice(0, 2).toUpperCase();
}

function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const user = session?.user;

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

      {user && (
        <SidebarFooter className="border-t border-sidebar-border p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <Avatar size="default">
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
              </button>
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
                <IconUser className="mr-2 size-4" />
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
                <IconLogout className="mr-2 size-4" />
                Déconnexion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      )}
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
