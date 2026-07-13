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
  whoP3: "Alongside that, travel has always been my passion. I've been lucky enough to explore some of the most extraordinary corners of the world, and that curiosity for discovering something special has never really faded. Today, I get to put that same passion to work for my clients: finding the places, people, and details that make an experience unforgettable. There's nothing I love more than arranging it all, down to the last detail, so you don't have to.",
  whoP4: "That's why I started EMY — a Lifestyle Membership for people who expect more. Based in Antwerp. Connected globally.",
  labelWhere: "Where is Emy.",
  locationPhoto: "/emy-location.jpg",  // ← paste a photo URL here to show it in the Where section
  labelTalk: "Talk to Emy.",
  labelAbout: "About Emy.",
  aboutP1: "Some things are better left to someone who truly knows you.",
  aboutP2: "A discreet, personal lifestyle membership for entrepreneurs, families and individuals. One dedicated point of contact. Whatever you need, handled.",
  aboutP3: "Personal. Discreet. And over time, effortless, because we learn your preferences, your standards, your life.",
  aboutP4: "Not a service. A relationship.",
  membershipTitle: "Membership",
  membershipSub: "Choose what fits your life.",
  membershipSolo: "Solo",
  membershipSoloPrice: "€ 175 / month excl. VAT",
  membershipSoloSub: "For individuals who want one person to handle it all.",
  membershipSoloDesc: "One dedicated contact. Available when you need it.",
  membershipExpats: "Expats",
  membershipExpatsPrice: "On request",
  membershipExpatsSub: "New to Belgium and building a life from scratch.",
  membershipExpatsDesc: "Schools, housing, daily life, local admin — everything arranged so you can focus on settling in, not sorting out.",
  membershipFamily: "Family",
  membershipFamilyPrice: "On request",
  membershipFamilySub: "For families with a full schedule and high expectations.",
  membershipFamilyDesc: "Multiple people, multiple properties, multiple needs — handled by one person who knows your family. Every family is different. Let's talk about what works for yours.",
  membershipBusiness: "Business",
  membershipBusinessPrice: "Tailored to your needs",
  membershipBusinessSub: "For entrepreneurs, executives, and their teams.",
  membershipBusinessDesc: "Whether it's travel for your management team, client entertainment, or personal support for your key people — I build a setup that fits your business. No standard packages. Just what you actually need.",
  membershipCta1: "Not sure which membership fits? One conversation is usually enough to find out.",
  membershipCta2: "Get in touch.",
  price: "",
};

const WA_NUMBER_INTL = "+32471481010";

const FOR_WHOM = [
  { icon:"ti-briefcase", title:"Entrepreneurs & executives", desc:"Your agenda is your most valuable asset. Let me protect it." },
  { icon:"ti-plane",     title:"Frequent travellers",        desc:"From private aviation to hotel suites — every detail arranged before you ask." },
  { icon:"ti-world",     title:"Expats in Antwerp",          desc:"New to Belgium. Everything arranged: schools, housing, daily life." },
  { icon:"ti-users",     title:"Families",                   desc:"Complex schedules, multiple properties, children — one person handles it all." },
  { icon:"ti-building-bank", title:"Private banking clients",desc:"Referred by your wealth manager. Expects the same level of service in daily life." },
  { icon:"ti-star",      title:"Those who simply know",      desc:"You know what you want. You just need someone to make it happen." },
];

const WHAT_I_DO = [
  { icon:"ti-plane",        title:"Private jets, helicopters & flights", desc:"From a chartered jet to a first-class ticket, and if your flight changes at midnight, we're already rebooking it. Ten years of aviation expertise, and the network to match." },
  { icon:"ti-sailboat",     title:"Yachts & boat charters",     desc:"Day trips or extended charters, Mediterranean or North Sea. We source, negotiate, and arrange everything on board." },
  { icon:"ti-map",          title:"Hotels & travel",            desc:"Travel designed around you, start to finish." },
  { icon:"ti-confetti",     title:"Events & reservations",      desc:"A table, an evening, a private gathering, arranged exactly as you had in mind." },
  { icon:"ti-shopping-bag", title:"Personal shopping",          desc:"From a specific timepiece to a full wardrobe refresh. We find it, source it, and deliver it — without you lifting a finger." },
  { icon:"ti-home-2",       title:"Relocation & family life",   desc:"Settling in somewhere new, or simply keeping a busy household running smoothly." },
];

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
  return <div style={{ fontSize:10, letterSpacing:"0.22em", color:"rgba(255,255,255,0.38)", textTransform:"uppercase", marginBottom:24, fontWeight:400, fontFamily:"'Space Mono','Courier New',monospace" }}>{children}</div>;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const copy = DEFAULT_COPY;

  const aboutRef = useRef(null);
  const whoRef   = useRef(null);
  const talkRef  = useRef(null);

  useEffect(() => { setTimeout(() => setMounted(true), 80); window.scrollTo(0, 0); }, []);

  const goTo = (key) => {
    setMenuOpen(false);
    const smooth = window.innerWidth <= 680;
    if (key === "landing") { window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "instant" }); return; }
    const refs = { about: aboutRef, who: whoRef, talk: talkRef };
    refs[key]?.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" });
  };

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

  const baseStyle = { background:"#0d0c0a", minHeight:"100vh", fontFamily:"'Space Mono','Courier New',monospace", color:"#fff" };
  const globalCss = `
    @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Montserrat:wght@300;400&display=swap');
    @import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.31.0/dist/tabler-icons.min.css');
    *{box-sizing:border-box;margin:0;padding:0;}
    html,body{background:#0d0c0a;overflow-x:hidden;}
    @keyframes fadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
    @keyframes blink{0%,100%{opacity:1;}50%{opacity:0.2;}}
    @keyframes dotPulse{0%,100%{opacity:0.15;}50%{opacity:0.65;}}
    @keyframes msgIn{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:translateY(0);}}
    @keyframes caretBlink{0%,50%{opacity:0.9;}51%,100%{opacity:0;}}
    .emy-caret{display:inline-block;margin-left:2px;color:rgba(255,255,255,0.55);animation:caretBlink 1s step-end infinite;}
    input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.3);}
    ::-webkit-scrollbar{width:0;}
    ::selection{background:rgba(255,255,255,0.12);}
    .emy-topbar{position:fixed;top:0;left:0;right:0;z-index:50;padding:20px 32px 32px;text-align:right;background:linear-gradient(to bottom,rgba(13,12,10,0.97) 40%,rgba(13,12,10,0.6) 75%,transparent);pointer-events:none;}
    .emy-topbar>*{pointer-events:auto;}
    .emy-hamburger{position:fixed;top:24px;left:24px;z-index:200;}
    .ti{font-size:20px;color:rgba(255,255,255,0.45);}
    .emy-section{max-width:1080px;margin:0 auto;padding:100px 72px 80px;}
    .emy-divider{max-width:1080px;margin:0 auto;padding:0 72px;}
    .emy-for-whom-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;border:1px solid rgba(255,255,255,0.06);}
    .emy-photo{width:100%;height:auto;display:block;}
    @media(min-width:681px){.emy-photo{max-width:480px;}}
    .emy-body{font-size:14px;line-height:1.9;color:rgba(255,255,255,0.65);}
    .emy-section p{font-size:14px;line-height:1.9;}
    @media(min-width:681px){
      .emy-body{font-size:17px;line-height:1.9;}
      .emy-section p{font-size:17px;line-height:1.9;}
      .emy-section .emy-item-title{font-size:17px;}
    }
    @media(max-width:680px){
      .emy-section{padding:90px 28px 70px;}
      .emy-divider{padding:0 28px;}
      .emy-for-whom-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));}
    }
  `;

  const HamburgerBtn = () => (
    <button onClick={() => setMenuOpen(o => !o)} className="emy-hamburger" style={{ background:"none", border:"none", cursor:"pointer", padding:8 }}>
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

  const MenuOverlay = () => (
    <div style={{ position:"fixed", inset:0, zIndex:100, background:"#0d0c0a", display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"stretch", overflowY:"auto", padding:"40px 28px" }}>
      <div style={{ maxWidth:420, margin:"0 auto", width:"100%" }}>
        {[
          { label:"About Emy.", key:"about" },
          { label:"Who is Emy.", key:"who" },
          { label:"Talk to Emy.", key:"talk" },
        ].map((item, i, arr) => (
          <button key={item.key} onClick={() => goTo(item.key)} style={{ display:"flex", alignItems:"center", gap:18, width:"100%", background:"none", border:"none", borderBottom: i < arr.length-1 ? "1px solid rgba(255,255,255,0.08)" : "none", cursor:"pointer", padding:"22px 0", fontFamily:"inherit", transition:"color 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.color="#fff"}
            onMouseLeave={e => e.currentTarget.style.color="inherit"}
          >
            <span style={{ fontSize:11, color:"rgba(255,255,255,0.3)", flexShrink:0 }}>{String(i+1).padStart(2,"0")}</span>
            <span style={{ fontSize:24, letterSpacing:"0.02em", color:"rgba(255,255,255,0.85)", fontWeight:300, fontStyle:"italic" }}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const TopBar = () => (
    <div className="emy-topbar">
      <button onClick={() => goTo("landing")} style={{ background:"none", border:"none", cursor:"pointer", display:"block", marginLeft:"auto" }}>
        <Logo width={110}/>
      </button>
      <span style={{ display:"none" }}>{renderWithAdminLink(copy.taglineLine2)}</span>
    </div>
  );

  const Divider = () => <div className="emy-divider"><div style={{ height:1, background:"rgba(255,255,255,0.06)" }}/></div>;

  return (
    <div style={baseStyle}>
      <style>{globalCss}</style>
      <HamburgerBtn/>
      <TopBar/>
      {menuOpen && <MenuOverlay/>}

      {/* ── Landing ── */}
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", opacity:mounted?1:0, transition:"opacity 1s ease" }}>
        <div style={{ textAlign:"center" }}>
          <Logo width={420}/>
          <div style={{ marginTop:20, fontSize:13, fontFamily:"'Montserrat',sans-serif", fontWeight:300, letterSpacing:"0.06em", color:"rgba(255,255,255,0.32)" }}>
            Stop arranging. Start living.
          </div>
        </div>
      </div>

      <Divider/>

      {/* ── About ── */}
      <div ref={aboutRef} className="emy-section">
        <Section>
          <Label>{copy.labelAbout}</Label>
          <div className="emy-body" style={{ marginBottom:56 }}>
            <p style={{ marginBottom:18 }}>{copy.aboutP1}</p>
            <p style={{ marginBottom:18 }}>{copy.aboutP2}</p>
            <p style={{ marginBottom:18 }}>{copy.aboutP3}</p>
            <p style={{ marginBottom:0, color:"rgba(255,255,255,0.35)" }}>{copy.aboutP4}</p>
          </div>

          {/* For Whom */}
          <div style={{ borderTop:"1px solid rgba(255,255,255,0.1)", paddingTop:48, marginBottom:56 }}>
            <Label>For whom.</Label>
            <p style={{ lineHeight:1.85, color:"rgba(255,255,255,0.65)", marginBottom:6 }}>
              A lifestyle membership for those who expect more.
            </p>
            <p style={{ lineHeight:1.85, color:"rgba(255,255,255,0.65)", marginBottom:32 }}>
              Because your time is better spent elsewhere.
            </p>
            <div className="emy-for-whom-grid">
              {FOR_WHOM.map((p, i) => (
                <div key={i} style={{ padding:"22px 18px", borderRight:"1px solid rgba(255,255,255,0.08)", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
                  <i className={`ti ${p.icon}`} style={{ fontSize:16, color:"rgba(255,255,255,0.32)", display:"block", marginBottom:10 }}/>
                  <div className="emy-item-title" style={{ color:"rgba(255,255,255,0.72)", marginBottom:6 }}>{p.title}</div>
                  <p style={{ color:"rgba(255,255,255,0.38)" }}>{p.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* What we do */}
          <div style={{ borderTop:"1px solid rgba(255,255,255,0.1)", paddingTop:48, marginBottom:56 }}>
            <Label>What we do.</Label>
            <p style={{ fontSize:15, color:"rgba(255,255,255,0.72)", marginBottom:24, lineHeight:1.85 }}>
              Everything that costs you time.
            </p>
            <div style={{ display:"flex", flexDirection:"column" }}>
              {WHAT_I_DO.map((s, i) => (
                <div key={i} style={{ display:"flex", gap:18, padding:"22px 0", borderTop:"1px solid rgba(255,255,255,0.08)" }}>
                  <i className={`ti ${s.icon}`} style={{ fontSize:18, color:"rgba(255,255,255,0.35)", flexShrink:0, marginTop:4 }}/>
                  <div>
                    <div className="emy-item-title" style={{ color:"rgba(255,255,255,0.72)", marginBottom:6 }}>{s.title}</div>
                    <p style={{ color:"rgba(255,255,255,0.42)" }}>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ marginTop:24, fontSize:15, lineHeight:1.8, color:"rgba(255,255,255,0.35)", borderTop:"1px solid rgba(255,255,255,0.07)", paddingTop:20 }}>
              Don't see what you need? Ask anyway. If it can be arranged, we will arrange it.
            </p>
          </div>

          {/* Membership */}
          <div style={{ borderTop:"1px solid rgba(255,255,255,0.1)", paddingTop:48 }}>
            <Label>{copy.membershipTitle}</Label>
            <div style={{ display:"flex", flexDirection:"column" }}>
              {[
                { title: copy.membershipSolo,     price: copy.membershipSoloPrice,     sub: copy.membershipSoloSub,     desc: copy.membershipSoloDesc },
                { title: copy.membershipExpats,   price: copy.membershipExpatsPrice,   sub: copy.membershipExpatsSub,   desc: copy.membershipExpatsDesc },
                { title: copy.membershipFamily,   price: copy.membershipFamilyPrice,   sub: copy.membershipFamilySub,   desc: copy.membershipFamilyDesc },
                { title: copy.membershipBusiness, price: copy.membershipBusinessPrice, sub: copy.membershipBusinessSub, desc: copy.membershipBusinessDesc },
              ].map((tier, i) => (
                <div key={i} style={{ borderTop:"1px solid rgba(255,255,255,0.1)", paddingTop:28, paddingBottom:28 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:10 }}>
                    <div className="emy-item-title" style={{ color:"rgba(255,255,255,0.82)" }}>{tier.title}</div>
                    <div className="emy-item-title" style={{ color:"rgba(255,255,255,0.38)" }}>{tier.price}</div>
                  </div>
                  <p style={{ fontSize:15, lineHeight:1.8, color:"rgba(255,255,255,0.62)", marginBottom:8 }}>{tier.sub}</p>
                  <p style={{ fontSize:15, lineHeight:1.8, color:"rgba(255,255,255,0.38)" }}>{tier.desc}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop:8, paddingTop:28, borderTop:"1px solid rgba(255,255,255,0.07)" }}>
              <p style={{ fontSize:15, lineHeight:1.8, color:"rgba(255,255,255,0.45)", marginBottom:16 }}>{copy.membershipCta1}</p>
              <button onClick={() => goTo("talk")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, letterSpacing:"0.22em", textTransform:"uppercase", color:"rgba(255,255,255,0.45)", fontFamily:"inherit", fontWeight:400, padding:0, textDecoration:"underline", textUnderlineOffset:4 }}>{copy.membershipCta2}</button>
            </div>
          </div>
        </Section>
      </div>

      <Divider/>

      {/* ── Who ── */}
      <div ref={whoRef} className="emy-section">
        <Section>
          <Label>{copy.labelWho}</Label>
          <div className="emy-body" style={{ marginBottom:40 }}>
            <p style={{ marginBottom:18 }}>{copy.whoP1}</p>
            <p style={{ marginBottom:18 }}>{copy.whoP2}</p>
            <p style={{ marginBottom:18 }}>{copy.whoP3}</p>
            <p style={{ marginBottom:0 }}>{copy.whoP4}</p>
          </div>
          {copy.whoPhoto && (
            <div>
              <img src={copy.whoPhoto} alt="Emy Engels" className="emy-photo"/>
              <div style={{ padding:"12px 28px 0", fontSize:10, letterSpacing:"0.2em", textTransform:"uppercase", color:"rgba(255,255,255,0.32)", fontFamily:"inherit" }}>Emy Engels</div>
            </div>
          )}
        </Section>
      </div>

      <Divider/>

      {/* ── Talk ── */}
      <div ref={talkRef} className="emy-section" style={{ paddingBottom:120 }}>
        <Section>
          <Label>{copy.labelTalk}</Label>
          <p style={{ fontSize:13, lineHeight:1.85, color:"rgba(255,255,255,0.45)", marginBottom:32 }}>
            No forms, no waiting. Reach out directly — and within 24 hours you will know if we are a good match.
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <a href="https://wa.me/32471481010" target="_blank" rel="noreferrer" style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 20px", border:"1px solid rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.85)", textDecoration:"none", fontSize:12, letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:700, fontFamily:"inherit" }}>
              <i className="ti ti-brand-whatsapp" style={{ fontSize:18 }}/> WhatsApp
              <i className="ti ti-external-link" style={{ fontSize:13, marginLeft:"auto", opacity:0.45 }}/>
            </a>
            <a href="mailto:emy@ask-emy.com" style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 20px", border:"1px solid rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.85)", textDecoration:"none", fontSize:12, letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:700, fontFamily:"inherit" }}>
              <i className="ti ti-mail" style={{ fontSize:18 }}/> emy@ask-emy.com
              <i className="ti ti-external-link" style={{ fontSize:13, marginLeft:"auto", opacity:0.45 }}/>
            </a>
          </div>
        </Section>
      </div>
    </div>
  );
}
