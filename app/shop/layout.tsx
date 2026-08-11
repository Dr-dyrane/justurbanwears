import { ShopShell } from "../../components/shop/shop-shell";
import { getServerShopProducts } from "../../lib/shop/server-catalog";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const products = await getServerShopProducts();
  return <ShopShell initialProducts={products}>{children}</ShopShell>;
}
