'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWebSocket } from '../providers/WebSocketProvider';

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Court',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.97Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.97Z" />
      </svg>
    ),
  },
  {
    href: '/agents',
    label: 'Agents',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
  {
    href: '/explorer',
    label: 'Explore',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
      </svg>
    ),
  },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { status } = useWebSocket();

  const statusColor =
    status === 'connected' ? 'var(--vk-green)'
    : status === 'connecting' ? 'var(--vk-yellow)'
    : 'var(--vk-red)';

  const statusLabel =
    status === 'connected' ? 'Live'
    : status === 'connecting' ? '...'
    : 'Off';

  return (
    <>
      {/* Desktop Sidebar */}
      <nav className="vk-sidebar" aria-label="Main navigation">
        <Link href="/" className="vk-sidebar-logo" aria-label="Verdikt home">
          <Image src="/logo-192.png" alt="Verdikt" width={32} height={32} style={{ borderRadius: 6 }} />
        </Link>

        <div className="vk-sidebar-nav">
          {NAV_ITEMS.map(({ href, label, icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`vk-sidebar-link${isActive ? ' active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {icon}
                <span>{label}</span>
              </Link>
            );
          })}
        </div>

        <div className="vk-sidebar-bottom">
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusColor,
                boxShadow: status === 'connected' ? `0 0 10px ${statusColor}` : 'none',
              }}
            />
            <span style={{ fontSize: 9, color: 'var(--vk-text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
              {statusLabel}
            </span>
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Nav */}
      <nav className="vk-mobile-nav" aria-label="Mobile navigation">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`vk-mobile-nav-link${isActive ? ' active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {icon}
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
