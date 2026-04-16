'use client';

import { usePathname } from 'next/navigation';
import SidebarLayout from '@/components/SidebarLayout';
import { isPublicPagePath } from '@/lib/public-auth-paths';

export default function ConditionalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideSidebar = isPublicPagePath(pathname);

  if (hideSidebar) {
    return <>{children}</>;
  }

  return <SidebarLayout>{children}</SidebarLayout>;
}
