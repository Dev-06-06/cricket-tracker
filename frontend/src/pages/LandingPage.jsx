import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

function FloatingBall({ style, size = 80, opacity = 0.06 }) {
  return (
    <span aria-hidden style={{
      position: "absolute", width: size, height: size, borderRadius: "50%",
      background: "radial-gradient(circle at 35% 35%, #f97316, #7c2d12)",
      opacity, pointerEvents: "none", ...style,
    }} />
  );
}

function RoleCard({ emoji, label, desc, path, accent, navigate }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={() => navigate(path)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        all: "unset", cursor: "pointer",
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 12, padding: "32px 24px", borderRadius: 24, flex: 1,
        border: `1.5px solid ${hovered ? accent : "rgba(255,255,255,0.07)"}`,
        background: hovered ? `${accent}12` : "rgba(255,255,255,0.03)",
        transition: "all 0.18s ease",
        transform: hovered ? "translateY(-4px)" : "none",
        boxShadow: hovered ? `0 12px 40px ${accent}20` : "none",
      }}
    >
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: hovered ? `${accent}22` : "rgba(255,255,255,0.05)",
        border: `1px solid ${hovered ? accent + "44" : "rgba(255,255,255,0.08)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 26, transition: "all 0.18s",
      }}>{emoji}</div>
      <div style={{ textAlign: "center" }}>
        <p style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 22, fontWeight: 900, letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: hovered ? accent : "#e2e8f0", transition: "color 0.18s",
        }}>{label}</p>
        <p style={{ marginTop: 4, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{desc}</p>
      </div>
      <span style={{
        marginTop: 4, padding: "7px 20px", borderRadius: 99,
        background: hovered ? accent : "rgba(255,255,255,0.05)",
        color: hovered ? "#0d1117" : "#475569",
        fontSize: 11, fontWeight: 900, letterSpacing: "0.12em",
        textTransform: "uppercase", transition: "all 0.18s",
      }}>Enter →</span>
    </button>
  );
}

function FeatureCard({ icon, title, desc, soon = false }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16, padding: "20px 18px", position: "relative", overflow: "hidden",
    }}>
      {soon && (
        <span style={{
          position: "absolute", top: 10, right: 10, background: "#f97316",
          color: "#0d1117", fontSize: 9, fontWeight: 900, letterSpacing: "0.12em",
          textTransform: "uppercase", padding: "2px 7px", borderRadius: 99,
        }}>Soon</span>
      )}
      <span style={{ fontSize: 26 }}>{icon}</span>
      <p style={{
        marginTop: 10, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15,
        fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#e2e8f0",
      }}>{title}</p>
      <p style={{ marginTop: 5, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{desc}</p>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [emailHovered, setEmailHovered] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const roles = [
    { emoji: "👀", label: "Viewer", desc: "Watch live scores & match updates in real time", path: "/view", accent: "#38bdf8" },
    { emoji: "✋", label: "Umpire", desc: "Control the match — ball by ball", path: "/umpire", accent: "#f97316" },
  ];

  const features = [
    { icon: "📡", title: "Live Score Tracking", desc: "Ball-by-ball updates visible to everyone watching the match." },
    { icon: "📊", title: "Player Stats", desc: "Runs, wickets, strike rates — full profiles for every player." },
    { icon: "📜", title: "Match History", desc: "Go back and relive every match ever played on CricTrack." },
    { icon: "👥", title: "Team Management", desc: "Build squads, manage rosters, pick your playing XI." },
    { icon: "🃏", title: "Joker Player", desc: "One player, two teams. Perfect for odd-numbered casual games.", soon: true },
    { icon: "⏱️", title: "Late Player Join", desc: "Two friends arrive after 1 over? Each team takes one. Fair game.", soon: true },
  ];

  const steps = [
    { num: "01", title: "Set up the match", desc: "Name your teams, add players, set overs. Done in under a minute." },
    { num: "02", title: "Umpire goes live", desc: "The umpire tracks every ball — runs, wickets, extras, the works." },
    { num: "03", title: "Everyone watches", desc: "Players and fans follow the live score from any device, no login needed." },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#fff", fontFamily: "'DM Sans', sans-serif", overflowX: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Barlow+Condensed:wght@500;600;700;800;900&display=swap');
        @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spinSlow { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        .fade-up { animation: fadeUp 0.7s ease both; }
        .fade-up-1 { animation-delay: 0.05s; }
        .fade-up-2 { animation-delay: 0.15s; }
        .fade-up-3 { animation-delay: 0.25s; }
        .fade-up-4 { animation-delay: 0.35s; }
        .fade-up-5 { animation-delay: 0.45s; }
        .spin-slow { animation: spinSlow 18s linear infinite; }
        .divider { border: none; height: 1px; background: linear-gradient(to right, transparent, rgba(255,255,255,0.07), transparent); margin: 0; }
        * { box-sizing: border-box; }
      `}</style>

      {/* NAV */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
        background: scrolled ? "rgba(13,17,23,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        transition: "all 0.25s ease",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#f97316", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#0d1117" }}>C</span>
            </div>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase" }}>CricTrack</span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={() => navigate("/players")} style={{
              all: "unset", cursor: "pointer", padding: "6px 14px", borderRadius: 99,
              border: "1px solid rgba(255,255,255,0.08)", color: "#64748b",
              fontSize: 12, fontWeight: 700, transition: "all 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.color = "#e2e8f0"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#64748b"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
            >🏟️ Dugout</button>
            <button onClick={() => navigate("/view")} style={{
              all: "unset", cursor: "pointer", padding: "7px 16px", borderRadius: 99,
              border: "1px solid rgba(249,115,22,0.4)", color: "#f97316",
              fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "#f97316"; e.currentTarget.style.color = "#0d1117"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#f97316"; }}
            >Live Matches</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        position: "relative", minHeight: "88vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: "60px 20px 80px",
        textAlign: "center", overflow: "hidden",
      }}>
        <FloatingBall style={{ top: "8%", left: "6%", filter: "blur(8px)" }} size={120} opacity={0.08} />
        <FloatingBall style={{ top: "20%", right: "8%", filter: "blur(4px)" }} size={60} opacity={0.1} />
        <FloatingBall style={{ bottom: "15%", left: "15%", filter: "blur(12px)" }} size={200} opacity={0.05} />
        <FloatingBall style={{ bottom: "10%", right: "5%", filter: "blur(6px)" }} size={90} opacity={0.07} />
        <div aria-hidden className="spin-slow" style={{
          position: "absolute", width: 440, height: 440, borderRadius: "50%",
          border: "1px dashed rgba(249,115,22,0.1)", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)", pointerEvents: "none",
        }} />

        <div className="fade-up fade-up-1" style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: 99,
          border: "1px solid rgba(249,115,22,0.3)", background: "rgba(249,115,22,0.08)", marginBottom: 24,
        }}>
          <span style={{ fontSize: 12 }}>🏏</span>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#f97316" }}>
            For Gully. For College. For Everyone.
          </span>
        </div>

        <h1 className="fade-up fade-up-2" style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: "clamp(52px, 12vw, 100px)", fontWeight: 900,
          lineHeight: 0.95, textTransform: "uppercase", maxWidth: 780,
        }}>
          <span style={{ color: "#fff" }}>Cricket,</span><br />
          <span style={{ background: "linear-gradient(135deg, #f97316, #fb923c, #fdba74)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Your Way
          </span>
        </h1>

        <p className="fade-up fade-up-3" style={{ marginTop: 20, fontSize: 16, color: "#64748b", maxWidth: 360, lineHeight: 1.6 }}>
          From gully to glory — track every ball.<br />
          <span style={{ color: "#475569" }}>Live scores. Player stats. Match history.</span>
        </p>

        <div className="fade-up fade-up-4" style={{ marginTop: 44, display: "flex", gap: 14, width: "100%", maxWidth: 500, justifyContent: "center" }}>
          {roles.map((r) => <RoleCard key={r.label} {...r} navigate={navigate} />)}
        </div>

        <div className="fade-up fade-up-5" style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 40, height: 1, background: "rgba(255,255,255,0.08)" }} />
          <button
            onClick={() => navigate("/players")}
            style={{
              all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              padding: "7px 16px", borderRadius: 99,
              border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)",
              color: "#475569", fontSize: 12, fontWeight: 700, transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#475569"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}
          >
            🏟️ <span>Browse the Dugout</span>
            <span style={{ fontSize: 10, color: "#334155" }}>— stats & profiles</span>
          </button>
          <div style={{ width: 40, height: 1, background: "rgba(255,255,255,0.08)" }} />
        </div>

        <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity: 0.25 }}>
          <div style={{ width: 1, height: 32, background: "linear-gradient(to bottom, transparent, #f97316)" }} />
          <span style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase" }}>scroll</span>
        </div>
      </section>

      <hr className="divider" />

      {/* FEATURES */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "64px 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: "#f97316", marginBottom: 10 }}>What's Inside</p>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(32px, 6vw, 52px)", fontWeight: 900, textTransform: "uppercase", lineHeight: 1.05 }}>
            Everything your match needs
          </h2>
          <p style={{ marginTop: 12, color: "#64748b", fontSize: 14, maxWidth: 400, margin: "12px auto 0" }}>
            Built for the chaos of casual cricket — with the discipline of proper scoring.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {features.map((f) => <FeatureCard key={f.title} {...f} />)}
        </div>
      </section>

      <hr className="divider" />

      {/* HOW IT WORKS */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "64px 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: "#f97316", marginBottom: 10 }}>Dead Simple</p>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(32px, 6vw, 52px)", fontWeight: 900, textTransform: "uppercase" }}>
            Up and running in 3 steps
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 2 }}>
          {steps.map((s, i) => (
            <div key={s.num} style={{ padding: "28px 24px", borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)" }}>
              <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 64, fontWeight: 900, color: "rgba(249,115,22,0.12)", lineHeight: 1, marginBottom: 12 }}>{s.num}</p>
              <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#e2e8f0", marginBottom: 8 }}>{s.title}</p>
              <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <hr className="divider" />

      {/* COMING SOON */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "64px 20px", textAlign: "center" }}>
        <div style={{
          background: "linear-gradient(135deg, rgba(249,115,22,0.07), rgba(249,115,22,0.03))",
          border: "1px solid rgba(249,115,22,0.15)", borderRadius: 24, padding: "48px 32px",
          position: "relative", overflow: "hidden",
        }}>
          <FloatingBall style={{ top: -30, right: -30 }} size={120} opacity={0.1} />
          <FloatingBall style={{ bottom: -20, left: -20 }} size={80} opacity={0.08} />
          <span style={{ fontSize: 40 }}>🃏</span>
          <h2 style={{ marginTop: 16, fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(28px, 6vw, 44px)", fontWeight: 900, textTransform: "uppercase", lineHeight: 1.1 }}>
            Joker Player & Late Arrivals
          </h2>
          <p style={{ marginTop: 12, fontSize: 15, color: "#94a3b8", maxWidth: 480, margin: "12px auto 0", lineHeight: 1.7 }}>
            Real casual cricket has odd players and friends who show up late.<br />
            <span style={{ color: "#f97316", fontWeight: 700 }}>We get it. We're building it.</span>
          </p>
          <div style={{ marginTop: 28, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            {[{ icon: "🃏", text: "Joker plays for both teams" }, { icon: "👬", text: "2 late friends? One each." }].map(({ icon, text }) => (
              <div key={text} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 99,
                border: "1px solid rgba(249,115,22,0.2)", background: "rgba(249,115,22,0.06)",
                fontSize: 12, color: "#cbd5e1", fontWeight: 600,
              }}>{icon} {text}</div>
            ))}
          </div>
          <p style={{ marginTop: 24, fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(249,115,22,0.5)" }}>
            Coming soon — stay tuned
          </p>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px 64px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(36px, 7vw, 64px)", fontWeight: 900, textTransform: "uppercase", lineHeight: 1.05 }}>
          Ready to play?<br />
          <span style={{ background: "linear-gradient(135deg, #f97316, #fdba74)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Pick your role.</span>
        </h2>
        <div style={{ marginTop: 36, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          {roles.map((r) => (
            <button key={r.label} onClick={() => navigate(r.path)} style={{
              all: "unset", cursor: "pointer", padding: "14px 28px", borderRadius: 14,
              border: `1.5px solid ${r.accent}44`, background: `${r.accent}10`, color: r.accent,
              fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 800,
              letterSpacing: "0.12em", textTransform: "uppercase", transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: 8,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = r.accent; e.currentTarget.style.color = "#0d1117"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = `${r.accent}10`; e.currentTarget.style.color = r.accent; e.currentTarget.style.transform = "none"; }}
            >{r.emoji} {r.label}</button>
          ))}
        </div>
        <button onClick={() => navigate("/players")} style={{
          all: "unset", cursor: "pointer", marginTop: 16, display: "inline-flex", alignItems: "center",
          gap: 6, color: "#334155", fontSize: 12, fontWeight: 600, transition: "color 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.color = "#64748b"}
          onMouseLeave={e => e.currentTarget.style.color = "#334155"}
        >or browse the 🏟️ Dugout →</button>
      </section>

      <hr className="divider" />

      {/* SUGGESTIONS */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "64px 20px", textAlign: "center" }}>
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 24, padding: "48px 32px",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0, borderRadius: 24,
            background: "radial-gradient(ellipse at 50% 110%, rgba(99,102,241,0.06), transparent 65%)",
            pointerEvents: "none",
          }} />
          <span style={{ fontSize: 40 }}>💡</span>
          <h2 style={{
            marginTop: 16, fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: "clamp(26px, 5vw, 40px)", fontWeight: 900,
            textTransform: "uppercase", lineHeight: 1.1, color: "#e2e8f0",
          }}>Got a suggestion?</h2>
          <p style={{ marginTop: 12, fontSize: 14, color: "#64748b", maxWidth: 420, margin: "12px auto 0", lineHeight: 1.8 }}>
            CricTrack is built for players like you. Have an idea, a feature request,
            or just want to say what works and what doesn't?{" "}
            <span style={{ color: "#94a3b8" }}>We'd love to hear from you.</span>
          </p>
          <a
            href="mailto:devtry55@gmail.com"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              marginTop: 28, padding: "13px 26px", borderRadius: 12,
              border: "1px solid rgba(249,115,22,0.35)",
              background: emailHovered ? "#f97316" : "rgba(249,115,22,0.09)",
              color: emailHovered ? "#0d1117" : "#f97316",
              fontSize: 14, fontWeight: 700,
              textDecoration: "none", transition: "all 0.15s",
              fontFamily: "'DM Sans', sans-serif",
            }}
            onMouseEnter={() => setEmailHovered(true)}
            onMouseLeave={() => setEmailHovered(false)}
          >
            ✉️ devtry55@gmail.com
          </a>
          <p style={{ marginTop: 12, fontSize: 11, color: "#2d3748", letterSpacing: "0.05em" }}>
            Every message gets read. No spam, ever.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "24px 20px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#f97316", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: "#0d1117" }}>C</span>
          </div>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "#475569" }}>CricTrack</span>
        </div>
        <p style={{ fontSize: 11, color: "#334155" }}>From gully to glory — track every ball. 🏏</p>
      </footer>
    </div>
  );
}