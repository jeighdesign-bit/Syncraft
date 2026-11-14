import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Copyright Policy",
  description:
    "Read Syncraft rules on content rights, AI outputs, operational permissions, infringement reports and review requests.",
  robots: { index: false, follow: false },
  alternates: {
    canonical: absoluteUrl("/copyright"),
  },
};

export default function CopyrightLayout({ children }) {
  return children;
}
