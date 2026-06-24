import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { collection, addDoc, updateDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";

const DEFAULT_LOCATIONS = [
  { city: "Amsterdam", country: "Netherlands" },
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

// Extract email or phone number from any message
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const PHONE_RE = /(?:\+?\d[\d\s\-().]{6,}\d)/;
function extractContactInfo(text) {
  const em = text.match(EMAIL_RE);
  if (em) return { value: em[0], method: "email" };
  const ph = text.match(PHONE_RE);
  if (ph) return { value: ph[0].replace(/\s+/g, " ").trim(), method: "phone" };
  return null;
}

// Smart reply based on what the visitor said
function smartReply(userText, attemptCount) {
  const t = userText.toLowerCase();
  if (/prijs|price|cost|kost|hoeveel|how much|€|euro|fee|plan|membership|tarief|lid worden/.test(t))
    return "We have two membership plans — Solo at €175/month and Family at €245/month (excl. VAT). Both include fully personal, dedicated service. I'd love for Emy to tell you more — could I take your email address or phone number?";
  if (/restaurant|hotel|vlucht|flight|ticket|event|travel|reis|reis|sport|concert|arrange|reserv/.test(t))
    return "That's exactly what Emy is here for. From restaurant reservations to last-minute flights and sold-out events — she handles it all personally. What's the best way to reach you so she can follow up?";
  if (/who|wie|about emy|over emy|experience|background|aviation|achtergrond/.test(t))
    return "Emy spent ten years in private aviation, where she learned exactly what exceptional service looks like. She started EMY to bring that same level of care to people who expect more. Want to connect with her directly? Just share your email or phone.";
  if (/where|waar|antwerp|antwerpen|belgi|based|location/.test(t))
    return "Emy is based in Antwerp but works globally — wherever you need her. Could I take your contact details so she can reach out?";
  if (/how.*work|hoe.*werk|wat.*is|what.*is|explain|uitleg|more info|meer info/.test(t))
    return "EMY is a personal concierge membership — one dedicated contact who handles everything for you, whenever you need it. Think of it as always having the right person on the phone. I'd love to get you in touch with Emy directly — email or phone?";
  if (/\b(hi|hello|hey|hoi|hallo|goeie|dag|good)\b/.test(t))
    return "Hi! Great to hear from you. Feel free to ask me anything about EMY — or if you'd like Emy to reach out personally, just share your email or phone number.";
  if (attemptCount >= 2)
    return "I just need your email address or phone number and Emy will take it from there!";
  return "Thanks for reaching out! To make sure Emy can get back to you personally, could I take your email address or phone number?";
}

// Send collected conversation data to emy@ask-emy.com (FormSubmit – no backend needed)
async function sendToEmy(data) {
  try {
    await fetch("https://formsubmit.co/ajax/emy@ask-emy.com", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ _subject: "Nieuw contact via ask-emy.com", _captcha: "false", _template: "table", ...data }),
    });
  } catch (e) {
    console.warn("email send failed:", e?.message || e);
  }
}

// All site copy lives here. Edit these values to update the live site
// (commit + push → auto-deploys in ~30s). The admin panel no longer edits copy.
const DEFAULT_COPY = {
  greeting: "Hi! How can I help you today?",
  taglineLine1: "Lifestyle Membership",
  taglineLine2: "Lifestyle Management",
  labelWho: "Who is Emy.",
  whoPhoto: "/emy-who.jpg",
  whoP1: "My name is Emy. After ten years in private aviation, I know what is expected — and what it takes to deliver.",
  whoP2: "I understand the standards, the discretion, the details that matter.",
  whoP3: "That's why I started EMY — a Lifestyle Membership for people who expect more. Based in Antwerp. Connected globally.",
  labelWhere: "Where is Emy.",
  locationPhoto: "/emy-location.jpg",  // ← paste a photo URL here to show it in the Where section
  labelTalk: "Talk to Emy.",
  labelAbout: "About Emy.",
  aboutP1: "Some things are better left to someone who truly knows you.",
  aboutP2: "One dedicated contact. A flight rebooked at midnight. Last-minute tickets for a race or a sold-out show. Access where others are turned away.",
  aboutP3: "Personal. Discreet. And over time, effortless — because I learn your preferences, your standards, your life.",
  aboutP4: "Not a service. A relationship.",
  membershipTitle: "Membership",
  membershipSub: "Choose what fits your life.",
  membershipSolo: "Solo",
  membershipSoloPrice: "€ 175 / month excl. VAT",
  membershipSoloDesc: "For one person. Restaurants, hotels, events, travel, sport experiences, luxury products — arranged personally, whenever you need it.",
  membershipFamily: "Family",
  membershipFamilyPrice: "€ 245 / month excl. VAT",
  membershipFamilyDesc: "For partners and families. Holidays, weekend escapes, travel, sport events, luxury experiences — everything taken care of, for everyone who matters.",
  membershipCorporate: "Corporate & business memberships available on request.",
  membershipCta1: "Stop arranging. Start living.",
  membershipCta2: "Get in touch.",
  price: "",
};

// Emy's WhatsApp (stored so we can wire the real Cloud API later).
const WA_NUMBER_INTL = "+32471481010";

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
      <rect x={tx(pxPos)} y={ty(pSq)} width={pSq*sc} height={pSq*sc} fill="#fff"/>
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
  return <div style={{ fontSize:11, letterSpacing:"0.28em", color:"rgba(255,255,255,0.72)", textTransform:"uppercase", marginBottom:28, fontWeight:700, fontFamily:"'Space Mono','Courier New',monospace" }}>{children}</div>;
}

// ── Chat ──────────────────────────────────────────────────────────────────────
// Phases:
//   "collecting"   greeting shown, smart replies, keeps asking until email/phone found
//   "done"         contact captured, email sent to emy@ask-emy.com
function EmyChat({ greeting }) {
  const GREETING = greeting || DEFAULT_COPY.greeting;
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [phase, setPhase]       = useState("collecting");
  const attemptRef = useRef(0);
  const docIdRef   = useRef(null);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  useEffect(() => {
    setMessages([{ role:"emy", text: GREETING, ts: Date.now() }]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth", block:"nearest" });
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

  async function reply(withUser, botText, nextPhase, extra = {}) {
    await new Promise(r => setTimeout(r, 420 + Math.random()*280));
    const all = [...withUser, { role:"emy", text:botText, ts: Date.now() }];
    setMessages(all);
    setLoading(false);
    setPhase(nextPhase);
    persist(all, { phase: nextPhase, ...extra });
    setTimeout(() => inputRef.current?.focus(), 40);
  }

  async function send() {
    if (!input.trim() || loading || phase === "done") return;
    const userText = input.trim();
    setInput("");
    const withUser = [...messages, { role:"user", text:userText, ts: Date.now() }];
    setMessages(withUser);
    setLoading(true);

    // Check if this message contains an email or phone number
    const contact = extractContactInfo(userText);
    if (contact) {
      const transcript = withUser
        .map(m => `${m.role === "emy" ? "EMY" : "VISITOR"}: ${m.text}`)
        .join("\n");
      sendToEmy({
        "Contact": contact.value,
        "Method": contact.method,
        "Conversation": transcript,
      });
      await reply(withUser, "Perfect, got it! Emy will be in touch with you shortly.", "done", { contact: contact.value, method: contact.method, completed: true });
      return;
    }

    // No contact info yet — give a smart response and ask again
    attemptRef.current += 1;
    const botText = smartReply(userText, attemptRef.current);
    await reply(withUser, botText, "collecting", { attempt: attemptRef.current });
  }

  return (
    <div>
      {/* Messages */}
      <div style={{ marginBottom:22, display:"flex", flexDirection:"column", gap:22, maxHeight:260, overflowY:"auto" }}>
        {messages.map((m, i) => {
          const isUser = m.role === "user";
          return (
            <div key={i} style={{
              display:"flex", flexDirection:"column",
              alignItems: isUser ? "flex-end" : "flex-start",
              gap:6, animation:"msgIn 0.35s ease forwards",
            }}>
              <div style={{ fontSize:9, letterSpacing:"0.32em", color:"rgba(255,255,255,0.45)", textTransform:"uppercase", fontWeight:700 }}>
                {isUser ? "you" : "emy"}
              </div>
              <div style={{
                maxWidth:"88%", fontSize:15, lineHeight:1.7,
                color: isUser ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.62)",
                textAlign: isUser ? "right" : "left",
                letterSpacing:"0.01em",
              }}>
                {m.text}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {loading && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", gap:6 }}>
            <div style={{ fontSize:9, letterSpacing:"0.32em", color:"rgba(255,255,255,0.45)", textTransform:"uppercase", fontWeight:700 }}>emy</div>
            <div style={{ display:"flex", gap:5, padding:"6px 0" }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:3, height:3, borderRadius:"50%", background:"rgba(255,255,255,0.45)", animation:"dotPulse 1.2s ease-in-out infinite", animationDelay:`${i*0.2}s` }}/>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      {phase !== "done" ? (
        <div style={{ display:"flex", alignItems:"center", borderBottom:"1px solid rgba(255,255,255,0.14)", paddingBottom:10, gap:10 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key==="Enter" && send()}
            placeholder="type here"
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
        <div style={{ fontSize:9, letterSpacing:"0.3em", color:"rgba(255,255,255,0.32)", textTransform:"uppercase", paddingTop:6 }}>
          message received.
        </div>
      )}
    </div>
  );
}

// Hidden admin link: clicking the word "management" in the tagline navigates
// to #/admin. Styled identically to surrounding text — only cursor hints at it.
function renderWithAdminLink(text) {
  const goAdmin = (e) => { e?.preventDefault?.(); window.location.hash = "#/admin"; };
  const m = (text || "").match(/^(.*?)(\bmanagement\b)(.*)$/i);
  const linkStyle = { cursor: "pointer", color: "inherit", textDecoration: "none" };
  if (m) {
    const [, before, word, after] = m;
    return (
      <>
        {before}
        <a href="#/admin" onClick={goAdmin} style={linkStyle}>{word}</a>
        {after}
      </>
    );
  }
  // Fallback: whole second line becomes the hidden link.
  return <a href="#/admin" onClick={goAdmin} style={linkStyle}>{text}</a>;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [mounted, setMounted] = useState(false);
  const [locations, setLocations] = useState(DEFAULT_LOCATIONS);
  const [page, setPage] = useState("landing");
  const [menuOpen, setMenuOpen] = useState(false);
  // Copy is sourced from code only. Edit DEFAULT_COPY above to change site text.
  const copy = DEFAULT_COPY;
  useEffect(() => { setTimeout(() => setMounted(true), 80); window.scrollTo(0, 0); }, []);

  const goTo = (p) => { setPage(p); setMenuOpen(false); window.scrollTo(0,0); };

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

  const baseStyle = { background:"#000", minHeight:"100vh", fontFamily:"'Space Mono','Courier New',monospace", color:"#fff" };
  const globalCss = `
    @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    html,body{background:#000;}
    @keyframes fadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
    @keyframes blink{0%,100%{opacity:1;}50%{opacity:0.2;}}
    @keyframes dotPulse{0%,100%{opacity:0.15;}50%{opacity:0.65;}}
    @keyframes msgIn{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:translateY(0);}}
    @keyframes caretBlink{0%,50%{opacity:0.9;}51%,100%{opacity:0;}}
    .emy-caret{display:inline-block;margin-left:2px;color:rgba(255,255,255,0.55);animation:caretBlink 1s step-end infinite;}
    input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.3);}
    ::-webkit-scrollbar{width:0;}
    ::selection{background:rgba(255,255,255,0.12);}
    .emy-page-content{animation:fadeIn 0.6s ease forwards;}
    .emy-topbar{position:fixed;top:0;left:0;right:0;z-index:50;padding:20px 32px 32px;text-align:right;background:linear-gradient(to bottom,rgba(0,0,0,0.96) 40%,rgba(0,0,0,0.6) 75%,transparent);pointer-events:none;}
    .emy-topbar>*{pointer-events:auto;}
    .emy-hamburger{position:fixed;top:24px;left:24px;z-index:200;}
  `;

  // ── Hamburger button ──
  const HamburgerBtn = () => (
    <button onClick={() => setMenuOpen(o => !o)} className="emy-hamburger" style={{
      background:"none", border:"none", cursor:"pointer", padding:8,
    }}>
      {menuOpen ? (
        <div style={{ width:22, height:22, position:"relative" }}>
          <div style={{ position:"absolute", top:"50%", left:0, width:"100%", height:1.5, background:"#fff", transform:"rotate(45deg)" }}/>
          <div style={{ position:"absolute", top:"50%", left:0, width:"100%", height:1.5, background:"#fff", transform:"rotate(-45deg)" }}/>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
          <div style={{ width:22, height:1.5, background:"#fff" }}/>
          <div style={{ width:22, height:1.5, background:"#fff" }}/>
          <div style={{ width:22, height:1.5, background:"#fff" }}/>
        </div>
      )}
    </button>
  );

  // ── Menu overlay ──
  const MenuOverlay = () => (
    <div style={{
      position:"fixed", inset:0, zIndex:100,
      background:"rgba(0,0,0,0.96)",
      display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", gap:48,
    }}>
      {[
        { label:"About Emy.", key:"about" },
        { label:"Who is Emy.", key:"who" },
        { label:"Talk to Emy.", key:"talk" },
      ].map(item => (
        <button key={item.key} onClick={() => goTo(item.key)} style={{
          background:"none", border:"none", cursor:"pointer",
          fontSize:28, letterSpacing:"0.18em", textTransform:"uppercase",
          color:"rgba(255,255,255,0.85)", fontFamily:"inherit", fontWeight:700,
          transition:"color 0.2s",
        }}
        onMouseEnter={e => e.target.style.color="#fff"}
        onMouseLeave={e => e.target.style.color="rgba(255,255,255,0.85)"}
        >{item.label}</button>
      ))}
    </div>
  );

  // ── Top bar (logo + tagline, always top-right) ──
  const TopBar = () => (
    <div className="emy-topbar emy-mono">
      <button onClick={() => goTo("landing")} style={{ background:"none", border:"none", cursor:"pointer", display:"block", marginLeft:"auto" }}>
        <Logo width={110}/>
      </button>
      <div style={{ marginTop:6, fontSize:9, letterSpacing:"0.26em", textTransform:"uppercase", color:"rgba(255,255,255,0.4)", fontWeight:700 }}>
        {copy.taglineLine1}
        <span style={{ display:"none" }}>{renderWithAdminLink(copy.taglineLine2)}</span>
      </div>
    </div>
  );

  // ── Landing page ──
  if (page === "landing") return (
    <div style={{ ...baseStyle, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <style>{globalCss}</style>
      <HamburgerBtn/>
      <TopBar/>
      {menuOpen && <MenuOverlay/>}
      <div style={{ textAlign:"center", opacity:mounted?1:0, animation:mounted?"fadeIn 1s ease forwards":"none" }}>
        <Logo width={260}/>
        <div style={{ marginTop:16, fontSize:10, letterSpacing:"0.28em", textTransform:"uppercase", color:"rgba(255,255,255,0.45)", fontWeight:700 }}>
          {copy.taglineLine1}
        </div>
      </div>
    </div>
  );

  // ── About page ──
  if (page === "about") return (
    <div style={baseStyle}>
      <style>{globalCss}</style>
      <HamburgerBtn/>
      <TopBar/>
      {menuOpen && <MenuOverlay/>}
      <div className="emy-page-content" style={{ maxWidth:580, margin:"0 auto", padding:"120px 28px 80px" }}>
        <Label>{copy.labelAbout}</Label>
        <div style={{ fontSize:16, lineHeight:1.75, color:"rgba(255,255,255,0.92)" }}>
          <p style={{ marginBottom:22 }}>{copy.aboutP1}</p>
          <p style={{ marginBottom:22 }}>{copy.aboutP2}</p>
          <p style={{ marginBottom:22 }}>{copy.aboutP3}</p>
          <p style={{ marginBottom:48 }}>{copy.aboutP4}</p>
        </div>

        {/* Membership */}
        <div style={{ borderTop:"1px solid rgba(255,255,255,0.12)", paddingTop:40 }}>
          <div style={{ fontSize:20, letterSpacing:"0.12em", textTransform:"uppercase", color:"#fff", fontWeight:700, marginBottom:8 }}>{copy.membershipTitle}</div>
          <div style={{ fontSize:12, letterSpacing:"0.22em", textTransform:"uppercase", color:"rgba(255,255,255,0.45)", marginBottom:36 }}>{copy.membershipSub}</div>
          <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
            {/* Solo */}
            <div style={{ borderTop:"1px solid rgba(255,255,255,0.1)", paddingTop:24 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:10 }}>
                <div style={{ fontSize:14, letterSpacing:"0.2em", textTransform:"uppercase", fontWeight:700, color:"#fff" }}>{copy.membershipSolo}</div>
                <div style={{ fontSize:13, color:"rgba(255,255,255,0.6)", letterSpacing:"0.05em" }}>{copy.membershipSoloPrice}</div>
              </div>
              <p style={{ fontSize:14, lineHeight:1.7, color:"rgba(255,255,255,0.65)" }}>{copy.membershipSoloDesc}</p>
            </div>
            {/* Family */}
            <div style={{ borderTop:"1px solid rgba(255,255,255,0.1)", paddingTop:24 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:10 }}>
                <div style={{ fontSize:14, letterSpacing:"0.2em", textTransform:"uppercase", fontWeight:700, color:"#fff" }}>{copy.membershipFamily}</div>
                <div style={{ fontSize:13, color:"rgba(255,255,255,0.6)", letterSpacing:"0.05em" }}>{copy.membershipFamilyPrice}</div>
              </div>
              <p style={{ fontSize:14, lineHeight:1.7, color:"rgba(255,255,255,0.65)" }}>{copy.membershipFamilyDesc}</p>
            </div>
          </div>
          <div style={{ marginTop:24, paddingTop:24, borderTop:"1px solid rgba(255,255,255,0.07)" }}>
            <p style={{ fontSize:12, letterSpacing:"0.08em", color:"rgba(255,255,255,0.38)", fontStyle:"italic" }}>{copy.membershipCorporate}</p>
          </div>
          <div style={{ marginTop:32, paddingTop:32, borderTop:"1px solid rgba(255,255,255,0.1)" }}>
            <p style={{ fontSize:16, lineHeight:1.75, color:"rgba(255,255,255,0.92)", marginBottom:12 }}>{copy.membershipCta1}</p>
            <button onClick={() => goTo("talk")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, letterSpacing:"0.28em", textTransform:"uppercase", color:"rgba(255,255,255,0.55)", fontFamily:"inherit", fontWeight:700, padding:0, textDecoration:"underline", textUnderlineOffset:4 }}>{copy.membershipCta2}</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Who page ──
  if (page === "who") return (
    <div style={baseStyle}>
      <style>{globalCss}</style>
      <HamburgerBtn/>
      <TopBar/>
      {menuOpen && <MenuOverlay/>}
      <div className="emy-page-content" style={{ maxWidth:580, margin:"0 auto", padding:"120px 28px 80px" }}>
        <Label>{copy.labelWho}</Label>
        <div style={{ fontSize:16, lineHeight:1.75, color:"rgba(255,255,255,0.92)", marginBottom:40 }}>
          <p style={{ marginBottom:22 }}>{copy.whoP1}</p>
          <p style={{ marginBottom:22 }}>{copy.whoP2}</p>
          <p style={{ marginBottom:0 }}>{copy.whoP3}</p>
        </div>
        {copy.whoPhoto && (
          <div style={{ margin:"0 -28px" }}>
            <img src={copy.whoPhoto} alt="Emy Engels" style={{ width:"100%", height:"auto", display:"block" }}/>
            <div style={{ padding:"12px 28px 0", fontSize:11, letterSpacing:"0.2em", textTransform:"uppercase", color:"rgba(255,255,255,0.35)", fontFamily:"'Space Mono',monospace" }}>Emy Engels</div>
          </div>
        )}
        <div style={{ marginTop:48 }}>
          <Label>{copy.labelWhere}</Label>
          <div style={{ position:"relative" }}>
            {copy.locationPhoto && (
              <>
                <div style={{ position:"absolute", inset:0, backgroundImage:`url(${copy.locationPhoto})`, backgroundSize:"cover", backgroundPosition:"center", opacity:0.50, filter:"blur(4px)", borderRadius:4, zIndex:0 }}/>
                <div style={{ position:"absolute", inset:0, background:"linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 100%)", borderRadius:4, zIndex:0 }}/>
              </>
            )}
            <div style={{ position:"relative", zIndex:1 }}>
              <div style={{ position:"absolute", left:6, top:8, bottom:8, width:1, background:"linear-gradient(to bottom, rgba(255,255,255,0.28), rgba(255,255,255,0.02))" }}/>
              {locations.map((loc, i) => {
                const isCurrent = i===0;
                const op = trailOpacity(i, locations.length);
                return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:22, padding:"12px 0", opacity:op, borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
                    <div style={{ width:isCurrent?14:7, height:isCurrent?14:7, borderRadius:"50%", border:`${isCurrent?"1.5px":"1px"} solid rgba(255,255,255,${isCurrent?0.9:0.38})`, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", animation:isCurrent?"blink 3s ease-in-out infinite":"none" }}>
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
          </div>
        </div>
      </div>
    </div>
  );

  // ── Talk page ──
  if (page === "talk") return (
    <div style={baseStyle}>
      <style>{globalCss}</style>
      <HamburgerBtn/>
      <TopBar/>
      {menuOpen && <MenuOverlay/>}
      <div className="emy-page-content" style={{ maxWidth:580, margin:"0 auto", padding:"120px 28px 80px" }}>
        <Label>{copy.labelTalk}</Label>
        <EmyChat greeting={copy.greeting}/>
        <div style={{ marginTop:32, borderTop:"1px solid rgba(255,255,255,0.12)", paddingTop:24 }}>
          <div style={{ fontSize:15, fontWeight:700, letterSpacing:"0.06em", color:"#fff", marginBottom:14 }}>Emy Engels</div>
          <a href="tel:+32471481010" style={{ display:"flex", alignItems:"center", gap:10, color:"rgba(255,255,255,0.75)", textDecoration:"none", fontSize:14, letterSpacing:"0.04em", marginBottom:10 }}>
            <span style={{ fontSize:16 }}>📞</span> +32 471 48 10 10
          </a>
          <a href="mailto:emy@ask-emy.com" style={{ display:"flex", alignItems:"center", gap:10, color:"rgba(255,255,255,0.75)", textDecoration:"none", fontSize:14, letterSpacing:"0.04em" }}>
            <span style={{ fontSize:16 }}>✉️</span> emy@ask-emy.com
          </a>
        </div>
      </div>
    </div>
  );

  return null;
}
