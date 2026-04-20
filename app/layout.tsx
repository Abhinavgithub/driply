import type { Metadata } from "next";
import { Space_Grotesk, DM_Sans } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--lp-font-display",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--lp-font-body",
});

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
    <html lang="en" className={`h-full antialiased ${spaceGrotesk.variable} ${dmSans.variable}`} suppressHydrationWarning>
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
