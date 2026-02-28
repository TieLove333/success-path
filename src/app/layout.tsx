import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Social Media Success Path | Master Your Digital Presence",
  description:
    "Accelerate your social media growth with our expert-led success path and proven strategies.",
  keywords: [
    "social media marketing",
    "content strategy",
    "digital growth",
    "influencer marketing",
  ],
  authors: [{ name: "Social Media Success Path Team" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
