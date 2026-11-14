import Link from 'next/link';
import { ArrowLeft, CreditCard, Shield, ShieldAlert } from 'lucide-react';
import BackLink from './BackLink';
import drafts from '@/content/legalDrafts.json';
import styles from './LegalDraftPage.module.css';

const policies = [
  { key: 'terms', title: 'Terms of Service', href: '/terms', icon: ShieldAlert },
  { key: 'refunds', title: 'Refund & Payment Policy', href: '/refunds', icon: CreditCard },
  { key: 'privacy', title: 'Privacy Policy', href: '/privacy', icon: Shield },
  { key: 'copyright', title: 'Copyright Policy', href: '/copyright', icon: ShieldAlert },
  { key: 'acceptable-use', title: 'Acceptable Use Policy', href: '/acceptable-use', icon: ShieldAlert },
];

function InlineCopy({ text }) {
  return text.split(/(\[LEGAL BUSINESS NAME\]|\[SUPPORT EMAIL\]|https:\/\/[^\s]+|\/copyright-takedown\b)/g).map((part, index) => {
    if (part === '[LEGAL BUSINESS NAME]' || part === '[SUPPORT EMAIL]') {
      return <mark key={index} className={styles.placeholder}>{part}</mark>;
    }
    if (part === '/copyright-takedown') return <Link key={index} href={part}>Copyright Takedown Request</Link>;
    if (part.startsWith('https://')) return <a key={index} href={part}>{part}</a>;
    return part;
  });
}

function CopyBlock({ text }) {
  const lines = text.split('\n');
  if (lines.every(line => line.startsWith('- '))) {
    return <ul className={styles.list}>{lines.map((line, index) => <li key={index}><InlineCopy text={line.slice(2)} /></li>)}</ul>;
  }
  return <p className={styles.copy}><InlineCopy text={text} /></p>;
}

export default function LegalDraftPage({ policy }) {
  const current = policies.find(item => item.key === policy);
  const Icon = current.icon;
  // These strings match the owner's policy text in docs/legal-drafts/.
  const [header, ...blocks] = drafts[policy].trim().split(/\r?\n\s*\r?\n/);
  const headerLines = header.split(/\r?\n/);
  const sections = [];
  for (const block of blocks) {
    const heading = block.match(/^(\d+)\. (.+)$/);
    if (heading) sections.push({ number: heading[1], title: heading[2], blocks: [] });
    else sections.at(-1).blocks.push(block);
  }

  return <main className={styles.page}>
    <div className={styles.container}>
      <header className={styles.header}>
        <BackLink className={styles.back}><ArrowLeft size={16} aria-hidden="true" /> Back</BackLink>
        <h1><Icon size={34} aria-hidden="true" />{current.title}</h1>
        <aside className={styles.details} aria-label="Policy information">
          {headerLines.slice(1).map((line, index) => <p key={index}><InlineCopy text={line} /></p>)}
        </aside>
        <nav className={styles.navigation} aria-label="Legal policies">
          {policies.map(item => <Link key={item.key} href={item.href} aria-current={item.key === policy ? 'page' : undefined}>{item.title}</Link>)}
        </nav>
      </header>
      <div className={styles.content}>
        {sections.map(section => <section key={section.number} className={styles.section} aria-labelledby={`section-${section.number}`}>
          <p className={styles.sectionNumber}>Section {section.number}</p>
          <h2 id={`section-${section.number}`}>{section.title}</h2>
          {section.blocks.map((block, index) => <CopyBlock key={index} text={block} />)}
        </section>)}
      </div>
    </div>
  </main>;
}
