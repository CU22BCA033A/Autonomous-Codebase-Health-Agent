import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Docket (free tier)",
  description: "Autonomous codebase health agent — free tier, running on Groq.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
