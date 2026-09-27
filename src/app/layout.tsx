import type { Metadata, Viewport } from "next";
import "./globals.css";
import localFont from "next/font/local";
const dmSans = localFont({
  src: "../components/fonts/dm-sans.ttf",
  variable: "--font-dm-sans",
  display: "swap",
});
const manrope = localFont({
  src: "../components/fonts/manrope.ttf",
  variable: "--font-manrope",
  display: "swap",
});
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_ORIGIN ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000"),
  ),
  title: {
    default: "Countersign — Every payment, accounted for.",
    template: "%s · Countersign",
  },
  description:
    "Check payments against agreements, delivery, and what you already paid. Review exceptions with evidence and keep control of your Safe.",
  applicationName: "Countersign",
  robots: { index: true, follow: true },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f7f0",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${dmSans.variable} ${manrope.variable}`}
    >
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
