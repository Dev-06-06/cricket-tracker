import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ActiveGroupProvider } from "./context/ActiveGroupContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ActiveGroupProvider>
          <App />
        </ActiveGroupProvider>
      </AuthProvider>
    </BrowserRouter>
    <Analytics />
  </StrictMode>,
);
