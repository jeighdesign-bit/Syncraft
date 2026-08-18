import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Refund and Payment Policy",
  description:
    "Review Syncraft credit refund rules, failed trace refunds, payment verification timing, unused credits, and chargeback policy.",
  alternates: {
    canonical: absoluteUrl("/refunds"),
  },
};

export default function RefundsLayout({ children }) {
  return children;
}
