import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Terms of Service",
  description:
    "Read the Syncraft terms covering AI vector tracing, user responsibilities, copyright authorization, credits, prohibited use, and account rules.",
  alternates: {
    canonical: absoluteUrl("/terms"),
  },
};

export default function TermsLayout({ children }) {
  return children;
}
