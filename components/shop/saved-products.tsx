"use client";

import { Heart } from "lucide-react";
import { ShopActionLink } from "./atoms/action";
import { ProductCard } from "./product-card";
import { useShop } from "./shop-provider";

export function SavedProducts() {
  const { products: catalog, saved } = useShop();
  const products = catalog.filter((product) => saved.includes(product.slug));

  return (
    <div className="shop-list-page">
      <header className="shop-list-heading">
        <p className="shop-kicker">Your shortlist</p>
        <h1>Saved for another look.</h1>
      </header>
      {products.length ? (
        <div className="shop-product-grid">{products.map((product) => <ProductCard key={product.slug} product={product} />)}</div>
      ) : (
        <div className="shop-route-empty">
          <span aria-hidden="true"><Heart size={34} strokeWidth={1.65} /></span>
          <h2>Nothing saved yet.</h2>
          <ShopActionLink href="/shop#discover">Browse the edit</ShopActionLink>
        </div>
      )}
    </div>
  );
}
