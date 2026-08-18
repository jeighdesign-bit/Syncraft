import SeoLandingPage from "@/app/components/SeoLandingPage";
import { landingContent } from "@/lib/landingContent";
import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "AI Image Upscaler for Logos, Artwork & Print Design",
  description: "Upscale low-resolution logos, apparel graphics, product images, and client artwork for sharper creative and print-preparation workflows.",
  alternates: { canonical: absoluteUrl("/image-upscaler") },
  openGraph: { title: "AI Image Upscaler | Syncraft", description: "Create higher-resolution design files and creative assets with AI-assisted upscaling.", url: absoluteUrl("/image-upscaler") },
};

export default function ImageUpscalerLandingPage() {
  return <SeoLandingPage {...landingContent.imageUpscaler} ctaHref="/#syncraft-upload" ctaLabel="Start with an Upload" />;
}
