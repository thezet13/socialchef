import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import { inter } from "../lib/fonts";
import { GlobalDialogProvider } from "../components/GlobalDialogProvider";
import { LanguageProvider } from "../i18n/LanguageProvider";

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
      <head></head>
      <body className={`${inter.variable} antialiased`}>
        <div
          className="
    min-h-screen
    origin-top-left
    max-[1366px]:scale-[0.75]
    max-[1366px]:w-[133%]
  "
        ><LanguageProvider>
          <AuthProvider>
            <GlobalDialogProvider>
              {children}
            </GlobalDialogProvider>
          </AuthProvider>
          </LanguageProvider>
        </div>
      </body>
    </html>
  );
}
