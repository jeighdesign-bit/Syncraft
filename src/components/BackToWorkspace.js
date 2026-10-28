"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "./BackToWorkspace.module.css";

export default function BackToWorkspace() {
  return <Link href="/workspace" className={styles.link}>
    <ArrowLeft size={15} strokeWidth={1.8} aria-hidden="true" />
    <span>Back to Workspace</span>
  </Link>;
}
