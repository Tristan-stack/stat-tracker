'use client';

import { usePathname } from 'next/navigation';
import SidebarLayout from '@/components/SidebarLayout';
import { isPublicPagePath } from '@/lib/public-auth-paths';
import { QueryProvider } from '@/lib/query/query-provider';

export default function ConditionalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideSidebar = isPublicPagePath(pathname);

  return (
    <QueryProvider>
      {hideSidebar ? children : <SidebarLayout>{children}</SidebarLayout>}
    </QueryProvider>
  );
}
