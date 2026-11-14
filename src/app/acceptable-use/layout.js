import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Acceptable Use Policy",
  description:
    "Read Syncraft rules on authorized artwork, prohibited content, account and payment abuse, sharing, enforcement and review requests.",
  robots: { index: false, follow: false },
  alternates: {
    canonical: absoluteUrl("/acceptable-use"),
  },
};

export default function AcceptableUseLayout({ children }) {
  return children;
}
