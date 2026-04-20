import { useState, useEffect, useRef } from "react";

const LOCATIONS = [
  { city: "Valencia",  country: "Spain"     },
  { city: "Antwerp",   country: "Belgium"   },
  { city: "Cape Town", country: "S. Africa" },
  { city: "Mauritius", country: "Mauritius" },
  { city: "Antwerp",   country: "Belgium"   },
];
const TRAIL_OPACITY = [1, 0.55, 0.38, 0.26, 0.18];
const CURRENT_LOCATION = "Valencia, Spain";
const TODAY = new Date().toLocaleDateString("en-GB", { weekday:"long", year:"numeric", month:"long", day:"numeric" });

const SYSTEM = `You are the contact intake for Emy's personal concierge service. Your job: understand how and when someone wants to connect, collect what's needed, and check her calendar when relevant.

Context:
- Today is ${TODAY}
- Emy is currently in ${CURRENT_LOCATION}
- You have access to Emy's Google Calendar

Behaviour:
- When someone proposes an in-person meeting (e.g. "this bar", "dinner tomorrow", "meet tonight") → use the calendar tool to check if Emy is free at that time and date.
  - If she's free: create a calendar event and say "Done — booked in Emy's calendar." with the details.
  - If she's busy or has a conflict: "Sorry, she's tied up then — can she call you instead?" and ask for their number.
  - If the proposed location is far from ${CURRENT_LOCATION}: "She's in ${CURRENT_LOCATION} right now — can she call you instead?" and ask for their number.
- When someone wants a call or WhatsApp → ask for their number → say "Stays between us."
- When someone gives an email → confirm it back.
- Once you have all details → one-line confirmation ending with exactly: "Emy will be in touch."

Style rules:
- 1-2 sentences max per reply. One question at a time.
- Direct, warm, human. No "certainly", "of course", "absolutely", "great", "happy to help".
- Don't explain your process. Just respond.
- Start with only: "How do you want to connect?"`;

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
  return <div style={{ height:1, background:"rgba(255,255,255,0.14)", margin:"52px 0" }}/>;
}
function Label({ children }) {
  return <div style={{ fontSize:10, letterSpacing:"0.32em", color:"rgba(255,255,255,0.4)", textTransform:"uppercase", marginBottom:28 }}>{children}</div>;
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function EmyChat() {
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [checking, setChecking]   = useState(false); // calendar check in progress
  const [done, setDone]           = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const reply = await callAPI([{ role:"user", content:"start" }]);
      setMessages([{ role:"emy", text:reply }]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages, loading, checking]);

  async function callAPI(history) {
    const body = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      system: SYSTEM,
      messages: history,
      mcp_servers: [
        {
          type: "url",
          url: "https://calendarmcp.googleapis.com/mcp/v1",
          name: "google-calendar",
        }
      ],
    };

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();

    // Check if calendar tool was used
    const usedCalendar = d.content?.some(b => b.type === "mcp_tool_use");
    if (usedCalendar) setChecking(false);

    // Extract text from all content blocks
    const text = (d.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join(" ")
      .trim();

    return text || "Something went wrong.";
  }

  async function send() {
    if (!input.trim() || loading || done) return;
    const text = input.trim();
    setInput("");
    const updated = [...messages, { role:"user", text }];
    setMessages(updated);
    setLoading(true);

    // If message contains time/place hints, show calendar indicator
    const mightCheckCalendar = /tonight|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|bar|dinner|lunch|meet|pm|am|\d+(:\d+)?/i.test(text);
    if (mightCheckCalendar) setChecking(true);

    const history = updated.map(m => ({ role:m.role==="emy"?"assistant":"user", content:m.text }));
    const reply = await callAPI(history);
    setChecking(false);

    const next = [...updated, { role:"emy", text:reply }];
    setMessages(next);
    setLoading(false);

    if (reply.toLowerCase().includes("emy will be in touch")) setDone(true);
    else setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <div>
      {/* Messages */}
      <div style={{ marginBottom:24 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start", marginBottom:18 }}>
            <div style={{
              maxWidth:"85%",
              fontSize:14, lineHeight:1.8,
              color: m.role==="user" ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.5)",
              textAlign: m.role==="user" ? "right" : "left",
              letterSpacing:"0.01em",
            }}>
              {m.text}
            </div>
          </div>
        ))}

        {/* Calendar checking state */}
        {checking && (
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 0", marginBottom:8 }}>
            <div style={{ fontSize:8, letterSpacing:"0.3em", color:"rgba(255,255,255,0.2)", textTransform:"uppercase" }}>
              checking calendar
            </div>
            <div style={{ display:"flex", gap:4 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:2, height:2, borderRadius:"50%", background:"rgba(255,255,255,0.2)", animation:"dotPulse 1s ease-in-out infinite", animationDelay:`${i*0.15}s` }}/>
              ))}
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {loading && !checking && (
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
              color:"rgba(255,255,255,0.85)", fontFamily:"inherit", fontSize:14,
              letterSpacing:"0.01em", caretColor:"rgba(255,255,255,0.5)",
            }}
          />
          <button onClick={send} disabled={loading||!input.trim()} style={{
            background:"transparent", border:"none",
            cursor:input.trim()&&!loading?"pointer":"default",
            color:"rgba(255,255,255,0.5)", fontSize:16,
            opacity:input.trim()&&!loading?1:0.2, transition:"opacity 0.15s",
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
  useEffect(() => { setTimeout(() => setMounted(true), 80); }, []);

  return (
    <div style={{ background:"#000", minHeight:"100vh", fontFamily:"'Space Mono','Courier New',monospace", maxWidth:480, margin:"0 auto" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{background:#000;}
        @keyframes logoIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        @keyframes blink{0%,100%{opacity:1;}50%{opacity:0.2;}}
        @keyframes dotPulse{0%,100%{opacity:0.15;}50%{opacity:0.65;}}
        input::placeholder{color:rgba(255,255,255,0.18);}
        ::-webkit-scrollbar{width:0;}
        ::selection{background:rgba(255,255,255,0.12);}
      `}</style>

      <div style={{ padding:"56px 28px 96px" }}>

        {/* Logo */}
        <div style={{ marginBottom:64, opacity:mounted?1:0, animation:mounted?"logoIn 1s ease forwards":"none" }}>
          <Logo width={210}/>
        </div>

        <Rule/>

        {/* About */}
        <Section delay={0}>
          <Label>About</Label>
          <div style={{ fontSize:16, lineHeight:1.75, color:"rgba(255,255,255,0.92)" }}>
            <p style={{ marginBottom:22 }}>Some things are better handled by someone who actually knows you.</p>
            <p style={{ marginBottom:22 }}>Emy is one person. Direct line. She's there for the flight changed at midnight, the birthday, the safari, the thing you'd rather not run past anyone else.</p>
            <p>Over time she learns your life. That's the point.</p>
          </div>
          <div style={{ marginTop:32, fontSize:12, color:"rgba(255,255,255,0.45)", letterSpacing:"0.1em" }}>— €150 / month</div>
        </Section>

        <Rule/>

        {/* Where is Emy */}
        <Section delay={0.05}>
          <Label>Where is Emy.</Label>
          <div style={{ position:"relative" }}>
            <div style={{ position:"absolute", left:6, top:8, bottom:8, width:1, background:"linear-gradient(to bottom, rgba(255,255,255,0.28), rgba(255,255,255,0.04))" }}/>
            {LOCATIONS.map((loc, i) => {
              const isCurrent = i===0;
              return (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:20, padding:"14px 0", opacity:TRAIL_OPACITY[i], borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{
                    width:isCurrent?13:7, height:isCurrent?13:7, borderRadius:"50%",
                    border:`${isCurrent?"1.5px":"1px"} solid rgba(255,255,255,${isCurrent?0.85:0.35})`,
                    flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                    animation:isCurrent?"blink 3s ease-in-out infinite":"none",
                  }}>
                    {isCurrent && <div style={{ width:5, height:5, borderRadius:"50%", background:"#fff" }}/>}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:isCurrent?19:16, letterSpacing:"0.05em", color:"#fff", fontWeight:isCurrent?700:400 }}>{loc.city}</div>
                    {isCurrent && <div style={{ fontSize:10, letterSpacing:"0.26em", color:"rgba(255,255,255,0.5)", marginTop:4, textTransform:"uppercase" }}>{loc.country}</div>}
                  </div>
                  {isCurrent && <div style={{ fontSize:10, letterSpacing:"0.26em", color:"rgba(255,255,255,0.6)", border:"1px solid rgba(255,255,255,0.2)", padding:"5px 10px" }}>now</div>}
                </div>
              );
            })}
          </div>
        </Section>

        <Rule/>

        {/* Reach Emy */}
        <Section delay={0.1}>
          <Label>Reach Emy.</Label>
          <EmyChat/>
        </Section>

        <Rule/>

        <div style={{ fontSize:10, letterSpacing:"0.3em", color:"rgba(255,255,255,0.28)", textTransform:"uppercase" }}>
          ask-emy.com
        </div>

      </div>
    </div>
  );
}
