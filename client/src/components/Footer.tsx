export function Footer() {
  return (
    <footer className="py-12 text-center border-t border-zinc-800">
      <a
        href="https://skatehubba.store/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block mb-4 text-sm font-semibold tracking-widest uppercase text-[#ff6a00] hover:text-[#ff6a00]/80 transition-colors"
      >
        Shop Merch
      </a>
      <p className="text-gray-500 text-sm tracking-widest uppercase">
        &copy; {new Date().getFullYear()} SkateHubba
      </p>
    </footer>
  );
}
