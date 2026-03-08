import { ShoppingBag, ExternalLink } from "lucide-react";

const HUBBASHOP_URL = "https://skatehubba.store/";

export function HubbaShopBanner() {
  return (
    <section className="relative py-20 px-6" aria-label="HubbaShop merch">
      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <div className="rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-transparent to-amber-500/10 p-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-orange-500/10 border border-orange-500/20 mb-6">
            <ShoppingBag className="w-7 h-7 text-orange-500" aria-hidden="true" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">HubbaShop</h2>
          <p className="text-zinc-400 text-lg mb-8 max-w-lg mx-auto">
            Rep the brand. Grab exclusive SkateHubba merch — tees, stickers, and more.
          </p>
          <a
            href={HUBBASHOP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-black text-base font-bold uppercase tracking-wide px-8 py-4 rounded-xl shadow-[0_18px_60px_rgba(249,115,22,0.25)] transition-all hover:shadow-[0_24px_80px_rgba(249,115,22,0.4)] hover:scale-105"
            data-testid="cta-hubbashop"
          >
            Shop Now
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
