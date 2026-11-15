import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AICAD Studio — AI-Powered Parametric 3D CAD",
  description: "Translate natural language prompts into watertight parametric Replicad TypeScript 3D CAD models with assemblies, colors, and materials.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body
        className="h-full bg-[#0d0d0d] text-[#f4f4f4] antialiased overflow-hidden"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
