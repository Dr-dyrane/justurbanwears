"use client";

import {
  Bell,
  ChevronRight,
  CloudOff,
  Heart,
  Package,
  Store,
  SunMoon,
  UserRound,
  Wifi,
} from "lucide-react";
import { PwaInstallControl } from "../pwa/pwa-install-control";
import { ThemeSettings } from "../theme/theme-settings";
import { ShopLink as Link } from "./atoms/shop-link";
import {
  type ShopNotificationPreference,
  useShop,
} from "./shop-provider";
import { ShopSwitchControl } from "./atoms/switch-control";

const notificationRows: Array<{
  id: ShopNotificationPreference;
  label: string;
  note: string;
}> = [
  {
    id: "delivery",
    label: "Order updates",
    note: "Delivery and status messages",
  },
  {
    id: "saved",
    label: "Saved-piece changes",
    note: "Availability alerts",
  },
  {
    id: "drops",
    label: "New edit alerts",
    note: "Fresh finds and new arrivals",
  },
];

export function ShopAccount() {
  const {
    following,
    isOnline,
    notificationPreferences,
    orders,
    persistence,
    saved,
    toggleFollowing,
    toggleNotificationPreference,
  } = useShop();

  return (
    <div className="shop-list-page shop-account-page">
      <header className="shop-list-heading">
        <p className="shop-kicker">Account & app</p>
        <h1>Your shopping space.</h1>
      </header>

      <section className="shop-account-status" aria-label="Account status">
        <span aria-hidden="true"><UserRound size={25} strokeWidth={1.65} /></span>
        <div>
          <small>Current mode</small>
          <strong>Guest</strong>
          <p>{persistence === "available" ? "Saved on this device." : "In memory for this visit."}</p>
        </div>
        <p className={isOnline ? "is-online" : "is-offline"}>
          {isOnline ? <Wifi aria-hidden="true" size={15} /> : <CloudOff aria-hidden="true" size={15} />}
          {isOnline ? "Online" : "Offline"}
        </p>
      </section>

      <div className="shop-account-grid">
        <section className="shop-account-section" aria-labelledby="shopping-space-title">
          <div className="shop-account-section-heading">
            <span aria-hidden="true"><Heart size={19} strokeWidth={1.75} /></span>
            <div><p className="shop-kicker">Shopping</p><h2 id="shopping-space-title">Your local activity</h2></div>
          </div>
          <div className="shop-account-links">
            <Link href="/shop/saved">
              <span><Heart aria-hidden="true" size={18} strokeWidth={1.7} /><span><strong>Saved pieces</strong><small>{saved.length} saved</small></span></span>
              <ChevronRight aria-hidden="true" size={17} />
            </Link>
            <Link href="/shop/orders">
              <span><Package aria-hidden="true" size={18} strokeWidth={1.7} /><span><strong>Orders</strong><small>{orders.length} {orders.length === 1 ? "order" : "orders"}</small></span></span>
              <ChevronRight aria-hidden="true" size={17} />
            </Link>
            <ShopSwitchControl
              checked={following}
              description="Saved on this device"
              icon={<Store aria-hidden="true" size={18} strokeWidth={1.7} />}
              label={following ? "Following justurban wears" : "Follow justurban wears"}
              onCheckedChange={toggleFollowing}
            />
          </div>
        </section>

        <section className="shop-account-section" aria-labelledby="notification-title">
          <div className="shop-account-section-heading">
            <span aria-hidden="true"><Bell size={19} strokeWidth={1.75} /></span>
            <div><p className="shop-kicker">Notifications</p><h2 id="notification-title">Choose the useful signals</h2></div>
          </div>
          <p className="shop-account-disclosure">
            Preferences only; no messages are sent.
          </p>
          <div className="shop-account-toggles">
            {notificationRows.map((row) => (
              <ShopSwitchControl
                checked={notificationPreferences[row.id]}
                description={row.note}
                key={row.id}
                label={row.label}
                onCheckedChange={() => toggleNotificationPreference(row.id)}
              />
            ))}
          </div>
        </section>

        <section className="shop-account-section" aria-labelledby="appearance-title">
          <div className="shop-account-section-heading">
            <span aria-hidden="true"><SunMoon size={19} strokeWidth={1.75} /></span>
            <div><p className="shop-kicker">Appearance</p><h2 id="appearance-title">Set the atmosphere</h2></div>
          </div>
          <ThemeSettings />
        </section>

        <section className="shop-account-section shop-install-section" aria-labelledby="install-title">
          <div className="shop-account-section-heading">
            <span aria-hidden="true"><Store size={19} strokeWidth={1.75} /></span>
            <div><p className="shop-kicker">App</p><h2 id="install-title">Keep the edit close</h2></div>
          </div>
          <PwaInstallControl />
        </section>
      </div>
    </div>
  );
}
