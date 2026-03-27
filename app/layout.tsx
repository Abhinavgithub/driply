import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "driply",
  description: "Daily outfit recommendations from your wardrobe",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var preference = localStorage.getItem('driply-theme-preference') || 'system';
                  var resolved = preference === 'system'
                    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                    : preference;
                  document.documentElement.dataset.theme = preference === 'system' ? '' : preference;
                  document.documentElement.dataset.themePreference = preference;
                  document.documentElement.style.colorScheme = resolved;
                } catch (e) {}
              })();
            `,
          }}
        />
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
