import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meal Planner",
  description: "Plan your week with recipe inspiration.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
