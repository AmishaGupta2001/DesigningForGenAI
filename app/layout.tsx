import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NYC Unhinged",
  description: "AI captions for New York moments.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
