import type { Metadata } from "next";
import { ShopAccount } from "../../../components/shop/shop-account";
import { getShopCustomerSession } from "../../../lib/auth/customer";

export const metadata: Metadata = {
  title: "Account & app",
  description: "Manage shopping activity and app installation.",
};

export default async function ShopAccountPage() {
  const customer = await getShopCustomerSession();
  return <ShopAccount customer={customer} />;
}
