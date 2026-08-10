"use client";

/* Native images keep this gallery portable across the Sites and Vercel runtimes. */
/* eslint-disable @next/next/no-img-element */

import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type UIEvent } from "react";
import type { ShopProduct } from "../../lib/shop/catalog";
import { selectProductGalleryMedia } from "../../lib/shop/model-tryout";
import { ProductVisual } from "./product-visual";

function nextIndex(current: number, direction: number, count: number) {
  return (current + direction + count) % count;
}

export function ProductMediaGallery({ product }: { product: ShopProduct }) {
  const media = selectProductGalleryMedia(product);
  const [activeIndex, setActiveIndex] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  if (!media.length) {
    return (
      <div className="shop-media-fallback">
        <ProductVisual product={product} />
      </div>
    );
  }

  const activeMedia = media[activeIndex];

  function moveTo(index: number) {
    const targetIndex = (index + media.length) % media.length;
    setActiveIndex(targetIndex);
    const rail = railRef.current;
    const target = rail?.querySelector<HTMLElement>(
      `[data-media-index="${targetIndex}"]`,
    );
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!rail || !target) return;
    rail.scrollTo({
      behavior: reduceMotion ? "auto" : "smooth",
      left: target.offsetLeft - (rail.clientWidth - target.offsetWidth) / 2,
    });
  }

  function openViewer(index: number) {
    setActiveIndex(index);
    dialogRef.current?.showModal();
  }

  function trackVisibleFrame(event: UIEvent<HTMLDivElement>) {
    const rail = event.currentTarget;
    const center = rail.scrollLeft + rail.clientWidth / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    Array.from(rail.children).forEach((child, index) => {
      const frame = child as HTMLElement;
      const frameCenter = frame.offsetLeft + frame.offsetWidth / 2;
      const distance = Math.abs(frameCenter - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (closestIndex !== activeIndex) setActiveIndex(closestIndex);
  }

  function handleViewerKeys(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActiveIndex((current) => nextIndex(current, -1, media.length));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setActiveIndex((current) => nextIndex(current, 1, media.length));
    }
  }

  function syncRailAfterViewer() {
    if (!window.matchMedia("(max-width: 680px)").matches) return;
    window.requestAnimationFrame(() => moveTo(activeIndex));
  }

  return (
    <section className="shop-product-gallery" aria-label={`${product.name} views`}>
      <div
        aria-label={`${product.name} image gallery`}
        className="shop-media-grid"
        onScroll={trackVisibleFrame}
        ref={railRef}
        role="region"
      >
        {media.map((item, index) => (
          <figure
            className={`shop-media-frame is-${item.presentation} is-${item.view}`}
            data-media-index={index}
            data-model-anchor={item.modelAnchorId}
            key={item.id}
          >
            <button
              aria-label={`Open ${item.label.toLowerCase()} view of ${product.name}`}
              className="shop-media-open"
              onClick={() => openViewer(index)}
              type="button"
            >
              <img
                alt={item.alt}
                fetchPriority={index === 0 ? "high" : "auto"}
                height={item.height}
                loading={index === 0 ? "eager" : "lazy"}
                src={item.src}
                style={{ objectPosition: item.objectPosition ?? "50% 50%" }}
                width={item.width}
              />
              <span className="shop-media-label" aria-hidden="true">
                <small>{String(index + 1).padStart(2, "0")}</small>
                <strong>{item.label}</strong>
              </span>
              <span className="shop-media-expand" aria-hidden="true">
                <Expand size={17} strokeWidth={1.7} />
              </span>
            </button>
          </figure>
        ))}
      </div>

      <div className="shop-media-controls" aria-label="Gallery controls">
        <button
          aria-label="Previous product view"
          onClick={() => moveTo(activeIndex - 1)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>
        <span>
          <strong>{activeIndex + 1} / {media.length}</strong>
          <small>{activeMedia.label}</small>
        </span>
        <button
          aria-label="Next product view"
          onClick={() => moveTo(activeIndex + 1)}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>
      </div>

      <dialog
        aria-label={`${product.name} expanded image viewer`}
        className="shop-media-dialog"
        onClose={syncRailAfterViewer}
        onKeyDown={handleViewerKeys}
        ref={dialogRef}
      >
        <button
          aria-label="Close image viewer"
          className="shop-media-dialog-close"
          onClick={() => dialogRef.current?.close()}
          type="button"
        >
          <X aria-hidden="true" size={23} strokeWidth={1.6} />
        </button>
        <button
          aria-label="Previous product view"
          className="shop-media-dialog-nav is-previous"
          onClick={() => setActiveIndex((current) => nextIndex(current, -1, media.length))}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={28} strokeWidth={1.5} />
        </button>
        <figure>
          <img
            alt={activeMedia.alt}
            height={activeMedia.height}
            src={activeMedia.src}
            style={{ objectPosition: activeMedia.objectPosition ?? "50% 50%" }}
            width={activeMedia.width}
          />
          <figcaption>
            <span>{activeIndex + 1} / {media.length}</span>
            <strong>{activeMedia.label}</strong>
          </figcaption>
        </figure>
        <button
          aria-label="Next product view"
          className="shop-media-dialog-nav is-next"
          onClick={() => setActiveIndex((current) => nextIndex(current, 1, media.length))}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={28} strokeWidth={1.5} />
        </button>
      </dialog>
    </section>
  );
}
