import { useEffect, useState } from "react";

const PASSWORD = "askemy";
const STORAGE_KEY = "emy_gate_ok";

export default function PasswordGate({ children }) {
  const [ok, setOk] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === "1") {
      setOk(true);
      setReady(true);
      return;
    }
    const answer = window.prompt("password");
    if (answer === PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, "1");
      setOk(true);
    }
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!ok) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#000",
        color: "rgba(255,255,255,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Space Mono','Courier New',monospace",
        fontSize: 10,
        letterSpacing: "0.3em",
        textTransform: "uppercase",
      }}>
        access denied
      </div>
    );
  }
  return children;
}
