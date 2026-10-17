import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";
import { LocaleDocument } from "@/lib/i18n/locale";
export const metadata: Metadata = {
  title: {
    default: "Aster Bank | Everyday banking",
    template: "%s | Aster Bank",
  },
  description:
    "Explore Aster Bank products and services, or sign in to the customer banking demo.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <LocaleDocument />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
