"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { ArrowUpRight, ExternalLink, FileDown, Upload, X } from "lucide-react";
import styles from "./store.module.css";

const FREE_PAGE_SIZE = 12;

const categoryOrder = [
  { id: "featured", label: "Featured" },
  { id: "sublimation-tools", label: "Tools" },
  { id: "design-packs", label: "Design Packs" },
  { id: "mockups", label: "Mockups" },
];

const toneClass = {
  Lime: styles.toneLime,
  Cobalt: styles.toneCobalt,
  Coral: styles.toneCoral,
  Violet: styles.toneViolet,
};

export default function ProductCarousel({ sections }) {
  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ));
  const [activeCategory, setActiveCategory] = useState("featured");
  const [freeVisibleCount, setFreeVisibleCount] = useState(FREE_PAGE_SIZE);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestForm, setRequestForm] = useState({ email: "", receiptFile: null });
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const catalog = useMemo(() => {
    const sectionMap = new Map(
      sections.map((section) => [
        section.id,
        {
          ...section,
          products: section.products.map((product) => ({
            ...product,
            sectionId: section.id,
            itemLabel: section.itemLabel,
          })),
        },
      ]),
    );

    return categoryOrder.map((category) => {
      if (category.id === "featured") {
        return {
          ...category,
          title: "Featured Products",
          description: "Our core tools for faster sublimation production.",
          products: sectionMap.get("sublimation-tools")?.products.slice(0, 3) || [],
        };
      }

      const section = sectionMap.get(category.id);
      return {
        ...category,
        title: section?.title || category.label,
        description: section?.description || "",
        products: section?.products || [],
      };
    });
  }, [sections]);

  const currentCategory = catalog.find((category) => category.id === activeCategory) || catalog[0];
  const products = currentCategory.id === "free-resources"
    ? currentCategory.products.slice(0, freeVisibleCount)
    : currentCategory.products;
  const hasMoreFreeProducts = currentCategory.id === "free-resources"
    && freeVisibleCount < currentCategory.products.length;
  const isFreeProduct = selectedProduct?.price === "Free";

  const openProduct = (product) => {
    setSelectedProduct(product);
    setShowRequestForm(false);
    setRequestForm({ email: "", receiptFile: null });
    setPurchaseMessage("");
    setIsSubmitting(false);
  };

  const closeProduct = () => {
    setSelectedProduct(null);
    setShowRequestForm(false);
    setRequestForm({ email: "", receiptFile: null });
    setPurchaseMessage("");
    setIsSubmitting(false);
  };

  const handleRequestSubmit = async (event) => {
    event.preventDefault();
    if (!selectedProduct || selectedProduct.price === "Free") return;

    setIsSubmitting(true);
    setPurchaseMessage("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please log in before sending a purchase request.");

      const body = new FormData();
      body.append("email", requestForm.email);
      body.append("productName", selectedProduct.name);
      if (requestForm.receiptFile) body.append("receipt", requestForm.receiptFile);

      const response = await fetch("/api/store-requests", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not submit request.");

      setPurchaseMessage(`Purchase request sent. After receipt verification, we'll email the file or license to ${requestForm.email}.`);
      setShowRequestForm(false);
    } catch (error) {
      setPurchaseMessage(error.message || "Could not submit request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const beginPurchaseRequest = async () => {
    setPurchaseMessage("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setPurchaseMessage("Please log in before sending a purchase request.");
      return;
    }

    setRequestForm((current) => ({
      ...current,
      email: current.email || session.user.email || "",
    }));
    setShowRequestForm(true);
  };

  useEffect(() => {
    if (!selectedProduct) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeProduct();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedProduct]);

  return (
    <section className={styles.catalogSection} aria-labelledby="catalog-heading">
      <div className={styles.categoryTabs} role="tablist" aria-label="Product categories">
        {catalog.map((category) => (
          <button
            className={`${styles.categoryTab} ${category.id === currentCategory.id ? styles.categoryTabActive : ""}`}
            type="button"
            role="tab"
            id={`store-tab-${category.id}`}
            aria-selected={category.id === currentCategory.id}
            aria-controls="store-product-panel"
            key={category.id}
            onClick={() => setActiveCategory(category.id)}
          >
            <span>{category.label}</span>
            <span className={styles.categoryTabCount}>{category.products.length}</span>
          </button>
        ))}
      </div>

      <div className={styles.catalogHeading}>
        <div>
          <p className={styles.catalogLabel}>Browse catalog</p>
          <h2 id="catalog-heading">{currentCategory.title}</h2>
          <p>{currentCategory.description}</p>
        </div>
        <span className={styles.sectionCount}>
          {currentCategory.products.length} {currentCategory.products.length === 1 ? "product" : "products"}
        </span>
      </div>

      <div
        className={styles.productGrid}
        id="store-product-panel"
        role="tabpanel"
        aria-labelledby={`store-tab-${currentCategory.id}`}
      >
        {products.map((product, index) => (
          <article
            className={styles.productCard}
            key={`${product.sectionId}-${product.name}`}
            role="button"
            tabIndex={0}
            aria-label={`Open details for ${product.name}`}
            onClick={() => openProduct(product)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openProduct(product);
              }
            }}
          >
            <div className={`${styles.productPreview} ${toneClass[product.theme] || styles.toneLime} ${product.image ? styles.productPreviewWithImage : ""}`} aria-hidden="true">
              {product.image ? (
                <img className={styles.productPreviewImage} src={product.image} alt="" loading="lazy" />
              ) : (
                <>
                  <span className={styles.previewIndex}>0{index + 1}</span>
                  <span className={styles.previewLabel}>{product.meta}</span>
                  <div className={styles.previewShape} />
                  <span className={styles.previewWord}>Syncraft</span>
                </>
              )}
            </div>
            <div className={styles.productContent}>
              <div className={styles.productMetaRow}>
                <span className={styles.productType}>{product.itemLabel}</span>
                {product.originalPrice ? (
                  <span className={styles.promoPriceGroup} aria-label={`Regular price ${product.originalPrice}; promo price ${product.price}`}>
                    <span className={styles.originalPrice}>{product.originalPrice}</span>
                    <span className={styles.price}><small>Promo</small>{product.price}</span>
                  </span>
                ) : (
                  <span className={product.price === "Free" ? styles.freePrice : styles.price}>{product.price}</span>
                )}
              </div>
              {product.promoSlots && (
                <span className={styles.promoAvailability}>
                  <span aria-hidden="true" /> Only {product.promoSlots} promo slots left
                </span>
              )}
              <h3>{product.name}</h3>
              <div className={styles.productFooter}>
                <span><FileDown size={14} aria-hidden="true" /> {product.meta}</span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </div>
            </div>
          </article>
        ))}
      </div>

      {currentCategory.id === "free-resources" && (
        <div className={styles.loadMoreRow}>
          <span>Showing {products.length} of {currentCategory.products.length}</span>
          {hasMoreFreeProducts && (
            <button
              className={styles.loadMoreButton}
              type="button"
              onClick={() => setFreeVisibleCount((count) => count + FREE_PAGE_SIZE)}
            >
              Load more
            </button>
          )}
        </div>
      )}

      {selectedProduct && (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeProduct();
          }}
        >
          <section
            className={`${styles.productModal} ${showRequestForm ? styles.productModalWithForm : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-modal-title"
          >
            <button
              className={styles.modalClose}
              type="button"
              onClick={closeProduct}
              aria-label="Close product details"
              autoFocus
            >
              <X size={18} aria-hidden="true" />
            </button>

            <div className={styles.modalArtwork}>
              {selectedProduct.image ? (
                <img src={selectedProduct.image} alt={selectedProduct.name} />
              ) : (
                <div className={`${styles.productPreview} ${toneClass[selectedProduct.theme] || styles.toneLime}`} aria-hidden="true">
                  <span className={styles.previewIndex}>01</span>
                  <span className={styles.previewLabel}>{selectedProduct.meta}</span>
                  <div className={styles.previewShape} />
                  <span className={styles.previewWord}>Syncraft</span>
                </div>
              )}
            </div>

            <div className={styles.modalBody}>
              <div className={styles.productMetaRow}>
                <span className={styles.productType}>{selectedProduct.itemLabel}</span>
                {selectedProduct.originalPrice ? (
                  <span className={styles.promoPriceGroup} aria-label={`Regular price ${selectedProduct.originalPrice}; promo price ${selectedProduct.price}`}>
                    <span className={styles.originalPrice}>{selectedProduct.originalPrice}</span>
                    <span className={styles.price}><small>Promo</small>{selectedProduct.price}</span>
                  </span>
                ) : (
                  <span className={selectedProduct.price === "Free" ? styles.freePrice : styles.price}>{selectedProduct.price}</span>
                )}
              </div>
              {selectedProduct.promoSlots && (
                <span className={`${styles.promoAvailability} ${styles.modalPromoAvailability}`}>
                  <span aria-hidden="true" /> Only {selectedProduct.promoSlots} promo slots left
                </span>
              )}
              <h2 id="product-modal-title">{selectedProduct.name}</h2>
              {!showRequestForm && (
                <>
                  <p>{selectedProduct.description}</p>
                  <div className={styles.modalMeta}>
                    <FileDown size={15} aria-hidden="true" />
                    {selectedProduct.meta}
                  </div>
                </>
              )}
              {isFreeProduct ? (
                <div className={styles.availabilityNotice}>
                  Free downloads will be available later.
                </div>
              ) : !showRequestForm ? (
                <button
                  className={styles.buyButton}
                  type="button"
                  onClick={beginPurchaseRequest}
                >
                  Buy now <ArrowUpRight size={17} aria-hidden="true" />
                </button>
              ) : (
                <form className={styles.requestForm} onSubmit={handleRequestSubmit}>
                  <p className={styles.requestHint}>
                    Pay via GCash first, then attach the receipt image for manual checking.
                  </p>
                  <div className={styles.paymentInstructions}>
                    <div>
                      <span>Send exact amount</span>
                      <strong>{selectedProduct.price}</strong>
                    </div>
                    <div>
                      <span>Official GCash</span>
                      <strong>0991 835 5995</strong>
                    </div>
                    <a href="/Gcash-qr-code.jpg" target="_blank" rel="noreferrer">
                      <span>Open GCash QR</span>
                      <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  </div>
                  <label className={styles.formField}>
                    <span>Your Gmail</span>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={requestForm.email}
                      onChange={(event) => setRequestForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="you@gmail.com"
                    />
                  </label>
                  <label className={styles.formField}>
                    <span>GCash receipt image</span>
                    <div className={styles.filePicker}>
                      <input
                        className={styles.filePickerInput}
                        type="file"
                        required
                        accept="image/jpeg,image/png,image/webp"
                        aria-label="Choose GCash receipt image"
                        onChange={(event) => setRequestForm((current) => ({ ...current, receiptFile: event.target.files?.[0] || null }))}
                      />
                      <Upload size={18} aria-hidden="true" />
                      <div>
                        <strong>{requestForm.receiptFile ? "Receipt selected" : "Choose receipt"}</strong>
                        <small>{requestForm.receiptFile?.name || "JPG, PNG or WebP · Maximum 5MB"}</small>
                      </div>
                    </div>
                  </label>
                  <button className={styles.buyButton} type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Submitting..." : "Send purchase request"} <ArrowUpRight size={17} aria-hidden="true" />
                  </button>
                </form>
              )}
              {purchaseMessage && <p className={styles.purchaseMessage} role="status">{purchaseMessage}</p>}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
