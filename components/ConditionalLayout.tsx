'use client';

import { usePathname } from 'next/navigation';
import SidebarLayout from '@/components/SidebarLayout';

const NO_SIDEBAR_PATHS = ['/sign-in', '/sign-up', '/401', '/403', '/404', '/405'];

export default function ConditionalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideSidebar = NO_SIDEBAR_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (hideSidebar) {
    return <>{children}</>;
  }

  return <SidebarLayout>{children}</SidebarLayout>;
}
