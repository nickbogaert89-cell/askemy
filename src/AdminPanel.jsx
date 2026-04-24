import { useEffect, useRef, useState } from "react";
import { auth, db, ADMIN_EMAIL } from "./firebase";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection, doc, getDoc, setDoc, query, orderBy, onSnapshot,
  serverTimestamp, deleteDoc
} from "firebase/firestore";

// Must stay in sync with DEFAULT_COPY in emy-website.jsx (source of truth on public site).
const DEFAULT_COPY = {
  greeting: "How do you want me to get in touch with you?",
  taglineLine1: "Personal Concierge",
  taglineLine2: "Lifestyle Management",
  labelWhere: "Where is Emy.",
  labelTalk: "Talk to Emy.",
  labelAbout: "About Emy.",
  aboutP1: "Some things are better handled by someone who actually knows you.",
  aboutP2: "I am one person. One direct line. Whether it's a flight changed at midnight, a last-minute birthday, a safari, a sold-out concert, or the thing you'd rather not run past anyone else, I handle it. Personally. Discreetly. Without you having to explain twice.",
  aboutP3: "Over time, I learn your life. That's the whole point.",
  price: "— €150 / month",
};

const input = {
  background: "transparent",
  border: "1px solid rgba(0,0,0,0.22)",
  color: "#000",
  fontFamily: "inherit", fontSize: 14,
  padding: "10px 12px", outline: "none",
  letterSpacing: "0.01em",
};
const btn = {
  background: "transparent",
  color: "#000",
  border: "1px solid rgba(0,0,0,0.55)",
  padding: "10px 18px",
  fontFamily: "inherit", fontSize: 11,
  letterSpacing: "0.24em", textTransform: "uppercase",
  cursor: "pointer", fontWeight: 700,
};
const labelSm = {
  fontSize: 11, letterSpacing: "0.28em", textTransform: "uppercase",
  color: "rgba(0,0,0,0.7)", fontWeight: 700, marginBottom: 14,
};

function CopyField({ label, value, onChange, multiline, flex }) {
  const wrap = {
    display: "flex", flexDirection: "column", gap: 6,
    marginBottom: 18,
    ...(flex ? { flex: "1 1 200px" } : {}),
  };
  const lbl = {
    fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase",
    color: "rgba(0,0,0,0.55)", fontWeight: 700,
  };
  return (
    <div style={wrap}>
      <label style={lbl}>{label}</label>
      {multiline ? (
        <textarea value={value || ""} onChange={e => onChange(e.target.value)}
          rows={3}
          style={{ ...input, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }}/>
      ) : (
        <input value={value || ""} onChange={e => onChange(e.target.value)}
          style={input}/>
      )}
    </div>
  );
}

function Shell({ children }) {
  return (
    <div style={{
      background:"#fff", minHeight:"100vh", color:"#000",
      fontFamily:"'Space Mono','Courier New',monospace",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{background:#fff;}
        input::placeholder{color:rgba(0,0,0,0.35);}
        ::-webkit-scrollbar{width:0;}
      `}</style>
      <div style={{ maxWidth:780, margin:"0 auto", padding:"48px 28px 96px" }}>{children}</div>
    </div>
  );
}

export default function AdminPanel() {
  const [user, setUser]       = useState(null);
  const [checking, setCheck]  = useState(true);
  const [pw, setPw]           = useState("");
  const [err, setErr]         = useState("");
  const [busy, setBusy]       = useState(false);

  const [current, setCurrent] = useState({ city: "", country: "" });
  const [trail, setTrail]     = useState([]);
  const originalCurrentRef    = useRef({ city: "", country: "" });
  const [locSaving, setLocSaving] = useState(false);
  const [locStatus, setLocStatus] = useState("");
  const [requests, setRequests]   = useState([]);
  const [openId, setOpenId]       = useState(null);

  const [copy, setCopy] = useState(DEFAULT_COPY);
  const [copySaving, setCopySaving] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setCheck(false); });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const s = await getDoc(doc(db, "meta", "current"));
        if (s.exists()) {
          const d = s.data();
          const loaded = { city: d.city || "", country: d.country || "" };
          setCurrent(loaded);
          originalCurrentRef.current = loaded;
          setTrail(Array.isArray(d.trail) ? d.trail : []);
        }
      } catch (e) { console.warn(e); }
      try {
        const s = await getDoc(doc(db, "meta", "copy"));
        if (s.exists()) setCopy({ ...DEFAULT_COPY, ...s.data() });
      } catch (e) { console.warn(e); }
    })();
    const q = query(collection(db, "requests"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => { console.warn("requests read failed:", e?.message); });
    return () => unsub();
  }, [user]);

  async function login(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, pw);
    } catch (e) {
      setErr(e.code === "auth/invalid-credential" || e.code === "auth/wrong-password"
        ? "wrong password"
        : (e.message || "login failed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveLocation() {
    setLocSaving(true); setLocStatus("");
    try {
      const newCity = current.city.trim();
      const newCountry = current.country.trim();
      const orig = originalCurrentRef.current;
      let nextTrail = trail
        .map(t => ({ city: (t.city||"").trim(), country: (t.country||"").trim() }))
        .filter(t => t.city);

      // Auto-archive: if city/country changed from what we loaded, push the OLD
      // current to the front of the trail. Nothing ever gets lost.
      const changed = orig.city && (orig.city !== newCity || orig.country !== newCountry);
      if (changed && newCity) {
        nextTrail = [{ city: orig.city, country: orig.country }, ...nextTrail];
      }

      await setDoc(doc(db, "meta", "current"), {
        city: newCity,
        country: newCountry,
        trail: nextTrail,
        updatedAt: serverTimestamp(),
      });

      // Reset baseline so a second save doesn't re-archive.
      originalCurrentRef.current = { city: newCity, country: newCountry };
      setTrail(nextTrail);
      setLocStatus(changed ? "saved · moved previous city into history" : "saved");
      setTimeout(() => setLocStatus(""), 2400);
    } catch (e) {
      setLocStatus(e.message || "save failed");
    } finally {
      setLocSaving(false);
    }
  }

  async function saveCopy() {
    setCopySaving(true); setCopyStatus("");
    try {
      const payload = Object.fromEntries(
        Object.entries(copy).map(([k, v]) => [k, typeof v === "string" ? v : ""])
      );
      payload.updatedAt = serverTimestamp();
      await setDoc(doc(db, "meta", "copy"), payload);
      setCopyStatus("saved");
      setTimeout(() => setCopyStatus(""), 1800);
    } catch (e) {
      setCopyStatus(e.message || "save failed");
    } finally {
      setCopySaving(false);
    }
  }

  function resetCopy() {
    setCopy(DEFAULT_COPY);
  }

  async function remove(id) {
    if (!window.confirm("Delete this request?")) return;
    await deleteDoc(doc(db, "requests", id));
  }

  if (checking) return <Shell><div style={{ color:"rgba(0,0,0,0.4)" }}>…</div></Shell>;

  if (!user) {
    return (
      <Shell>
        <div style={{ ...labelSm, marginBottom: 32 }}>admin</div>
        <form onSubmit={login} style={{ display:"flex", flexDirection:"column", gap:14, maxWidth: 340 }}>
          <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="password" required style={input}/>
          <button type="submit" disabled={busy||!pw} style={{ ...btn, opacity: pw&&!busy?1:0.4 }}>
            {busy ? "…" : "enter"}
          </button>
          {err && <div style={{ fontSize:11, color:"#a00", letterSpacing:"0.08em" }}>{err}</div>}
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 48 }}>
        <div style={labelSm}>admin</div>
        <button onClick={async () => {
          await signOut(auth);
          // Navigate back to the public homepage.
          window.location.hash = "";
        }} style={{ ...btn, padding:"6px 12px", fontSize:10 }}>out</button>
      </div>

      {/* Location */}
      <section style={{ marginBottom: 64 }}>
        <div style={labelSm}>current location</div>
        <div style={{ display:"flex", gap:12, marginBottom: 10, flexWrap:"wrap" }}>
          <input value={current.city} onChange={e=>setCurrent({...current, city:e.target.value})} placeholder="city" style={{ ...input, flex:"1 1 180px" }}/>
          <input value={current.country} onChange={e=>setCurrent({...current, country:e.target.value})} placeholder="country" style={{ ...input, flex:"1 1 180px" }}/>
        </div>

        <div style={{ ...labelSm, marginTop: 32, marginBottom: 6 }}>previous (newest first)</div>
        <div style={{ fontSize:11, color:"rgba(0,0,0,0.5)", marginBottom:12, lineHeight:1.5 }}>
          When you change the current city and save, the old one moves here automatically. Nothing is deleted from the database.
        </div>
        {trail.map((t, i) => (
          <div key={i} style={{ display:"flex", gap:10, marginBottom: 8, alignItems:"center" }}>
            <input value={t.city||""} onChange={e=>{ const n=[...trail]; n[i]={...n[i], city:e.target.value}; setTrail(n); }} placeholder="city" style={{ ...input, flex:"1 1 160px" }}/>
            <input value={t.country||""} onChange={e=>{ const n=[...trail]; n[i]={...n[i], country:e.target.value}; setTrail(n); }} placeholder="country" style={{ ...input, flex:"1 1 160px" }}/>
            <button onClick={()=>setTrail(trail.filter((_,j)=>j!==i))} style={{ ...btn, padding:"8px 10px", fontSize:12 }}>×</button>
          </div>
        ))}
        <button onClick={()=>setTrail([...trail, { city:"", country:"" }])} style={{ ...btn, marginTop: 8 }}>
          + add manually
        </button>

        <div style={{ marginTop: 24, display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
          <button onClick={saveLocation} disabled={locSaving} style={btn}>
            {locSaving ? "saving…" : "save location"}
          </button>
          {locStatus && <span style={{ fontSize:11, color:"rgba(0,0,0,0.6)", letterSpacing:"0.08em" }}>{locStatus}</span>}
        </div>
      </section>

      {/* Site copy */}
      <section style={{ marginBottom: 64 }}>
        <div style={labelSm}>site copy</div>
        <div style={{ fontSize:11, color:"rgba(0,0,0,0.5)", marginBottom:18, lineHeight:1.5 }}>
          Leave any field blank to fall back to the default.
        </div>

        <CopyField label="Greeting (first message in chat)" value={copy.greeting}
          onChange={v => setCopy({ ...copy, greeting: v })} />

        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <CopyField label="Tagline line 1" value={copy.taglineLine1}
            onChange={v => setCopy({ ...copy, taglineLine1: v })} flex />
          <CopyField label="Tagline line 2" value={copy.taglineLine2}
            onChange={v => setCopy({ ...copy, taglineLine2: v })} flex />
        </div>

        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <CopyField label="Label · Where" value={copy.labelWhere}
            onChange={v => setCopy({ ...copy, labelWhere: v })} flex />
          <CopyField label="Label · Talk" value={copy.labelTalk}
            onChange={v => setCopy({ ...copy, labelTalk: v })} flex />
          <CopyField label="Label · About" value={copy.labelAbout}
            onChange={v => setCopy({ ...copy, labelAbout: v })} flex />
        </div>

        <CopyField label="About · paragraph 1" value={copy.aboutP1} multiline
          onChange={v => setCopy({ ...copy, aboutP1: v })} />
        <CopyField label="About · paragraph 2" value={copy.aboutP2} multiline
          onChange={v => setCopy({ ...copy, aboutP2: v })} />
        <CopyField label="About · paragraph 3" value={copy.aboutP3} multiline
          onChange={v => setCopy({ ...copy, aboutP3: v })} />

        <CopyField label="Price line" value={copy.price}
          onChange={v => setCopy({ ...copy, price: v })} />

        <div style={{ marginTop: 20, display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
          <button onClick={saveCopy} disabled={copySaving} style={btn}>
            {copySaving ? "saving…" : "save copy"}
          </button>
          <button onClick={resetCopy} style={{ ...btn, borderColor:"rgba(0,0,0,0.25)", color:"rgba(0,0,0,0.6)" }}>
            reset to defaults
          </button>
          {copyStatus && <span style={{ fontSize:11, color:"rgba(0,0,0,0.6)", letterSpacing:"0.08em" }}>{copyStatus}</span>}
        </div>
      </section>

      {/* Requests */}
      <section>
        <div style={labelSm}>requests ({requests.length})</div>
        {requests.length === 0 && <div style={{ color:"rgba(0,0,0,0.45)", fontSize:13 }}>none yet</div>}
        {requests.map(r => {
          const open = openId === r.id;
          const ts   = r.createdAt?.toDate?.();
          const lastUser = [...(r.messages||[])].reverse().find(m => m.role==="user");
          return (
            <div key={r.id} style={{ padding:"16px 0", borderBottom:"1px solid rgba(0,0,0,0.12)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, cursor:"pointer" }} onClick={()=>setOpenId(open?null:r.id)}>
                <span style={{ fontSize:10, letterSpacing:"0.2em", textTransform:"uppercase", color:"rgba(0,0,0,0.55)", minWidth: 48, fontWeight: 700 }}>
                  {r.method || (r.completed ? "done" : "open")}
                </span>
                <span style={{ fontSize:14, color: r.contact ? "#000" : "rgba(0,0,0,0.55)", flex: 1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {r.contact || (lastUser?.text ? `“${lastUser.text.slice(0,60)}”` : "—")}
                </span>
                <span style={{ fontSize:10, color:"rgba(0,0,0,0.5)", letterSpacing:"0.06em" }}>
                  {ts ? ts.toLocaleString(undefined, { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }) : ""}
                </span>
                <button onClick={(e)=>{ e.stopPropagation(); remove(r.id); }} style={{ background:"transparent", border:"none", color:"rgba(0,0,0,0.45)", cursor:"pointer", fontSize:14, padding:"0 6px" }}>×</button>
              </div>
              {open && (
                <div style={{ marginTop:14, paddingLeft:60, borderLeft:"1px solid rgba(0,0,0,0.12)" }}>
                  {(r.messages||[]).map((m, i) => (
                    <div key={i} style={{ marginBottom:10, fontSize:13, lineHeight:1.6 }}>
                      <span style={{ fontSize:9, letterSpacing:"0.24em", textTransform:"uppercase", color:"rgba(0,0,0,0.5)", marginRight:10, fontWeight: 700 }}>{m.role}</span>
                      <span style={{ color: m.role==="user" ? "#000" : "rgba(0,0,0,0.72)" }}>{m.text}</span>
                    </div>
                  ))}
                  {r.when && (
                    <div style={{ marginTop: 12, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                      <span style={{ fontSize: 9, letterSpacing: "0.24em", textTransform: "uppercase", marginRight: 10, fontWeight: 700 }}>when</span>
                      <span>{r.when}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </Shell>
  );
}
