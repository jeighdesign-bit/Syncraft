import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Acceptable Use Policy",
  description:
    "Review Syncraft acceptable use rules for AI design extraction, copyright-safe uploads, prohibited content, abuse prevention, and service limits.",
  alternates: {
    canonical: absoluteUrl("/acceptable-use"),
  },
};

export default function AcceptableUseLayout({ children }) {
  return children;
}
