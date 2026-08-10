"use client";

import { useEffect, useState } from "react";
import type { GeocoderProps } from "@mapbox/search-js-react/dist/components/Geocoder";

type GeocoderComponent = typeof import("@mapbox/search-js-react")["Geocoder"];

export function MapboxGeocoder(props: GeocoderProps) {
  const [Geocoder, setGeocoder] = useState<GeocoderComponent | null>(null);

  useEffect(() => {
    let active = true;
    void import("@mapbox/search-js-react").then((module) => {
      if (active) setGeocoder(() => module.Geocoder);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!Geocoder) return <div aria-hidden="true" className="shop-location-search-loading" />;
  return <Geocoder {...props} />;
}
