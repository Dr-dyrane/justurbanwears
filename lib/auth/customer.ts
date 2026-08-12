import { cache } from "react";
import { getNeonAuth } from "./neon";

export type ShopCustomerSession = {
  id: string;
  email: string;
  name: string;
};

export const getShopCustomerSession = cache(async (): Promise<ShopCustomerSession | null> => {
  if (!process.env.NEON_AUTH_BASE_URL || !process.env.NEON_AUTH_COOKIE_SECRET) return null;
  const { data } = await getNeonAuth().getSession();
  if (!data?.user?.id || !data.user.email) return null;
  return {
    id: data.user.id,
    email: data.user.email,
    name: data.user.name || data.user.email.split("@")[0],
  };
});
