import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "MCAT Prep · Learn your patterns",
  description:
    "Focused MCAT practice, thoughtful feedback, and a clearer picture of your progress.",
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
