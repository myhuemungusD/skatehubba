import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const container =
  document.getElementById("root") ||
  (() => {
    const el = document.createElement("div");
    el.id = "root";
    document.body.appendChild(el);
    return el;
  })();

createRoot(container).render(<App />);