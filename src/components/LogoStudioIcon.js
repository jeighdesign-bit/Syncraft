import { PenTool } from "lucide-react";

export default function LogoStudioIcon({ size = 18, strokeWidth = 1.8, ...props }) {
  return <PenTool size={size} strokeWidth={strokeWidth} aria-hidden="true" {...props} />;
}
