import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Perfusion Bot",
  description: "AI assistant for cardiovascular perfusionists",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}