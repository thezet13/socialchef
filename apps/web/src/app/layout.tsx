import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SocialChef",
  description: "AI content editor for restaurants",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?
        family=Inter:wght@100..900&
        family=Montserrat:wght@100..900&
        family=Bebas+Neue&
        family=Jua&
        family=Katibeh&
        family=Lora:wght@400;600;700&
        family=Lugrasimo&
        family=Noto+Sans+KR:wght@100..900&
        family=Noto+Sans+TC:wght@100..900&
        family=Oswald:wght@200..700&
        family=Outfit:wght@100..900&
        family=Permanent+Marker&
        family=Playfair+Display:wght@400;600;700&
        family=Pridi:wght@100..700&
        family=PT+Serif:wght@400;700&
        family=Rampart+One&
        family=Shojumaru&
        family=Spicy+Rice&
        family=Texturina:wght@100..900&
        family=Ultra&
        family=Vast+Shadow&
        &display=swap"
        rel="stylesheet"
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
