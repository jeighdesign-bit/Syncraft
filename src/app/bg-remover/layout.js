// Metadata layout wrapper for the BG Remover page.
// The page.js itself is "use client" so metadata lives here.
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/lib/site";

export const metadata = {
  title: "AI Background Remover | Remove BG from Designs & Logos Free",
  description:
    "Remove backgrounds from sublimation designs, jersey mockups, logos, and photos instantly using AI. Get a clean transparent PNG in seconds — no Photoshop needed. Perfect for print shop designers.",
  keywords: [
    "background remover",
    "remove background ai",
    "remove bg free",
    "transparent background maker",
    "ai background eraser",
    "remove bg sublimation",
    "jersey background remover",
    "logo background remover",
    "png background removal",
    "cutout image online",
    "transparent png maker",
    "remove white background",
    "remove bg shirt design",
    "background eraser online",
    "ai cutout tool",
    "sublimation design cutout",
    "syncraft bg remover",
  ],
  alternates: {
    canonical: absoluteUrl("/bg-remover"),
  },
  openGraph: {
    title: "AI Background Remover — Free Transparent PNG | Syncraft",
    description:
      "Remove backgrounds from jersey designs, logos, and photos using AI. Get a clean transparent PNG instantly — no Photoshop needed.",
    url: absoluteUrl("/bg-remover"),
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1600,
        height: 691,
        alt: "Syncraft AI Background Remover",
      },
    ],
  },
  twitter: {
    title: "AI Background Remover | Syncraft",
    description:
      "Remove backgrounds from sublimation designs and logos in one click. Free to try.",
    images: [DEFAULT_OG_IMAGE],
  },
};

export default function BgRemoverLayout({ children }) {
  return children;
}
