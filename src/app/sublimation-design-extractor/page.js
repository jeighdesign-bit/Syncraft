import SeoLandingPage from "@/app/components/SeoLandingPage";
import { landingContent } from "@/lib/landingContent";
import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "AI Sublimation Design Extractor for Jersey Artwork",
  description: "Extract flatter artwork from authorized jersey mockups and apparel references for sublimation, sportswear, and uniform design workflows.",
  alternates: { canonical: absoluteUrl("/sublimation-design-extractor") },
  openGraph: { title: "AI Sublimation Design Extractor | Syncraft", description: "Recover flatter artwork from authorized jersey and apparel references.", url: absoluteUrl("/sublimation-design-extractor") },
};

export default function SublimationExtractorPage() {
  return <SeoLandingPage {...landingContent.sublimationExtractor} />;
}
