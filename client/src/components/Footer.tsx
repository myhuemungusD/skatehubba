export function Footer() {
  return (
    <footer className="py-12 text-center border-t border-zinc-800">
      <p className="text-gray-500 text-sm tracking-widest uppercase">
        &copy; {new Date().getFullYear()} SkateHubba
      </p>
    </footer>
  );
}
