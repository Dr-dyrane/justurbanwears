export const shopFocusTransitionScript = String.raw`(() => {
  const storageKey = "justurban-wears.product-focus";
  const productPattern = /^\/shop\/products\/([^/?#]+)/;
  const browsePaths = new Set(["/shop", "/shop/search", "/shop/saved"]);

  function urlPath(value) {
    try {
      return new URL(value, window.location.href).pathname;
    } catch {
      return "";
    }
  }

  function productSlug(value) {
    const match = productPattern.exec(urlPath(value));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function isBrowseRoute(value) {
    return browsePaths.has(urlPath(value));
  }

  function transitionName(slug) {
    return "juw-product-" + slug.replace(/[^a-zA-Z0-9_-]/g, "-");
  }

  function productElement(slug) {
    return document.querySelector(
      '[data-product-transition="' + CSS.escape(slug) + '"]',
    );
  }

  function retainNameForSnapshot(slug, transition, phase) {
    const element = productElement(slug);
    if (!(element instanceof HTMLElement)) return false;

    element.style.viewTransitionName = transitionName(slug);
    const snapshot = phase === "incoming" ? transition.ready : transition.finished;
    Promise.resolve(snapshot)
      .finally(() => {
        element.style.viewTransitionName = "";
      })
      .catch(() => {});
    return true;
  }

  function remember(slug) {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ slug }));
    } catch {
      // The transition remains a progressive enhancement when storage is unavailable.
    }
  }

  function recall() {
    try {
      const raw = sessionStorage.getItem(storageKey);
      sessionStorage.removeItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed.slug === "string" ? parsed.slug : null;
    } catch {
      return null;
    }
  }

  addEventListener("pageswap", (event) => {
    const transition = event.viewTransition;
    const destination = event.activation && event.activation.entry
      ? event.activation.entry.url
      : null;
    if (!transition || !destination) return;

    const currentSlug = productSlug(window.location.href);
    const destinationSlug = productSlug(destination);
    const slug = destinationSlug || (currentSlug && isBrowseRoute(destination) ? currentSlug : null);

    if (!slug || !retainNameForSnapshot(slug, transition, "outgoing")) {
      transition.skipTransition();
      return;
    }
    remember(slug);
  });

  addEventListener("pagereveal", (event) => {
    const transition = event.viewTransition;
    if (!transition) return;

    const slug = recall();
    if (!slug) {
      transition.skipTransition();
      return;
    }

    const currentSlug = productSlug(window.location.href);
    if (currentSlug !== slug && !isBrowseRoute(window.location.href)) {
      transition.skipTransition();
      return;
    }
    if (!retainNameForSnapshot(slug, transition, "incoming")) {
      transition.skipTransition();
    }
  });
})();
`;
