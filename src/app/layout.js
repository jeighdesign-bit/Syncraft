import { Outfit } from "next/font/google";
import { ToastContainer } from "@/components/Toast";
import MobileWarning from "./components/MobileWarning";
import CookieConsent from "./components/CookieConsent";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], display: "swap" });

export const metadata = {
  metadataBase: new URL("https://desaynclaw.com"),
  title: {
    default: "DesaynClaw | AI Vector Auto-Tracer",
    template: "%s | DesaynClaw",
  },
  description: "Instantly transform your raster images (PNG, JPG) into ultra-clean, scalable vector graphics (SVG) using our advanced AI neural engine. Perfect for print shops and apparel designers.",
  keywords: ["vector tracer", "ai tracer", "svg converter", "image to vector", "desaynclaw", "apparel design", "dtf printing", "sublimation", "philippines"],
  authors: [{ name: "desaynbro" }],
  creator: "desaynbro",
  openGraph: {
    type: "website",
    locale: "en_PH",
    url: "https://desaynclaw.com",
    title: "DesaynClaw | AI Vector Auto-Tracer",
    description: "Convert your pixelated logos and designs into ultra-crisp, editable SVG vectors instantly using AI. Specially made for the printing industry.",
    siteName: "DesaynClaw",
    images: [
      {
        url: "/a-clean--minimal-social-media-promotional-banner-f-01.jpg",
        width: 1200,
        height: 630,
        alt: "DesaynClaw AI Vector Tracer Banner",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DesaynClaw | AI Vector Auto-Tracer",
    description: "Convert pixelated logos to crisp SVG vectors instantly using AI.",
    images: ["/a-clean--minimal-social-media-promotional-banner-f-01.jpg"],
  },
};

import MaintenanceScreen from "./components/MaintenanceScreen";
import GlobalMobileSync from "@/components/GlobalMobileSync";

const isMaintenance = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true'; // Emergency maintenance mode

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={outfit.className}>
        {isMaintenance ? (
          <MaintenanceScreen />
        ) : (
          <>
            <MobileWarning />
            <GlobalMobileSync />
            {children}
          </>
        )}
        <CookieConsent />
        <ToastContainer />
      </body>
    </html>
  );
}
