import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { collection, addDoc, updateDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

const DEFAULT_LOCATIONS = [
  { city: "Valencia",  country: "Spain"      },
  { city: "Antwerp",   country: "Belgium"    },
  { city: "Cape Town", country: "S. Africa"  },
  { city: "Zanzibar",  country: "Tanzania"   },
  { city: "Lima",      country: "Peru"       },
  { city: "Lisbon",    country: "Portugal"   },
  { city: "Windhoek",  country: "Namibia"    },
  { city: "Berlin",    country: "Germany"    },
  { city: "Paris",     country: "France"     },
];
function trailOpacity(i, total) {
  if (i === 0) return 1;
  const rest = total - 1;
  if (rest <= 1) return 0.55;
  const start = 0.62, end = 0.14;
  return start + (end - start) * ((i - 1) / (rest - 1));
}

// Simple regex detection for email / phone
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const PHONE_RE = /(?:\+?\d[\d\s\-().]{6,}\d)/;
function extractContact(text) {
  const em = text.match(EMAIL_RE);
  if (em) return { contact: em[0], method: "email" };
  const ph = text.match(PHONE_RE);
  if (ph) return { contact: ph[0].replace(/\s+/g, " ").trim(), method: "phone" };
  return null;
}

const GREETING = "How do you want to connect?";

// ── Logo ──────────────────────────────────────────────────────────────────────
function Logo({ width = 210 }) {
  const LW=74,LH=60,LS=14,SW=6;
  const ex=0,mx=LW+LS,yx=2*(LW+LS);
  const ax=mx+LW/2,ay=LH*0.45,jx=yx+LW/2,jy=LH*0.48;
  const pxPos=yx+LW+LS,pSq=SW*1.9,tw=pxPos+pSq;
  const sc=width/tw,sp=SW*sc,pad=sp*1.2;
  const tx=u=>u*sc,ty=u=>(LH-u)*sc;
  const j={stroke:"#fff",strokeWidth:sp,fill:"none",strokeLinecap:"square",strokeLinejoin:"miter",strokeMiterlimit:10};
  return (
    <svg viewBox={`${-pad} ${-pad} ${tw*sc+pad*2} ${LH*sc+pad*2}`} width={width} style={{display:"block"}}>
      <polyline points={`${tx(ex+LW)},${ty(0)} ${tx(ex)},${ty(0)} ${tx(ex)},${ty(LH)} ${tx(ex+LW)},${ty(LH)}`} {...j}/>
      <line x1={tx(ex)} y1={ty(LH*.5)} x2={tx(ex+LW*.70)} y2={ty(LH*.5)} {...j}/>
      <polyline points={`${tx(mx)},${ty(0)} ${tx(mx)},${ty(LH)} ${tx(ax)},${ty(LH-ay)} ${tx(mx+LW)},${ty(LH)} ${tx(mx+LW)},${ty(0)}`} {...j}/>
      <polyline points={`${tx(yx)},${ty(0)} ${tx(jx)},${ty(jy)} ${tx(jx)},${ty(LH)}`} {...j}/>
      <line x1={tx(yx+LW)} y1={ty(0)} x2={tx(jx)} y2={ty(jy)} {...j}/>
      <rect x={tx(pxPos)} y={ty(LH)} width={pSq*sc} height={pSq*sc} fill="#fff"/>
    </svg>
  );
}

// ── Scroll fade ───────────────────────────────────────────────────────────────
function useInView() {
  const ref = useRef(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true); }, { threshold:0.08 });
    if (ref.current) o.observe(ref.current);
    return () => o.disconnect();
  }, []);
  return [ref, v];
}
function Section({ children, delay=0 }) {
  const [ref, v] = useInView();
  return (
    <div ref={ref} style={{ opacity:v?1:0, transform:v?"translateY(0)":"translateY(10px)", transition:`opacity 0.8s ease ${delay}s, transform 0.8s ease ${delay}s` }}>
      {children}
    </div>
  );
}
function Rule() {
  return <div style={{ height:0, margin:"40px 0 0" }}/>;
}
function Label({ children }) {
  return <div style={{ fontSize:11, letterSpacing:"0.28em", color:"rgba(255,255,255,0.72)", textTransform:"uppercase", marginBottom:28, fontWeight:700 }}>{children}</div>;
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function EmyChat() {
  const [messages, setMessages] = useState([{ role:"emy", text: GREETING, ts: Date.now() }]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const docIdRef  = useRef(null);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages, loading]);

  async function persist(allMessages, extra = {}) {
    try {
      const base = {
        messages: allMessages.map(m => ({ role:m.role, text:m.text, ts:m.ts })),
        updatedAt: serverTimestamp(),
        ...extra,
      };
      if (!docIdRef.current) {
        const ref = await addDoc(collection(db, "requests"), { ...base, createdAt: serverTimestamp() });
        docIdRef.current = ref.id;
      } else {
        await updateDoc(doc(db, "requests", docIdRef.current), base);
      }
    } catch (e) {
      console.warn("requests save failed:", e?.message || e);
    }
  }

  async function send() {
    if (!input.trim() || loading || done) return;
    const userText = input.trim();
    setInput("");
    const withUser = [...messages, { role:"user", text:userText, ts: Date.now() }];
    setMessages(withUser);
    setLoading(true);

    // Client-side bot logic: detect contact, else ask for it.
    const found = extractContact(userText);
    let botText, extras = {}, finished = false;
    if (found) {
      botText = found.method === "email"
        ? `Got it — ${found.contact}. Emy will be in touch.`
        : `Got it. Emy will be in touch. Stays between us.`;
      extras  = { contact: found.contact, method: found.method, completed: true };
      finished = true;
    } else {
      botText = "What's the best email or number to reach you?";
    }

    await new Promise(r => setTimeout(r, 450 + Math.random()*350));

    const all = [...withUser, { role:"emy", text:botText, ts: Date.now() }];
    setMessages(all);
    setLoading(false);
    if (finished) setDone(true);
    persist(all, extras);

    if (!finished) setTimeout(() => inputRef.current?.focus(), 40);
  }

  return (
    <div>
      {/* Messages */}
      <div style={{ marginBottom:24 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start", marginBottom:18 }}>
            <div style={{
              maxWidth:"88%",
              fontSize:16, lineHeight:1.75,
              color: m.role==="user" ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.82)",
              textAlign: m.role==="user" ? "right" : "left",
              letterSpacing:"0.01em",
            }}>
              {m.text}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div style={{ display:"flex", gap:5, padding:"4px 0" }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width:3, height:3, borderRadius:"50%", background:"rgba(255,255,255,0.3)", animation:"dotPulse 1.2s ease-in-out infinite", animationDelay:`${i*0.2}s` }}/>
            ))}
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      {!done ? (
        <div style={{ display:"flex", alignItems:"center", borderBottom:"1px solid rgba(255,255,255,0.14)", paddingBottom:10, gap:10 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key==="Enter" && send()}
            placeholder="type here..."
            disabled={loading}
            style={{
              flex:1, background:"transparent", border:"none", outline:"none",
              color:"rgba(255,255,255,0.95)", fontFamily:"inherit", fontSize:15,
              letterSpacing:"0.01em", caretColor:"rgba(255,255,255,0.6)",
            }}
          />
          <button onClick={send} disabled={loading||!input.trim()} style={{
            background:"transparent", border:"none",
            cursor:input.trim()&&!loading?"pointer":"default",
            color:"rgba(255,255,255,0.7)", fontSize:18,
            opacity:input.trim()&&!loading?1:0.25, transition:"opacity 0.15s",
            fontFamily:"inherit", padding:"0 2px",
          }}>→</button>
        </div>
      ) : (
        <div style={{ fontSize:9, letterSpacing:"0.3em", color:"rgba(255,255,255,0.22)", textTransform:"uppercase", paddingTop:4 }}>
          message received.
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [mounted, setMounted] = useState(false);
  const [locations, setLocations] = useState(DEFAULT_LOCATIONS);
  useEffect(() => { setTimeout(() => setMounted(true), 80); }, []);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "meta", "current"));
        if (snap.exists()) {
          const d = snap.data();
          const current = d.city ? [{ city: d.city, country: d.country || "" }] : [];
          const trail = Array.isArray(d.trail) ? d.trail : [];
          const combined = [...current, ...trail].slice(0, 10);
          if (combined.length) setLocations(combined);
        }
      } catch (e) {
        console.warn("location fetch failed:", e?.message || e);
      }
    })();
  }, []);

  return (
    <div className="emy-page" style={{ background:"#000", minHeight:"100vh", fontFamily:"'Space Mono','Courier New',monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{background:#000;}
        @keyframes logoIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        @keyframes blink{0%,100%{opacity:1;}50%{opacity:0.2;}}
        @keyframes dotPulse{0%,100%{opacity:0.15;}50%{opacity:0.65;}}
        input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.3);}
        ::-webkit-scrollbar{width:0;}
        ::selection{background:rgba(255,255,255,0.12);}

        /* mobile: stacked, content first then where */
        .emy-page{display:flex;flex-direction:column;}
        .emy-where-col{order:2;width:100%;}
        .emy-where-inner{max-width:480px;margin:0 auto;padding:0 28px 72px;}
        .emy-content-col{order:1;width:100%;}
        .emy-content-inner{max-width:480px;margin:0 auto;padding:56px 28px 56px;}

        @media (min-width: 900px) {
          .emy-page{
            display:grid;
            grid-template-columns:60vw 40vw;
            grid-template-areas:"where content";
          }
          .emy-where-col{order:unset;grid-area:where;height:100vh;position:sticky;top:0;align-self:start;display:flex;align-items:center;}
          .emy-where-inner{max-width:none;margin:0;padding:72px 72px;width:100%;}
          .emy-content-col{order:unset;grid-area:content;min-height:100vh;border-left:1px solid rgba(255,255,255,0.08);}
          .emy-content-inner{max-width:460px;margin:0;padding:72px 56px 120px;}
        }
      `}</style>

      {/* Left: Where is Emy (desktop sticky panel / mobile below content) */}
      <div className="emy-where-col">
        <div className="emy-where-inner">
          <Section delay={0.1}>
            <Label>Where is Emy.</Label>
            <div style={{ position:"relative" }}>
              <div style={{ position:"absolute", left:6, top:8, bottom:8, width:1, background:"linear-gradient(to bottom, rgba(255,255,255,0.28), rgba(255,255,255,0.02))" }}/>
              {locations.map((loc, i) => {
                const isCurrent = i===0;
                const op = trailOpacity(i, locations.length);
                return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:22, padding:"12px 0", opacity:op, borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
                    <div style={{
                      width:isCurrent?14:7, height:isCurrent?14:7, borderRadius:"50%",
                      border:`${isCurrent?"1.5px":"1px"} solid rgba(255,255,255,${isCurrent?0.9:0.38})`,
                      flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                      animation:isCurrent?"blink 3s ease-in-out infinite":"none",
                    }}>
                      {isCurrent && <div style={{ width:6, height:6, borderRadius:"50%", background:"#fff" }}/>}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:isCurrent?22:17, letterSpacing:"0.05em", color:"#fff", fontWeight:isCurrent?700:400 }}>{loc.city}</div>
                      {isCurrent && <div style={{ fontSize:10, letterSpacing:"0.26em", color:"rgba(255,255,255,0.55)", marginTop:5, textTransform:"uppercase" }}>{loc.country}</div>}
                    </div>
                    {isCurrent && <div style={{ fontSize:10, letterSpacing:"0.26em", color:"rgba(255,255,255,0.65)", border:"1px solid rgba(255,255,255,0.22)", padding:"5px 10px", fontWeight:700 }}>now</div>}
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      </div>

      {/* Right: Logo + about + reach + footer */}
      <div className="emy-content-col">
        <div className="emy-content-inner">

          {/* Logo */}
          <div style={{ marginBottom:48, opacity:mounted?1:0, animation:mounted?"logoIn 1s ease forwards":"none" }}>
            <Logo width={210}/>
          </div>

          <Rule/>

          {/* About */}
          <Section delay={0}>
            <Label>Personal Concierge<br/>Lifestyle Management</Label>
            <div style={{ fontSize:16, lineHeight:1.75, color:"rgba(255,255,255,0.92)" }}>
              <p style={{ marginBottom:22 }}>Some things are better handled by someone who actually knows you.</p>
              <p style={{ marginBottom:22 }}>Emy is one person. Direct line. She's there for the flight changed at midnight, the birthday, the safari, the thing you'd rather not run past anyone else.</p>
              <p>Over time she learns your life. That's the point.</p>
            </div>
            <div style={{ marginTop:32, fontSize:14, color:"rgba(255,255,255,0.82)", letterSpacing:"0.08em", fontWeight:700 }}>— €150 / month</div>
          </Section>

          <Rule/>

          {/* Reach Emy */}
          <Section delay={0.05}>
            <Label>Reach Emy.</Label>
            <EmyChat/>
          </Section>

          <Rule/>

          <div style={{ fontSize:10, letterSpacing:"0.3em", color:"rgba(255,255,255,0.28)", textTransform:"uppercase" }}>
            ask-emy.com
          </div>

        </div>
      </div>
    </div>
  );
}
