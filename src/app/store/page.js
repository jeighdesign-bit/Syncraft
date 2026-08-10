import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "./store.module.css";
import ProductCarousel from "./ProductCarousel";

const freeResourceProducts = [
  ["dwdgegefgef.webp", "Soccer Jersey Mockup", "Showcase a soccer jersey concept with front, back, and alternate garment views.", "Jersey mockup", "Coral"],
  ["efgefefwf.webp", "Boxing Gloves Mockup", "A sports-product mockup for boxing gear, gym branding, and athletic promotions.", "Product mockup", "Coral"],
  ["photo_2024-11-08_03-27-04.webp", "Black Polo Mockup", "A clean polo-shirt scene for apparel branding, uniforms, and client presentations.", "Apparel mockup", "Coral"],
  ["photo_2024-11-08_03-27-05.webp", "White Polo Mockup", "A minimal white polo mockup for testing logos, prints, and uniform concepts.", "Apparel mockup", "Lime"],
  ["photo_2024-11-08_03-30-38.webp", "AI Backgrounds Pack", "Colorful generated backgrounds for posters, social content, and creative presentations.", "Background pack", "Cobalt"],
  ["photo_2024-12-27_03-02-16.webp", "Green Polo Mockup", "A fresh polo-shirt mockup for apparel branding, uniforms, and product previews.", "Apparel mockup", "Cobalt"],
].map(([file, name, description, meta, theme]) => ({
  name,
  description,
  price: "Free",
  meta,
  theme,
  image: `/Store/FREE RESOURCES/${file}`,
}));

const sections = [
  {
    id: "sublimation-tools",
    number: "01",
    title: "Sublimation Tools",
    description: "Practical automation tools made to speed up resizing, batch production, and print nesting.",
    itemLabel: "Sublimation Tool",
    products: [
      {
        name: "Subli Autoresizer",
        description: "Resize PSD files from one master size into standard Philippine print sizes in seconds, with organized output and a free mockup bundle included.",
        price: "\u20B1850",
        originalPrice: "\u20B11,299",
        promoSlots: 3,
        meta: "PSD size generator + mockups",
        theme: "Lime",
        image: "/Store/Sublimation Tools/subli autoresizer.jpg",
      },
      {
        name: "SubliBatch Pro",
        description: "Batch rename and export teamwear artwork with mapped text layers, RGB/CMYK color assurance, and print-ready output settings.",
        price: "\u20B1850",
        originalPrice: "\u20B11,299",
        promoSlots: 3,
        meta: "Batch rename + export",
        theme: "Cobalt",
        image: "/Store/Sublimation Tools/sublibatchpro.jpg",
      },
      {
        name: "SubliNest",
        description: "Auto-rip and nest sublimation patterns with smart spacing, rotation, trimming, and material-saving layouts for roll printing.",
        price: "\u20B1850",
        originalPrice: "\u20B11,299",
        promoSlots: 3,
        meta: "Auto-ripping + nesting",
        theme: "Coral",
        image: "/Store/Sublimation Tools/SUBLINEST.jpg",
      },
      {
        name: "Jersey Size Chart Kit",
        description: "Print-ready size charts for custom jerseys, polos, and teamwear orders.",
        price: "Free",
        meta: "PDF + PNG",
        theme: "Lime",
      },
      {
        name: "Sublimation Quote Sheet",
        description: "A clean pricing worksheet for faster client quotes and order handoffs.",
        price: "₱149",
        meta: "Editable template",
        theme: "Cobalt",
      },
      {
        name: "Colorway Planner",
        description: "Plan team color combinations before you open your design software.",
        price: "₱199",
        meta: "10 layouts",
        theme: "Coral",
      },
      {
        name: "Print Checklist",
        description: "A final preflight checklist to help every file reach the press ready.",
        price: "Free",
        meta: "1-page guide",
        theme: "Violet",
      },
    ],
  },
  {
    id: "mockups",
    number: "02",
    title: "Mockups",
    description: "Ready-to-use mockups for jerseys, apparel, and product previews.",
    itemLabel: "Mockup",
    products: [
      {
        name: "Mockups Bundle 70+",
        description: "A large sublimation mockup bundle with 70+ apparel and teamwear scenes for presenting designs faster and more professionally.",
        price: "₱499",
        meta: "70+ mockup scenes",
        theme: "Cobalt",
        image: "/Store/MOCKUPS/MOCKUPS BUNDLE 70%2B (499 PESOS).webp",
      },
      {
        name: "Basketball Jersey Mockup",
        description: "Front and back jersey scenes for pitching teamwear concepts with confidence.",
        price: "₱299",
        meta: "PSD + PNG",
        theme: "Cobalt",
      },
      {
        name: "Polo Shirt Preview",
        description: "A crisp apparel mockup built for school, company, and club uniforms.",
        price: "₱249",
        meta: "PSD + PNG",
        theme: "Lime",
      },
      {
        name: "Shorts Mockup Set",
        description: "Pair your jersey concepts with matching sublimation shorts in one set.",
        price: "₱249",
        meta: "6 angles",
        theme: "Coral",
      },
      {
        name: "Teamwear Bundle",
        description: "A complete mockup pack for presenting a polished full-uniform collection.",
        price: "₱499",
        meta: "18 scenes",
        theme: "Violet",
      },
    ],
  },
  {
    id: "design-packs",
    number: "03",
    title: "Design Packs",
    description: "Curated design assets for sublimation and creative projects.",
    itemLabel: "Design Pack",
    products: [
      {
        name: "Custom Design 1",
        description: "A bold front-and-back sublimation jersey design with tactical graphics, red accents, and editable name details.",
        price: "₱149",
        meta: "Jersey design",
        theme: "Coral",
        image: "/Store/DESIGN PACKS/CUSTOM DESIGN 1 (149 PESOS).webp",
      },
      {
        name: "Custom Design 2",
        description: "A high-energy custom teamwear design with layered sport graphics and a strong front-and-back presentation.",
        price: "₱149",
        meta: "Jersey design",
        theme: "Lime",
        image: "/Store/DESIGN PACKS/CUSTOM DESIGN 2 (149 PESOS).webp",
      },
      {
        name: "Custom Design 3",
        description: "A print-ready custom jersey concept built for bold team identity, clean paneling, and editable details.",
        price: "₱149",
        meta: "Jersey design",
        theme: "Cobalt",
        image: "/Store/DESIGN PACKS/CUSTOM DESIGN 3 (149 PESOS).webp",
      },
      {
        name: "Custom Design 4",
        description: "A polished sublimation uniform design with balanced typography, graphic texture, and front-and-back layouts.",
        price: "₱149",
        meta: "Jersey design",
        theme: "Coral",
        image: "/Store/DESIGN PACKS/CUSTOM DESIGN 4 (149 PESOS).webp",
      },
      {
        name: "Custom Design 5",
        description: "A modern custom teamwear artwork set designed for quick client previews and production-ready customization.",
        price: "₱149",
        meta: "Jersey design",
        theme: "Lime",
        image: "/Store/DESIGN PACKS/CUSTOM DESIGN 5 (149 PESOS).webp",
      },
      {
        name: "Custom Design 6",
        description: "A sport-focused sublimation design with strong contrast, dynamic panels, and a complete teamwear look.",
        price: "₱149",
        meta: "Jersey design",
        theme: "Cobalt",
        image: "/Store/DESIGN PACKS/CUSTOM DESIGN 6 (149 PESOS).webp",
      },
      {
        name: "Custom Design 7",
        description: "A versatile custom jersey artwork concept with bold details for teams, clubs, and print shop projects.",
        price: "₱149",
        meta: "Jersey design",
        theme: "Coral",
        image: "/Store/DESIGN PACKS/CUSTOM DESIGN 7 (149 PESOS).webp",
      },
      {
        name: "Court Energy Pack",
        description: "Bold sporty shapes, lines, and textures for high-energy team designs.",
        price: "₱349",
        meta: "42 assets",
        theme: "Coral",
      },
      {
        name: "Clean Type Collection",
        description: "Sharp typographic treatments for names, numbers, and uniform details.",
        price: "₱299",
        meta: "24 assets",
        theme: "Lime",
      },
      {
        name: "Street Motion Textures",
        description: "Grain, speed lines, and layered textures to add depth to your layouts.",
        price: "₱399",
        meta: "35 assets",
        theme: "Cobalt",
      },
      {
        name: "Starter Shapes",
        description: "A free set of versatile geometric elements for your next concept.",
        price: "Free",
        meta: "12 assets",
        theme: "Violet",
      },
    ],
  },
  {
    id: "free-resources",
    number: "04",
    title: "Free Resources",
    description: "Free mockups and design resources to help you get started.",
    itemLabel: "Free Resource",
    products: [
      ...freeResourceProducts,
      {
        name: "Starter Mockup Pack",
        description: "A small collection of clean apparel previews for your first client pitch.",
        price: "Free",
        meta: "5 scenes",
        theme: "Lime",
      },
      {
        name: "Sublimation File Guide",
        description: "Simple file setup notes for sharper prints and smoother production days.",
        price: "Free",
        meta: "PDF guide",
        theme: "Cobalt",
      },
      {
        name: "Number Styles Mini Pack",
        description: "A quick-start collection of athletic number treatments for teamwear.",
        price: "Free",
        meta: "8 styles",
        theme: "Coral",
      },
      {
        name: "Print Shop Checklist",
        description: "Keep approvals, exports, and production details organized in one place.",
        price: "Free",
        meta: "1-page guide",
        theme: "Violet",
      },
    ],
  },
];

const getVisibleProducts = (section) => (
  ["sublimation-tools", "mockups", "design-packs", "free-resources"].includes(section.id)
    ? section.products.filter((product) => product.image)
    : section.products
);

export default function StorePage() {
  const visibleSections = sections
    .filter((section) => section.id !== "free-resources")
    .map((section) => ({
      ...section,
      products: getVisibleProducts(section),
    }));
  const totalProducts = visibleSections.reduce((total, section) => total + section.products.length, 0);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.topbar}>
          <Link href="/" className={styles.backLink} aria-label="Back to Syncraft" title="Back to Syncraft">
            <ArrowLeft className={styles.backArrow} size={22} strokeWidth={1.8} aria-hidden="true" />
          </Link>
          <div className={styles.headerBrand} aria-label="Syncraft Store">
            <img src="/logo_full.png" alt="Syncraft Store" />
          </div>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroTitle}>
            <div className={styles.heroKicker}>
              <p className={styles.eyebrow}>Resources for creators</p>
              <span className={styles.catalogCount}>{totalProducts} items</span>
            </div>
            <h1>Build faster.<br /><em>Design better.</em></h1>
          </div>
        </section>

        <div className={styles.catalog}>
          <ProductCarousel sections={visibleSections} />
        </div>

        <footer className={styles.footer}>
          New resources are added regularly. Product download and checkout links can be connected as each item goes live.
        </footer>
      </div>
    </main>
  );
}
