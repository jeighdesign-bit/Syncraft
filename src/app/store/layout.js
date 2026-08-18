import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Design Resources, Mockups & Sublimation Tools",
  description:
    "Browse practical design resources, apparel mockups, sublimation tools, and creative packs for print shops and professional designers.",
  alternates: { canonical: absoluteUrl("/store") },
  openGraph: {
    title: "Syncraft Design Store",
    description: "Mockups, design packs, and production tools for creative professionals.",
    url: absoluteUrl("/store"),
  },
};

export default function StoreLayout({ children }) {
  return children;
}
