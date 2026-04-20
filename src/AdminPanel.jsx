import { useEffect, useState } from "react";
import { auth, db, ADMIN_EMAIL } from "./firebase";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection, doc, getDoc, setDoc, query, orderBy, onSnapshot,
  serverTimestamp, deleteDoc
} from "firebase/firestore";

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
  const [locSaving, setLocSaving] = useState(false);
  const [locStatus, setLocStatus] = useState("");
  const [requests, setRequests]   = useState([]);
  const [openId, setOpenId]       = useState(null);

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
          setCurrent({ city: d.city || "", country: d.country || "" });
          setTrail(Array.isArray(d.trail) ? d.trail : []);
        }
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
      await setDoc(doc(db, "meta", "current"), {
        city: current.city.trim(),
        country: current.country.trim(),
        trail: trail
          .map(t => ({ city: (t.city||"").trim(), country: (t.country||"").trim() }))
          .filter(t => t.city),
        updatedAt: serverTimestamp(),
      });
      setLocStatus("saved");
      setTimeout(() => setLocStatus(""), 1800);
    } catch (e) {
      setLocStatus(e.message || "save failed");
    } finally {
      setLocSaving(false);
    }
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
        <button onClick={() => signOut(auth)} style={{ ...btn, padding:"6px 12px", fontSize:10 }}>out</button>
      </div>

      {/* Location */}
      <section style={{ marginBottom: 64 }}>
        <div style={labelSm}>current location</div>
        <div style={{ display:"flex", gap:12, marginBottom: 10, flexWrap:"wrap" }}>
          <input value={current.city} onChange={e=>setCurrent({...current, city:e.target.value})} placeholder="city" style={{ ...input, flex:"1 1 180px" }}/>
          <input value={current.country} onChange={e=>setCurrent({...current, country:e.target.value})} placeholder="country" style={{ ...input, flex:"1 1 180px" }}/>
        </div>

        <div style={{ ...labelSm, marginTop: 32, marginBottom: 10 }}>previous (newest first, max 4)</div>
        {trail.map((t, i) => (
          <div key={i} style={{ display:"flex", gap:10, marginBottom: 8, alignItems:"center" }}>
            <input value={t.city||""} onChange={e=>{ const n=[...trail]; n[i]={...n[i], city:e.target.value}; setTrail(n); }} placeholder="city" style={{ ...input, flex:"1 1 160px" }}/>
            <input value={t.country||""} onChange={e=>{ const n=[...trail]; n[i]={...n[i], country:e.target.value}; setTrail(n); }} placeholder="country" style={{ ...input, flex:"1 1 160px" }}/>
            <button onClick={()=>setTrail(trail.filter((_,j)=>j!==i))} style={{ ...btn, padding:"8px 10px", fontSize:12 }}>×</button>
          </div>
        ))}
        {trail.length < 4 && (
          <button onClick={()=>setTrail([...trail, { city:"", country:"" }])} style={{ ...btn, marginTop: 8 }}>
            + add previous
          </button>
        )}

        <div style={{ marginTop: 24, display:"flex", alignItems:"center", gap:16 }}>
          <button onClick={saveLocation} disabled={locSaving} style={btn}>
            {locSaving ? "saving…" : "save"}
          </button>
          {locStatus && <span style={{ fontSize:11, color:"rgba(0,0,0,0.55)", letterSpacing:"0.1em" }}>{locStatus}</span>}
        </div>
      </section>

      {/* Requests */}
      <section>
        <div style={labelSm}>requests ({requests.length})</div>
        {requests.length === 0 && <div style={{ color:"rgba(255,255,255,0.35)", fontSize:13 }}>none yet</div>}
        {requests.map(r => {
          const open = openId === r.id;
          const ts   = r.createdAt?.toDate?.();
          const lastUser = [...(r.messages||[])].reverse().find(m => m.role==="user");
          return (
            <div key={r.id} style={{ padding:"16px 0", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, cursor:"pointer" }} onClick={()=>setOpenId(open?null:r.id)}>
                <span style={{ fontSize:10, letterSpacing:"0.2em", textTransform:"uppercase", color:"rgba(255,255,255,0.55)", minWidth: 48 }}>
                  {r.method || (r.completed ? "done" : "open")}
                </span>
                <span style={{ fontSize:14, color: r.contact ? "#fff" : "rgba(255,255,255,0.4)", flex: 1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {r.contact || (lastUser?.text ? `“${lastUser.text.slice(0,60)}”` : "—")}
                </span>
                <span style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:"0.06em" }}>
                  {ts ? ts.toLocaleString(undefined, { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }) : ""}
                </span>
                <button onClick={(e)=>{ e.stopPropagation(); remove(r.id); }} style={{ background:"transparent", border:"none", color:"rgba(255,255,255,0.35)", cursor:"pointer", fontSize:14, padding:"0 6px" }}>×</button>
              </div>
              {open && (
                <div style={{ marginTop:14, paddingLeft:60, borderLeft:"1px solid rgba(255,255,255,0.08)" }}>
                  {(r.messages||[]).map((m, i) => (
                    <div key={i} style={{ marginBottom:10, fontSize:13, lineHeight:1.6 }}>
                      <span style={{ fontSize:9, letterSpacing:"0.24em", textTransform:"uppercase", color:"rgba(255,255,255,0.35)", marginRight:10 }}>{m.role}</span>
                      <span style={{ color: m.role==="user" ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.7)" }}>{m.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </Shell>
  );
}
