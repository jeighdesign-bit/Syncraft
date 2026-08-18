import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Vector Tracing API Documentation",
  description:
    "Integrate Syncraft AI vector tracing and design-processing workflows into your application with the Syncraft API.",
  alternates: { canonical: absoluteUrl("/docs/api") },
  openGraph: {
    title: "Syncraft API Documentation",
    description: "Build AI vector tracing and artwork-processing workflows with Syncraft.",
    url: absoluteUrl("/docs/api"),
  },
};

export default function ApiDocsLayout({ children }) {
  return children;
}
