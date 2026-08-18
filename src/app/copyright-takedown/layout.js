import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Copyright Takedown Information",
  description:
    "Information for rights holders about sending copyright takedown requests for content processed through Syncraft.",
  alternates: {
    canonical: absoluteUrl("/copyright-takedown"),
  },
};

export default function CopyrightTakedownLayout({ children }) {
  return children;
}
