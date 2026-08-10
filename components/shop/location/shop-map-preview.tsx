"use client";

import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../../theme/theme-provider";

export interface ShopLocationCoordinates {
  latitude: number;
  longitude: number;
}

export function ShopMapPreview({
  accessToken,
  coordinates,
  label,
}: {
  accessToken: string;
  coordinates: ShopLocationCoordinates;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let map: import("mapbox-gl").Map | null = null;

    async function mountMap() {
      try {
        const mapboxgl = await import("mapbox-gl");
        if (disposed || !container) return;

        map = new mapboxgl.Map({
          accessToken,
          center: [coordinates.longitude, coordinates.latitude],
          config: {
            basemap: {
              lightPreset: resolvedTheme === "dark" ? "night" : "day",
              show3dObjects: false,
              showPointOfInterestLabels: false,
              showTransitLabels: false,
              theme: "monochrome",
            },
          },
          container,
          interactive: false,
          style: "mapbox://styles/mapbox/standard",
          zoom: 14.6,
        });

        new mapboxgl.Marker({ color: "#dd6042" })
          .setLngLat([coordinates.longitude, coordinates.latitude])
          .addTo(map);

        map.once("load", () => {
          if (!disposed) setFailed(false);
        });
      } catch {
        if (!disposed) setFailed(true);
      }
    }

    void mountMap();
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [accessToken, coordinates.latitude, coordinates.longitude, resolvedTheme]);

  return (
    <div className={`shop-location-preview${failed ? " is-fallback" : ""}`}>
      <div aria-hidden="true" className="shop-location-map" ref={containerRef} />
      <div className="shop-location-caption glass-surface">
        <MapPin aria-hidden="true" size={17} strokeWidth={1.9} />
        <span><small>Delivery point</small><strong>{label}</strong></span>
      </div>
    </div>
  );
}
