/**
 * Expo Config Plugin — Certificate Pinning
 *
 * Injects native certificate pinning configuration into both platforms:
 *
 * Android:
 *   Creates res/xml/network_security_config.xml with <pin-set> elements
 *   and references it from AndroidManifest.xml. Debug builds allow
 *   system/user-installed CAs for proxy debugging (Charles, mitmproxy).
 *
 * iOS:
 *   Adds NSPinnedDomains under NSAppTransportSecurity in Info.plist.
 *   Uses NSPinnedCAIdentities for CA-level pinning (more rotation-friendly
 *   than leaf pinning).
 *
 * Usage in app.config.js:
 *   ["./plugins/withCertificatePinning", {
 *     domains: [
 *       {
 *         hostname: "api.skatehubba.com",
 *         includeSubdomains: false,
 *         pins: ["base64hash1", "base64hash2"],
 *       }
 *     ],
 *     pinExpiration: "2027-06-01",
 *     allowDebugOverrides: true,
 *   }]
 *
 * @see https://developer.android.com/training/articles/security-config
 * @see https://developer.apple.com/documentation/bundleresources/information_property_list/nsapptransportsecurity/nspinneddomains
 */

const {
  withAndroidManifest,
  withInfoPlist,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Android: Network Security Configuration
// ---------------------------------------------------------------------------

/**
 * Generate the network_security_config.xml content.
 */
function generateNetworkSecurityXml(props) {
  const { domains = [], pinExpiration, allowDebugOverrides = false } = props;

  if (domains.length === 0) {
    // No domains to pin — generate a minimal config that just enforces HTTPS
    return [
      '<?xml version="1.0" encoding="utf-8"?>',
      "<network-security-config>",
      "    <base-config cleartextTrafficPermitted=\"false\">",
      "        <trust-anchors>",
      '            <certificates src="system" />',
      "        </trust-anchors>",
      "    </base-config>",
      "</network-security-config>",
    ].join("\n");
  }

  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<network-security-config>",
    "",
    "    <!-- Disallow cleartext (HTTP) traffic in production -->",
    '    <base-config cleartextTrafficPermitted="false">',
    "        <trust-anchors>",
    '            <certificates src="system" />',
    "        </trust-anchors>",
    "    </base-config>",
    "",
  ];

  // Domain-specific pin configurations
  for (const domain of domains) {
    const pins = Array.isArray(domain.pins) ? domain.pins : [];
    if (pins.length === 0) continue;

    lines.push("    <domain-config>");
    const subdomainAttr = domain.includeSubdomains
      ? ' includeSubdomains="true"'
      : ' includeSubdomains="false"';
    lines.push(
      `        <domain${subdomainAttr}>${escapeXml(domain.hostname)}</domain>`
    );

    // Pin set with expiration
    const expirationAttr = pinExpiration
      ? ` expiration="${escapeXml(pinExpiration)}"`
      : "";
    lines.push(`        <pin-set${expirationAttr}>`);

    for (const pin of pins) {
      lines.push(`            <pin digest="SHA-256">${escapeXml(pin)}</pin>`);
    }

    lines.push("        </pin-set>");
    lines.push("        <trust-anchors>");
    lines.push('            <certificates src="system" />');
    lines.push("        </trust-anchors>");
    lines.push("    </domain-config>");
    lines.push("");
  }

  // Debug overrides: allow user-installed CAs in debug builds
  // This is critical for development — without it, proxy tools like
  // Charles Proxy and mitmproxy cannot intercept HTTPS traffic.
  if (allowDebugOverrides) {
    lines.push("    <!-- Allow user-installed CAs in debug builds only -->");
    lines.push("    <debug-overrides>");
    lines.push("        <trust-anchors>");
    lines.push('            <certificates src="system" />');
    lines.push('            <certificates src="user" />');
    lines.push("        </trust-anchors>");
    lines.push("    </debug-overrides>");
    lines.push("");
  }

  lines.push("</network-security-config>");
  return lines.join("\n");
}

/**
 * Escape special XML characters.
 */
function escapeXml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Write the network_security_config.xml file to the Android project.
 */
function withAndroidNetworkSecurityFile(config, props) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const xmlDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml"
      );

      // Ensure the xml directory exists
      fs.mkdirSync(xmlDir, { recursive: true });

      const xmlContent = generateNetworkSecurityXml(props);
      const xmlPath = path.join(xmlDir, "network_security_config.xml");

      fs.writeFileSync(xmlPath, xmlContent, "utf8");

      return modConfig;
    },
  ]);
}

/**
 * Add the networkSecurityConfig attribute to AndroidManifest.xml.
 */
function withAndroidManifestNetworkConfig(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const application = manifest.application;

    if (!application || application.length === 0) {
      console.warn(
        "[withCertificatePinning] No <application> tag found in AndroidManifest.xml"
      );
      return modConfig;
    }

    // Set the networkSecurityConfig attribute on the <application> element
    const app = application[0];
    app.$ = app.$ || {};
    app.$["android:networkSecurityConfig"] =
      "@xml/network_security_config";

    return modConfig;
  });
}

// ---------------------------------------------------------------------------
// iOS: NSPinnedDomains in Info.plist
// ---------------------------------------------------------------------------

/**
 * Add NSPinnedDomains to Info.plist for iOS certificate pinning.
 *
 * Uses NSPinnedCAIdentities (CA-level) rather than NSPinnedLeafIdentities
 * (leaf-level) because CA pins survive leaf certificate rotation, which
 * happens frequently with automated certificate management (Let's Encrypt,
 * Cloudflare, etc.).
 */
function withIOSPinnedDomains(config, props) {
  return withInfoPlist(config, (modConfig) => {
    const { domains = [] } = props;

    if (domains.length === 0) {
      // No domains — just enforce ATS
      modConfig.modResults.NSAppTransportSecurity = {
        ...(modConfig.modResults.NSAppTransportSecurity || {}),
        NSAllowsArbitraryLoads: false,
      };
      return modConfig;
    }

    const pinnedDomains = {};

    for (const domain of domains) {
      const pins = Array.isArray(domain.pins) ? domain.pins : [];
      if (pins.length === 0) continue;

      pinnedDomains[domain.hostname] = {
        NSIncludesSubdomains: !!domain.includeSubdomains,
        // Use CA identities for rotation resilience.
        // If you need leaf pinning instead, change this key to
        // NSPinnedLeafIdentities.
        NSPinnedCAIdentities: pins.map((pin) => ({
          "SPKI-SHA256-BASE64": pin,
        })),
      };
    }

    // Merge into existing ATS config (preserve any existing settings)
    const existingATS = modConfig.modResults.NSAppTransportSecurity || {};
    modConfig.modResults.NSAppTransportSecurity = {
      ...existingATS,
      NSAllowsArbitraryLoads: false,
      NSPinnedDomains: {
        ...(existingATS.NSPinnedDomains || {}),
        ...pinnedDomains,
      },
    };

    return modConfig;
  });
}

// ---------------------------------------------------------------------------
// Plugin entry point
// ---------------------------------------------------------------------------

/**
 * @param {import('@expo/config-plugins').ExportedConfigWithProps} config
 * @param {{
 *   domains?: Array<{hostname: string; includeSubdomains?: boolean; pins: string[]}>;
 *   pinExpiration?: string;
 *   allowDebugOverrides?: boolean;
 * }} props
 */
function withCertificatePinning(config, props = {}) {
  const { domains = [], pinExpiration, allowDebugOverrides = true } = props;

  // Filter out domains with no pins (defensive)
  const validDomains = domains.filter(
    (d) => d.hostname && Array.isArray(d.pins) && d.pins.length > 0
  );

  const normalizedProps = {
    domains: validDomains,
    pinExpiration,
    allowDebugOverrides,
  };

  // Android: write network_security_config.xml + update manifest
  config = withAndroidNetworkSecurityFile(config, normalizedProps);
  config = withAndroidManifestNetworkConfig(config);

  // iOS: add NSPinnedDomains to Info.plist
  config = withIOSPinnedDomains(config, normalizedProps);

  if (validDomains.length > 0) {
    console.log(
      `[withCertificatePinning] Configured pinning for ${validDomains.length} domain(s): ` +
        validDomains.map((d) => d.hostname).join(", ")
    );
  } else {
    console.log(
      "[withCertificatePinning] No pin hashes provided — " +
        "native pinning disabled (HTTPS-only enforcement active)"
    );
  }

  return config;
}

module.exports = withCertificatePinning;
