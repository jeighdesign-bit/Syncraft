import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Privacy Policy",
  description:
    "Read the Syncraft privacy notice on creative content, providers, sharing, analytics, retention and privacy rights.",
  robots: { index: false, follow: false },
  alternates: {
    canonical: absoluteUrl("/privacy"),
  },
};

export default function PrivacyLayout({ children }) {
  return children;
}
