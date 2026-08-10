import type { Metadata } from "next";
import { ShopAccount } from "../../../components/shop/shop-account";

export const metadata: Metadata = {
  title: "Account & app",
  description: "Manage shopping activity and app installation.",
};

export default function ShopAccountPage() {
  return <ShopAccount />;
}
