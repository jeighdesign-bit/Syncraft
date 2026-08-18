import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Copyright Policy",
  description:
    "Understand Syncraft copyright rules for uploaded images, generated files, user ownership, authorization requirements, and content removal.",
  alternates: {
    canonical: absoluteUrl("/copyright"),
  },
};

export default function CopyrightLayout({ children }) {
  return children;
}
