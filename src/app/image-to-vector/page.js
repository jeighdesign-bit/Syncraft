import SeoLandingPage from "@/app/components/SeoLandingPage";
import { landingContent } from "@/lib/landingContent";
import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "AI Image to Vector Converter | PNG & JPG to SVG",
  description: "Convert PNG and JPG artwork into clean, scalable SVG files for printing, branding, apparel production, and professional design workflows.",
  alternates: { canonical: absoluteUrl("/image-to-vector") },
  openGraph: { title: "AI Image to Vector Converter | Syncraft", description: "Turn raster artwork into scalable SVG files with AI-assisted vector tracing.", url: absoluteUrl("/image-to-vector") },
};

export default function ImageToVectorPage() {
  return <SeoLandingPage {...landingContent.imageToVector} />;
}
