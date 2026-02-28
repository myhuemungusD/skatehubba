import { useEffect, useRef } from "react";

interface OrganizationData {
  name: string;
  url: string;
  logo: string;
  description: string;
  sameAs: string[];
}

interface WebApplicationData {
  name: string;
  url: string;
  description: string;
  applicationCategory: string;
  operatingSystem: string;
  offers: {
    price: string;
    priceCurrency: string;
  };
}

export function OrganizationStructuredData({ data }: { data: OrganizationData }) {
  const serialized = JSON.stringify(data);
  const prevRef = useRef(serialized);

  useEffect(() => {
    // Skip DOM update if data hasn't actually changed (prevents thrashing from unstable object refs)
    if (document.getElementById("org-structured-data") && prevRef.current === serialized) {
      return;
    }
    prevRef.current = serialized;

    const existing = document.getElementById("org-structured-data");
    if (existing) document.head.removeChild(existing);

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "org-structured-data";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: data.name,
      url: data.url,
      logo: data.logo,
      description: data.description,
      sameAs: data.sameAs,
    });

    document.head.appendChild(script);

    return () => {
      const el = document.getElementById("org-structured-data");
      if (el) document.head.removeChild(el);
    };
  }, [serialized, data]);

  return null;
}

export function WebAppStructuredData({ data }: { data: WebApplicationData }) {
  const serialized = JSON.stringify(data);
  const prevRef = useRef(serialized);

  useEffect(() => {
    // Skip DOM update if data hasn't actually changed (prevents thrashing from unstable object refs)
    if (document.getElementById("webapp-structured-data") && prevRef.current === serialized) {
      return;
    }
    prevRef.current = serialized;

    const existing = document.getElementById("webapp-structured-data");
    if (existing) document.head.removeChild(existing);

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "webapp-structured-data";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: data.name,
      url: data.url,
      description: data.description,
      applicationCategory: data.applicationCategory,
      operatingSystem: data.operatingSystem,
      offers: {
        "@type": "Offer",
        price: data.offers.price,
        priceCurrency: data.offers.priceCurrency,
      },
    });

    document.head.appendChild(script);

    return () => {
      const el = document.getElementById("webapp-structured-data");
      if (el) document.head.removeChild(el);
    };
  }, [serialized, data]);

  return null;
}
