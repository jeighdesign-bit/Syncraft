import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Terms of Service",
  description:
    "Read the Syncraft terms covering creative tools, AI limitations, content permissions, credits and account rules.",
  robots: { index: false, follow: false },
  alternates: {
    canonical: absoluteUrl("/terms"),
  },
};

export default function TermsLayout({ children }) {
  return children;
}
