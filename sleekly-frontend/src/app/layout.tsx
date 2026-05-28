import type { Metadata } from "next";
import { AuthProvider } from "@/components/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sleekly",
  description: "A local-first visual workspace for cards, notes, media, tags, and whiteboards.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
