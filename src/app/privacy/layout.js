import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Syncraft handles uploaded images, generated files, account data, payments, technical logs, retention, and AI training protections.",
  alternates: {
    canonical: absoluteUrl("/privacy"),
  },
};

export default function PrivacyLayout({ children }) {
  return children;
}
