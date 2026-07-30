import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import StatblockEditor from "./statblock-editor";
import "./globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StatblockEditor />
  </StrictMode>,
);
