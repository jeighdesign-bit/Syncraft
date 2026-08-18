import SeoLandingPage from "@/app/components/SeoLandingPage";
import { landingContent } from "@/lib/landingContent";
import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "AI Logo Vectorizer | Convert Logos to SVG",
  description: "Turn low-resolution PNG and JPG logos into scalable SVG artwork for print, apparel, signage, merchandise, and professional branding.",
  alternates: { canonical: absoluteUrl("/logo-vectorizer") },
  openGraph: { title: "AI Logo Vectorizer | Syncraft", description: "Convert low-resolution logos into cleaner, scalable SVG artwork.", url: absoluteUrl("/logo-vectorizer") },
};

export default function LogoVectorizerPage() {
  return <SeoLandingPage {...landingContent.logoVectorizer} />;
}
