import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./emy-website.jsx";
import PasswordGate from "./PasswordGate.jsx";
import AdminPanel from "./AdminPanel.jsx";

function Root() {
  const [hash, setHash] = useState(typeof window !== "undefined" ? window.location.hash : "");
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (hash === "#/admin") return <AdminPanel />;
  return (
    <PasswordGate>
      <App />
    </PasswordGate>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
