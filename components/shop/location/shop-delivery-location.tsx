"use client";

import type { GeocoderProps } from "@mapbox/search-js-react/dist/components/Geocoder";
import { useMemo, useState } from "react";
import { useTheme } from "../../theme/theme-provider";
import { MapboxGeocoder } from "./mapbox-geocoder";
import { ShopMapPreview, type ShopLocationCoordinates } from "./shop-map-preview";
import type { ShopDeliveryId } from "../../../lib/shop/domain/entities";

type GeocodingFeature = Parameters<NonNullable<GeocoderProps["onRetrieve"]>>[0];

export interface DeliveryAddressDraft {
  street: string;
  area: string;
  state: string;
}

function contextName(feature: GeocodingFeature, key: "locality" | "place" | "district" | "region") {
  return feature.properties.context?.[key]?.name ?? "";
}

export function ShopDeliveryLocation({
  accessToken,
  address,
  deliveryId,
  disabled = false,
  onAddressChange,
}: {
  accessToken: string;
  address: DeliveryAddressDraft;
  deliveryId: Exclude<ShopDeliveryId, "pickup">;
  disabled?: boolean;
  onAddressChange(address: DeliveryAddressDraft): void;
}) {
  const [coordinates, setCoordinates] = useState<ShopLocationCoordinates | null>(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [searchNotice, setSearchNotice] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const { resolvedTheme } = useTheme();
  const hasMapbox = accessToken.startsWith("pk.");

  const geocoderTheme = useMemo(() => ({
    variables: {
      border: "none",
      borderRadius: "16px",
      boxShadow: resolvedTheme === "dark"
        ? "0 18px 44px rgba(0, 0, 0, .24)"
        : "0 18px 44px rgba(91, 54, 39, .10)",
      colorBackground: resolvedTheme === "dark" ? "#2b201c" : "#fffdf9",
      colorBackgroundActive: resolvedTheme === "dark" ? "#4a3128" : "#f5c4b5",
      colorBackgroundHover: resolvedTheme === "dark" ? "#3a2923" : "#fdf1ea",
      colorPrimary: resolvedTheme === "dark" ? "#ff9d86" : "#a33e2b",
      colorSecondary: resolvedTheme === "dark" ? "#cfbbb1" : "#74615a",
      colorText: resolvedTheme === "dark" ? "#fff6f1" : "#2d211d",
      duration: "160ms",
      fontFamily: "var(--font-ui)",
      lineHeight: "1.45",
      minWidth: "0px",
      unit: "15px",
    },
  }), [resolvedTheme]);

  function updateAddress(field: keyof DeliveryAddressDraft, value: string) {
    onAddressChange({ ...address, [field]: value });
    setCoordinates(null);
    setLocationLabel("");
  }

  function selectLocation(feature: GeocodingFeature) {
    const [longitude, latitude] = feature.geometry.coordinates;
    const fullAddress = feature.properties.full_address
      || [feature.properties.name, feature.properties.place_formatted].filter(Boolean).join(", ");
    const area = contextName(feature, "locality")
      || contextName(feature, "place")
      || contextName(feature, "district");
    const state = contextName(feature, "region");

    onAddressChange({
      street: feature.properties.name || fullAddress,
      area,
      state,
    });
    setCoordinates({ latitude, longitude });
    setLocationLabel(fullAddress);
    setSearchNotice("Delivery point selected.");
  }

  return (
    <div className="shop-location-fields">
      {hasMapbox ? (
        <div className="shop-location-search">
          <span className="shop-field-label">Find your delivery point</span>
          <MapboxGeocoder
            accessToken={accessToken}
            interceptSearch={(value) => value.trim().length >= 3 ? value : ""}
            onChange={setSearchValue}
            onClear={() => {
              setSearchValue("");
              setCoordinates(null);
              setLocationLabel("");
            }}
            onRetrieve={selectLocation}
            onSuggestError={() => setSearchNotice("Enter the address below to continue.")}
            options={{
              country: "ng",
              language: "en",
              limit: 5,
              permanent: false,
              types: new Set(["address", "street", "neighborhood", "locality", "place"]),
            }}
            placeholder={deliveryId === "lagos"
              ? "Search a Lagos address or landmark"
              : "Search an address or landmark in Nigeria"}
            popoverOptions={{ flip: true, offset: 7, placement: "bottom-start" }}
            theme={geocoderTheme}
            value={searchValue}
          />
          <span className="sr-only" aria-live="polite" role="status">{searchNotice}</span>
        </div>
      ) : null}

      {coordinates && hasMapbox ? (
        <ShopMapPreview
          accessToken={accessToken}
          coordinates={coordinates}
          label={locationLabel}
        />
      ) : null}

      <div className="shop-form-grid shop-address-grid">
        <label className="shop-form-wide">
          <span>Street address</span>
          <input
            autoComplete="street-address"
            disabled={disabled}
            name="address"
            onChange={(event) => updateAddress("street", event.target.value)}
            required
            value={address.street}
          />
        </label>
        <label>
          <span>Area or city</span>
          <input
            autoComplete="address-level2"
            disabled={disabled}
            name="area"
            onChange={(event) => updateAddress("area", event.target.value)}
            required
            value={address.area}
          />
        </label>
        <label>
          <span>State</span>
          <input
            autoComplete="address-level1"
            disabled={disabled}
            name="state"
            onChange={(event) => updateAddress("state", event.target.value)}
            required
            value={address.state}
          />
        </label>
      </div>
    </div>
  );
}
