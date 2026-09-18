import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App.tsx";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("The #root element is missing. The app cannot start without it.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
