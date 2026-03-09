import { useMemo } from "react";
import { createPortal } from "react-dom";

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
  const jsonLd = useMemo(
    () =>
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: data.name,
        url: data.url,
        logo: data.logo,
        description: data.description,
        sameAs: data.sameAs,
      }),
    [data.name, data.url, data.logo, data.description, data.sameAs]
  );

  return createPortal(
    <script
      type="application/ld+json"
      id="org-structured-data"
      dangerouslySetInnerHTML={{ __html: jsonLd }}
    />,
    document.head
  );
}

export function WebAppStructuredData({ data }: { data: WebApplicationData }) {
  const jsonLd = useMemo(
    () =>
      JSON.stringify({
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
      }),
    [
      data.name,
      data.url,
      data.description,
      data.applicationCategory,
      data.operatingSystem,
      data.offers.price,
      data.offers.priceCurrency,
    ]
  );

  return createPortal(
    <script
      type="application/ld+json"
      id="webapp-structured-data"
      dangerouslySetInnerHTML={{ __html: jsonLd }}
    />,
    document.head
  );
}
