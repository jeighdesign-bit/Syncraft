import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Refund and Payment Policy",
  description:
    "Read the Syncraft policy on credit charges, failed operations, recovery, payments and monetary refunds.",
  robots: { index: false, follow: false },
  alternates: {
    canonical: absoluteUrl("/refunds"),
  },
};

export default function RefundsLayout({ children }) {
  return children;
}
