import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:       "#111827",
  surface:  "#1F2937",
  surface2: "#283548",
  border:   "#374151",
  border2:  "#4B5563",
  text:     "#F9FAFB",
  muted:    "#9CA3AF",
  faint:    "#1F2937",
  accent:   "#60A5FA",
  accentDim:"#1E3A5F",
  green:    "#34D399",
  amber:    "#FBBF24",
  red:      "#F87171",
  orange:   "#FB923C",
  purple:   "#A78BFA",
};

// ─── Constants ────────────────────────────────────────────────────────────────
const CHECK_TYPES    = ["Gas Safety","EICR","Buildings Insurance","Contents Insurance","EPC","Boiler Service","HMO Licence","Fire Risk Assessment","PAT Testing","Legionella Risk Assessment"];
const PROPERTY_TYPES = ["BTL","HMO","Commercial","Mixed Use"];
const FIN_FIELDS     = [
  { key:"purchase_price",   label:"Purchase Price",        type:"number" },
  { key:"current_value",    label:"Current Value (est.)",  type:"number" },
  { key:"mortgage_balance", label:"Outstanding Mortgage",  type:"number" },
  { key:"monthly_payment",  label:"Monthly Payment",       type:"number" },
  { key:"interest_rate",    label:"Interest Rate (%)",     type:"number" },
  { key:"mortgage_renewal", label:"Mortgage Renewal Date", type:"date"   },
];
const DEPOSIT_SCHEMES = ["DPS","TDS","MyDeposits","Other / not protected yet"];
const RENT_FREQS      = [["monthly","Monthly"],["weekly","Weekly"],["quarterly","Quarterly"],["annually","Annually"]];
const LEASE_FIELDS = [
  { key:"lease_years_remaining", label:"Years Remaining",      type:"number" },
  { key:"lease_ground_rent",     label:"Ground Rent (£/yr)",   type:"number" },
  { key:"lease_service_charge",  label:"Service Charge (£/yr)",type:"number" },
  { key:"lease_freeholder",      label:"Freeholder Name",      type:"text"   },
  { key:"lease_next_review",     label:"Next Review Date",     type:"date"   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDaysUntil(d) { if(!d) return 9999; const t=new Date(); t.setHours(0,0,0,0); return Math.round((new Date(d)-t)/86400000); }
function getStatus(days) { if(days<0) return "overdue"; if(days<=30) return "urgent"; if(days<=90) return "warning"; return "ok"; }
const STATUS_COLOR = { overdue:T.red, urgent:T.orange, warning:T.amber, ok:T.green };
function fmtDate(d) { if(!d) return "—"; return new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}); }
function formatDue(d) { const days=getDaysUntil(d),date=fmtDate(d); if(days<0) return `${Math.abs(days)}d overdue`; if(days===0) return "Due today"; if(days<=90) return `${days}d · ${date}`; return date; }
function fmtGBP(n) { if(n==null||n==="") return "—"; return "£"+Number(n).toLocaleString("en-GB"); }
function fixUrl(u) { const t=(u||"").trim(); if(!t) return ""; return /^https?:\/\//i.test(t)?t:"https://"+t; }
function isCurrentTenancy(t) { return !t.end_date || getDaysUntil(t.end_date)>=0; }
function newId() { return Math.random().toString(36).slice(2,9); }

function useDevice() {
  const [w,setW] = useState(window.innerWidth);
  useEffect(()=>{ const h=()=>setW(window.innerWidth); window.addEventListener("resize",h); return()=>window.removeEventListener("resize",h); },[]);
  return { isIPad: w>=768, isMobile: w<768 };
}

function buildWAText(allChecks) {
  const up=allChecks.filter(ch=>getDaysUntil(ch.due)<=90);
  if(!up.length) return "✅ No compliance tasks due in the next 90 days!";
  const fmt=ch=>`  • ${ch.type} — ${ch.property_address?.split(",")[0]} (${fmtDate(ch.due)})`;
  const lines=["📋 *Property Compliance Update*\n"];
  const od=up.filter(ch=>getDaysUntil(ch.due)<0), ur=up.filter(ch=>{const d=getDaysUntil(ch.due);return d>=0&&d<=30;}), so=up.filter(ch=>{const d=getDaysUntil(ch.due);return d>30&&d<=90;});
  if(od.length) lines.push(`🔴 *Overdue*\n${od.map(fmt).join("\n")}`);
  if(ur.length) lines.push(`🟠 *Due within 30 days*\n${ur.map(fmt).join("\n")}`);
  if(so.length) lines.push(`🟡 *Due in 31–90 days*\n${so.map(fmt).join("\n")}`);
  lines.push(`\n_Generated ${new Date().toLocaleDateString("en-GB")}_`);
  return lines.join("\n\n");
}

// ─── UI Primitives ────────────────────────────────────────────────────────────
function Pill({ label, color=T.accent }) {
  return <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color,background:color+"22",padding:"2px 7px",borderRadius:4}}>{label}</span>;
}
function BigNumber({ value, label, sub, color }) {
  return (
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>{label}</div>
      <div style={{fontSize:22,fontWeight:800,color:color||T.text,letterSpacing:"-0.5px",lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:T.muted,marginTop:3}}>{sub}</div>}
    </div>
  );
}
function Card({ children, onClick, style={} }) {
  return <div onClick={onClick} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:"16px 18px",marginBottom:10,cursor:onClick?"pointer":"default",...style}}>{children}</div>;
}
function Section({ title, action }) {
  return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,marginTop:4}}><span style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em"}}>{title}</span>{action}</div>;
}
function Btn({ label, onClick, variant="primary", small=false, disabled=false }) {
  const v={primary:{background:T.accent,color:"#fff",border:"none"},ghost:{background:"transparent",color:T.accent,border:`1px solid ${T.border2}`},danger:{background:T.red+"22",color:T.red,border:`1px solid ${T.red}33`},subtle:{background:T.faint,color:T.muted,border:`1px solid ${T.border}`}};
  return <button onClick={onClick} disabled={disabled} style={{...v[variant],borderRadius:10,padding:small?"5px 12px":"10px 20px",fontSize:small?12:14,fontWeight:700,cursor:disabled?"not-allowed":"pointer",whiteSpace:"nowrap",opacity:disabled?0.5:1}}>{label}</button>;
}
function Input({ label, ...props }) {
  const inputStyle={width:"100%",background:T.surface,border:`1px solid ${T.border2}`,borderRadius:10,padding:"11px 12px",color:T.text,fontSize:15,outline:"none",boxSizing:"border-box"};
  return (
    <div style={{marginBottom:14}}>
      {label&&<div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>{label}</div>}
      {props.asSelect
        ? <select {...props} asSelect={undefined} style={inputStyle}/>
        : <input {...props} style={inputStyle}/>
      }
    </div>
  );
}
function TextArea({ label, ...props }) {
  return (
    <div style={{marginBottom:14}}>
      {label&&<div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>{label}</div>}
      <textarea rows={3} {...props} style={{width:"100%",background:T.surface,border:`1px solid ${T.border2}`,borderRadius:10,padding:"11px 12px",color:T.text,fontSize:15,outline:"none",boxSizing:"border-box",fontFamily:"inherit",resize:"vertical"}}/>
    </div>
  );
}
function Sheet({ open, onClose, title, children }) {
  if(!open) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"#000000BB",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:T.surface2,borderRadius:"24px 24px 0 0",width:"100%",maxWidth:560,maxHeight:"90vh",overflowY:"auto",padding:"0 20px 40px"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"center",padding:"12px 0 4px"}}><div style={{width:36,height:4,background:T.border2,borderRadius:2}}/></div>
        {title&&<div style={{fontSize:18,fontWeight:800,color:T.text,padding:"12px 0 20px",letterSpacing:"-0.3px"}}>{title}</div>}
        {children}
      </div>
    </div>
  );
}
function CheckRow({ check, subtitle, onEdit }) {
  const days=getDaysUntil(check.due), s=getStatus(days), c=STATUS_COLOR[s];
  return (
    <div onClick={onEdit} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 14px",borderRadius:12,marginBottom:6,background:T.surface,border:`1px solid ${T.border}`,cursor:"pointer",borderLeft:`3px solid ${s==="ok"?T.border:c}`}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:c,flexShrink:0,boxShadow:`0 0 8px ${c}`}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:700,color:T.text}}>{check.type}{check.doc_link&&<span title="Has a document link" style={{marginLeft:6,fontSize:12}}>📎</span>}{check.notes&&<span title="Has notes" style={{marginLeft:4,fontSize:12}}>📝</span>}</div>
        {subtitle&&<div style={{fontSize:11,color:T.muted,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{subtitle}</div>}
      </div>
      <div style={{fontSize:12,fontWeight:600,color:s==="ok"?T.muted:c,flexShrink:0}}>{formatDue(check.due)}</div>
    </div>
  );
}

// ─── Auth Screens ─────────────────────────────────────────────────────────────
const FIELD_STYLE = {width:"100%",background:T.surface,border:`1px solid ${T.border2}`,borderRadius:10,padding:"11px 12px",color:T.text,fontSize:15,outline:"none",boxSizing:"border-box"};

function EyeIcon({ off }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {off
        ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/><line x1="1" y1="1" x2="23" y2="23"/></>
        : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
    </svg>
  );
}

function PasswordField({ label, value, onChange, placeholder="••••••••", autoComplete }) {
  const [show,setShow] = useState(false);
  return (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>{label}</div>
      <div style={{position:"relative"}}>
        <input type={show?"text":"password"} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} style={{...FIELD_STYLE,paddingRight:48}}/>
        <button type="button" onClick={()=>setShow(s=>!s)} aria-label={show?"Hide password":"Show password"}
          style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:show?T.accent:T.muted,cursor:"pointer",padding:10,display:"flex",alignItems:"center"}}>
          <EyeIcon off={show}/>
        </button>
      </div>
    </div>
  );
}

function AuthShell({ children }) {
  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit','Helvetica Neue',sans-serif",padding:24,boxSizing:"border-box"}}>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{fontSize:44,marginBottom:12}}>⬡</div>
          <div style={{fontSize:26,fontWeight:800,color:T.text,letterSpacing:"-0.5px"}}>PropCompliance</div>
          <div style={{fontSize:13,color:T.muted,marginTop:6}}>Property Portfolio Manager</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Banner({ kind, children }) {
  const c = kind==="error" ? T.red : T.green;
  return <div style={{background:c+"22",border:`1px solid ${c}44`,borderRadius:10,padding:"12px",marginBottom:16,fontSize:13,color:c,lineHeight:1.5}}>{children}</div>;
}

function BigButton({ loading, onClick, children }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{width:"100%",background:T.accent,color:"#fff",border:"none",borderRadius:12,padding:"14px",fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1,marginTop:4}}>
      {loading?"Please wait…":children}
    </button>
  );
}

function AuthScreen() {
  const [mode,setMode]         = useState("login"); // login | signup | forgot
  const [email,setEmail]       = useState("");
  const [password,setPassword] = useState("");
  const [confirm,setConfirm]   = useState("");
  const [orgName,setOrgName]   = useState("");
  const [loading,setLoading]   = useState(false);
  const [error,setError]       = useState(null);
  const [message,setMessage]   = useState(null);

  function switchMode(m) { setMode(m); setError(null); setMessage(null); setPassword(""); setConfirm(""); }

  async function handleLogin() {
    if(!email||!password) { setError("Enter your email and password"); return; }
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleSignup() {
    if(!email.trim()) { setError("Enter your email"); return; }
    if(password.length<8) { setError("Password must be at least 8 characters"); return; }
    if(password!==confirm) { setError("The two passwords don't match"); return; }
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { organisation_name: orgName.trim() || undefined }, emailRedirectTo: window.location.origin }
    });
    if (error) setError(error.message);
    else setMessage("Check your email and click the confirmation link, then come back and log in.");
    setLoading(false);
  }

  async function handleForgot() {
    if(!email.trim()) { setError("Enter your email address"); return; }
    setLoading(true); setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (error) setError(error.message);
    else setMessage("If that email has an account, a reset link is on its way. Check your inbox (and junk folder).");
    setLoading(false);
  }

  const submit = mode==="login" ? handleLogin : mode==="signup" ? handleSignup : handleForgot;
  const label  = mode==="login" ? "Log in" : mode==="signup" ? "Create account" : "Send reset link";

  return (
    <AuthShell>
      {mode!=="forgot" && (
        <div style={{display:"flex",background:T.surface,borderRadius:12,padding:4,marginBottom:24,gap:3}}>
          {[["login","Log in"],["signup","Sign up"]].map(([m,l])=>(
            <button key={m} onClick={()=>switchMode(m)}
              style={{flex:1,background:mode===m?T.surface2:"transparent",border:mode===m?`1px solid ${T.border2}`:"1px solid transparent",color:mode===m?T.text:T.muted,padding:"9px 0",fontSize:13,fontWeight:700,borderRadius:9,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
      )}
      {mode==="forgot" && <div style={{fontSize:18,fontWeight:800,color:T.text,marginBottom:6}}>Reset your password</div>}
      {mode==="forgot" && <div style={{fontSize:13,color:T.muted,marginBottom:20,lineHeight:1.5}}>Enter your email and we'll send you a link to choose a new password.</div>}

      {message && <Banner kind="ok">{message}</Banner>}
      {error   && <Banner kind="error">{error}</Banner>}

      <Input label="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/>
      {mode!=="forgot" && <PasswordField label="Password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==="login"?"current-password":"new-password"}/>}
      {mode==="signup" && <>
        <PasswordField label="Confirm password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/>
        <Input label="Portfolio name (optional)" type="text" value={orgName} onChange={e=>setOrgName(e.target.value)} placeholder="e.g. Chris & Ben Properties"/>
        <div style={{fontSize:12,color:T.muted,marginTop:-6,marginBottom:14,lineHeight:1.5}}>
          Starting your own portfolio? Name it here. <strong style={{color:T.text}}>Been invited by someone? Leave this blank</strong> and sign up with the email address they invited.
        </div>
      </>}

      <BigButton loading={loading} onClick={submit}>{label}</BigButton>

      {mode==="login" && (
        <div style={{textAlign:"center",marginTop:18}}>
          <button onClick={()=>switchMode("forgot")} style={{background:"none",border:"none",color:T.accent,fontSize:13,fontWeight:600,cursor:"pointer",padding:8}}>Forgot password?</button>
        </div>
      )}
      {mode==="forgot" && (
        <div style={{textAlign:"center",marginTop:18}}>
          <button onClick={()=>switchMode("login")} style={{background:"none",border:"none",color:T.accent,fontSize:13,fontWeight:600,cursor:"pointer",padding:8}}>‹ Back to log in</button>
        </div>
      )}
    </AuthShell>
  );
}

// Shown after someone clicks the link in a password-reset email
function ResetPasswordScreen({ onDone }) {
  const [password,setPassword] = useState("");
  const [confirm,setConfirm]   = useState("");
  const [loading,setLoading]   = useState(false);
  const [error,setError]       = useState(null);
  async function save() {
    if(password.length<8) { setError("Password must be at least 8 characters"); return; }
    if(password!==confirm) { setError("The two passwords don't match"); return; }
    setLoading(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if(error) setError(error.message); else onDone();
  }
  return (
    <AuthShell>
      <div style={{fontSize:18,fontWeight:800,color:T.text,marginBottom:6}}>Choose a new password</div>
      <div style={{fontSize:13,color:T.muted,marginBottom:20}}>At least 8 characters.</div>
      {error && <Banner kind="error">{error}</Banner>}
      <PasswordField label="New password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/>
      <PasswordField label="Confirm new password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/>
      <BigButton loading={loading} onClick={save}>Save password</BigButton>
    </AuthShell>
  );
}

// ─── Account (change password) ────────────────────────────────────────────────
function AccountSheet({ open, onClose, email }) {
  const [password,setPassword] = useState("");
  const [confirm,setConfirm]   = useState("");
  const [loading,setLoading]   = useState(false);
  const [error,setError]       = useState(null);
  const [done,setDone]         = useState(false);
  useEffect(()=>{ if(open) { setPassword(""); setConfirm(""); setError(null); setDone(false); } },[open]);
  async function save() {
    setError(null); setDone(false);
    if(password.length<8) { setError("Password must be at least 8 characters"); return; }
    if(password!==confirm) { setError("The two passwords don't match"); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if(error) setError(error.message); else { setDone(true); setPassword(""); setConfirm(""); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Your account">
      <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Email</div>
      <div style={{fontSize:14,color:T.text,marginBottom:20,wordBreak:"break-all"}}>{email}</div>
      <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Change password</div>
      {error && <Banner kind="error">{error}</Banner>}
      {done  && <Banner kind="ok">Password changed. Use the new one next time you log in.</Banner>}
      <PasswordField label="New password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/>
      <PasswordField label="Confirm new password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/>
      <div style={{display:"flex",gap:10,marginTop:8}}>
        <Btn label="Close" variant="ghost" onClick={onClose}/>
        <button onClick={save} disabled={loading} style={{flex:1,background:T.accent,color:"#fff",border:"none",borderRadius:10,padding:13,fontSize:14,fontWeight:700,cursor:loading?"not-allowed":"pointer",opacity:loading?0.6:1}}>{loading?"Saving…":"Save new password"}</button>
      </div>
    </Sheet>
  );
}

// ─── Team & access (owner only) ───────────────────────────────────────────────
function Toggle({ on, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-pressed={on}
      style={{width:46,height:28,borderRadius:14,border:"none",background:on?T.green:T.border2,position:"relative",cursor:disabled?"not-allowed":"pointer",flexShrink:0,opacity:disabled?0.6:1,transition:"background .15s"}}>
      <span style={{position:"absolute",top:3,left:on?21:3,width:22,height:22,borderRadius:"50%",background:"#fff",transition:"left .15s"}}/>
    </button>
  );
}

function TeamSheet({ open, onClose, orgId, companies, myId }) {
  const [members,setMembers] = useState([]);
  const [access,setAccess]   = useState([]);
  const [invites,setInvites] = useState([]);
  const [email,setEmail]     = useState("");
  const [picked,setPicked]   = useState([]);
  const [busy,setBusy]       = useState(false);
  const [err,setErr]         = useState(null);
  const [msg,setMsg]         = useState(null);
  const [confirmRemove,setConfirmRemove] = useState(null);
  const [lastInvite,setLastInvite] = useState(null);
  const [copied,setCopied] = useState(false);

  const orgCompanies = companies.filter(c=>c.organisation_id===orgId);

  async function refresh() {
    const [m,a,i] = await Promise.all([
      supabase.rpc("team_members"),
      supabase.from("company_access").select("company_id,user_id"),
      supabase.from("invitations").select("*").eq("organisation_id",orgId).is("claimed_at",null).order("created_at"),
    ]);
    if(m.error||a.error||i.error) setErr((m.error||a.error||i.error).message);
    setMembers((m.data||[]).filter(x=>x.organisation_id===orgId&&x.user_id!==myId));
    setAccess(a.data||[]);
    setInvites(i.data||[]);
  }
  useEffect(()=>{ if(open&&orgId) { setErr(null); setMsg(null); setConfirmRemove(null); setLastInvite(null); refresh(); } },[open,orgId]);

  const hasAccess = (uid,cid) => access.some(a=>a.user_id===uid&&a.company_id===cid);

  async function toggle(uid,cid,on) {
    setErr(null); setBusy(true);
    const res = on
      ? await supabase.from("company_access").insert({company_id:cid,user_id:uid})
      : await supabase.from("company_access").delete().eq("company_id",cid).eq("user_id",uid);
    if(res.error) setErr(res.error.message);
    await refresh(); setBusy(false);
  }

  async function removeMember(uid) {
    setErr(null); setBusy(true);
    const ids = orgCompanies.map(c=>c.id);
    if(ids.length) await supabase.from("company_access").delete().eq("user_id",uid).in("company_id",ids);
    const res = await supabase.from("organisation_members").delete().eq("organisation_id",orgId).eq("user_id",uid);
    if(res.error) setErr(res.error.message);
    setConfirmRemove(null); await refresh(); setBusy(false);
  }

  async function sendInvite() {
    const e = email.trim().toLowerCase();
    setErr(null); setMsg(null);
    if(!/^\S+@\S+\.\S+$/.test(e)) { setErr("Enter a valid email address"); return; }
    if(!picked.length) { setErr("Tick at least one company they should see"); return; }
    setBusy(true);
    const res = await supabase.from("invitations").insert({organisation_id:orgId,email:e,company_ids:picked,invited_by:myId});
    if(res.error) setErr(res.error.message);
    else { setMsg(`Access saved for ${e}. Nothing has been emailed. Send them the message below so they can sign up.`); setLastInvite(e); setEmail(""); setPicked([]); }
    await refresh(); setBusy(false);
  }

  async function revokeInvite(id) {
    setBusy(true);
    const res = await supabase.from("invitations").delete().eq("id",id);
    if(res.error) setErr(res.error.message);
    await refresh(); setBusy(false);
  }

  const label = {fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,marginTop:6};
  const nameOf = id => companies.find(c=>c.id===id)?.name||"Unknown company";
  const inviteText = e => `Hi, I've given you access to PropCompliance.\n\n1. Open ${window.location.origin}\n2. Tap "Sign up"\n3. Use this exact email: ${e}\n4. Choose a password (8+ characters) and leave "Portfolio name" blank\n5. Click the confirmation link in the email you get, then log in.`;
  function copyInvite(e) { navigator.clipboard.writeText(inviteText(e)).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); }); }

  return (
    <Sheet open={open} onClose={onClose} title="Team & access">
      {err && <Banner kind="error">{err}</Banner>}
      {msg && <Banner kind="ok">{msg}</Banner>}
      {lastInvite && (
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:14,marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:T.amber,marginBottom:6}}>Send this to them yourself (e.g. WhatsApp)</div>
          <div style={{fontSize:12,color:T.text,whiteSpace:"pre-wrap",lineHeight:1.6,marginBottom:10}}>{inviteText(lastInvite)}</div>
          <Btn label={copied?"✓ Copied!":"Copy message"} onClick={()=>copyInvite(lastInvite)} variant={copied?"ghost":"primary"} small/>
        </div>
      )}

      <div style={label}>People with access</div>
      {members.length===0 && <div style={{fontSize:13,color:T.muted,marginBottom:16,lineHeight:1.5}}>Nobody else yet. Give someone access below. You (the owner) always see every company.</div>}
      {members.map(m=>(
        <div key={m.user_id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px",marginBottom:10}}>
          <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:10,wordBreak:"break-all"}}>{m.email}</div>
          {orgCompanies.length===0 && <div style={{fontSize:12,color:T.muted}}>No companies yet.</div>}
          {orgCompanies.map(c=>(
            <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"7px 0"}}>
              <span style={{fontSize:13,color:T.text}}>{c.name}</span>
              <Toggle on={hasAccess(m.user_id,c.id)} disabled={busy} onClick={()=>toggle(m.user_id,c.id,!hasAccess(m.user_id,c.id))}/>
            </div>
          ))}
          <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${T.border}`}}>
            {confirmRemove===m.user_id
              ? <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:12,color:T.red,flex:1}}>Remove this person completely?</span>
                  <Btn label="Cancel" variant="ghost" small onClick={()=>setConfirmRemove(null)}/>
                  <Btn label="Yes, remove" variant="danger" small disabled={busy} onClick={()=>removeMember(m.user_id)}/>
                </div>
              : <Btn label="Remove person" variant="danger" small onClick={()=>setConfirmRemove(m.user_id)}/>}
          </div>
        </div>
      ))}

      {invites.length>0 && <>
        <div style={{...label,marginTop:18}}>Waiting for them to sign up</div>
        {invites.map(inv=>(
          <div key={inv.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:"12px 14px",marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700,color:T.text,wordBreak:"break-all"}}>{inv.email}</div>
            <div style={{fontSize:12,color:T.muted,margin:"4px 0 10px",lineHeight:1.5}}>Will see: {inv.company_ids.map(nameOf).join(", ")}</div>
            <Btn label="Cancel access" variant="danger" small disabled={busy} onClick={()=>revokeInvite(inv.id)}/>
          </div>
        ))}
      </>}

      <div style={{...label,marginTop:18}}>Give someone access</div>
      <Input label="Their email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/>
      <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Companies they can see</div>
      {orgCompanies.map(c=>(
        <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"7px 0"}}>
          <span style={{fontSize:13,color:T.text}}>{c.name}</span>
          <Toggle on={picked.includes(c.id)} onClick={()=>setPicked(p=>p.includes(c.id)?p.filter(x=>x!==c.id):[...p,c.id])}/>
        </div>
      ))}
      <div style={{display:"flex",gap:10,marginTop:14}}>
        <Btn label="Close" variant="ghost" onClick={onClose}/>
        <button onClick={sendInvite} disabled={busy} style={{flex:1,background:T.accent,color:"#fff",border:"none",borderRadius:10,padding:13,fontSize:14,fontWeight:700,cursor:busy?"not-allowed":"pointer",opacity:busy?0.6:1}}>Save access</button>
      </div>
      <div style={{fontSize:11,color:T.muted,marginTop:12,lineHeight:1.5}}>The app does not send any email. After you save, you get a ready-made message to send them yourself. They then sign up with the same email address.</div>
    </Sheet>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { isIPad } = useDevice();
  const [session,setSession]   = useState(null);
  const [authReady,setAuthReady] = useState(false);
  const [orgId,setOrgId]       = useState(null);
  const [companies,setCompanies] = useState([]);
  const [properties,setProperties] = useState([]);
  const [checks,setChecks]     = useState([]);
  const [financials,setFinancials] = useState([]);
  const [tenancies,setTenancies] = useState([]);
  const [search,setSearch]     = useState("");
  const [sheetError,setSheetError] = useState(null);
  const [accountOpen,setAccountOpen] = useState(false);
  const [loading,setLoading]   = useState(false);
  const [tab,setTab]           = useState("home");
  const [stack,setStack]       = useState([]);
  const [propTab,setPropTab]   = useState("compliance");
  const [sheet,setSheet]       = useState(null);
  const [sheetTarget,setSheetTarget] = useState(null);
  const [form,setForm]         = useState({});
  const [copyDone,setCopyDone] = useState(false);
  const [recovering,setRecovering] = useState(false);
  const [isOwner,setIsOwner]   = useState(false);
  const [loadError,setLoadError] = useState(null);
  const [teamOpen,setTeamOpen] = useState(false);

  // Auth listener
  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{ setSession(session); setAuthReady(true); });
    const { data:{ subscription } } = supabase.auth.onAuthStateChange((event,session)=>{ if(event==="PASSWORD_RECOVERY") setRecovering(true); setSession(session); });
    return ()=>subscription.unsubscribe();
  },[]);

  // Load org and data when session ready
  useEffect(()=>{
    if(session) loadAll();
  },[session]);

  async function loadAll() {
    setLoading(true); setLoadError(null);
    // Turn any pending email invitation for this user into access (safe to call every time)
    await supabase.rpc("claim_invitations");
    const { data:mems, error:memErr } = await supabase.from("organisation_members").select("organisation_id,role").eq("user_id",session.user.id);
    if(memErr) { setLoadError(memErr.message); setLoading(false); return; }
    const ownerMem = (mems||[]).find(m=>m.role==="owner");
    setOrgId(ownerMem?.organisation_id||null);
    setIsOwner(!!ownerMem);
    // The database only returns the companies this person is allowed to see
    const { data:cos, error:coErr } = await supabase.from("companies").select("*").order("created_at");
    if(coErr) { setLoadError(coErr.message); setLoading(false); return; }
    setCompanies(cos||[]);
    const coIds = (cos||[]).map(c=>c.id);
    if(coIds.length) {
      const { data:props } = await supabase.from("properties").select("*").in("company_id",coIds).order("created_at");
      setProperties(props||[]);
      const propIds = (props||[]).map(p=>p.id);
      if(propIds.length) {
        const [{ data:chks },{ data:fins },{ data:tens }] = await Promise.all([
          supabase.from("checks").select("*").in("property_id",propIds).order("due"),
          supabase.from("financials").select("*").in("property_id",propIds),
          supabase.from("tenancies").select("*").in("property_id",propIds).order("start_date",{ascending:false}),
        ]);
        setChecks(chks||[]);
        setFinancials(fins||[]);
        setTenancies(tens||[]);
      } else { setChecks([]); setFinancials([]); setTenancies([]); }
    } else { setProperties([]); setChecks([]); setFinancials([]); setTenancies([]); }
    setLoading(false);
  }

  // Navigation
  const currentFrame   = stack[stack.length-1]||null;
  const companyFrame   = stack.find(s=>s.type==="company")||null;
  const propertyFrame  = stack.find(s=>s.type==="property")||null;
  const company        = companyFrame  ? companies.find(c=>c.id===companyFrame.id)  : null;
  const property       = propertyFrame ? properties.find(p=>p.id===propertyFrame.id) : null;
  const fin            = financials.find(f=>f.property_id===property?.id)||{};
  const propChecks     = checks.filter(ch=>ch.property_id===property?.id);
  const propTenancies  = tenancies.filter(t=>t.property_id===property?.id);
  function pushStack(frame) { setStack(prev=>[...prev,frame]); }
  function popStack()  { setStack(prev=>prev.slice(0,-1)); }
  function resetStack(){ setStack([]); }

  function openSheet(name,target=null) {
    setSheet(name); setSheetTarget(target); setSheetError(null);
    if(name==="editCheck"&&target)   setForm({type:target.type,due:target.due||"",doc_link:target.doc_link||"",notes:target.notes||""});
    else if(name==="addTenancy")     setForm({rent_frequency:"monthly"});
    else if(name==="editTenancy"&&target) setForm({...target});
    else if(name==="editFinancials"&&target) setForm({...target,leasehold:!!target.is_leasehold});
    else if(name==="editProperty"&&target) setForm({address:target.address,type:target.type,tenants:target.tenants,purchase_date:target.purchase_date||"",notes:target.notes||""});
    else setForm({});
  }
  function closeSheet() { setSheet(null); setSheetTarget(null); setForm({}); setSheetError(null); }

  // ── CRUD ──
  async function handleAddCompany() {
    if(!form.name||!orgId) return;
    const { data, error } = await supabase.from("companies").insert({name:form.name.trim(),organisation_id:orgId}).select().single();
    if(error) setLoadError("Couldn't add company: "+error.message);
    if(data) setCompanies(prev=>[...prev,data]);
    closeSheet();
  }
  async function handleDeleteCompany() {
    if(!sheetTarget) return;
    await supabase.from("companies").delete().eq("id",sheetTarget.id);
    setCompanies(prev=>prev.filter(c=>c.id!==sheetTarget.id));
    setProperties(prev=>prev.filter(p=>p.company_id!==sheetTarget.id));
    resetStack(); closeSheet();
  }
  async function handleAddProperty() {
    if(!form.address||!sheetTarget) return;
    const { data } = await supabase.from("properties").insert({company_id:sheetTarget.companyId,address:form.address,type:form.type||"BTL",tenants:parseInt(form.tenants)||1,purchase_date:form.purchase_date||null,notes:form.notes||null}).select().single();
    if(data) setProperties(prev=>[...prev,data]);
    closeSheet();
  }
  async function handleEditProperty() {
    if(!form.address||!sheetTarget) return;
    const updates = {address:form.address,type:form.type,tenants:parseInt(form.tenants)||1,purchase_date:form.purchase_date||null,notes:form.notes||null};
    const { data } = await supabase.from("properties").update(updates).eq("id",sheetTarget.id).select().single();
    if(data) setProperties(prev=>prev.map(p=>p.id===sheetTarget.id?data:p));
    closeSheet();
  }
  async function handleDeleteProperty() {
    if(!sheetTarget) return;
    await supabase.from("properties").delete().eq("id",sheetTarget.id);
    setProperties(prev=>prev.filter(p=>p.id!==sheetTarget.id));
    setChecks(prev=>prev.filter(ch=>ch.property_id!==sheetTarget.id));
    setFinancials(prev=>prev.filter(f=>f.property_id!==sheetTarget.id));
    setTenancies(prev=>prev.filter(t=>t.property_id!==sheetTarget.id));
    popStack(); closeSheet();
  }
  async function handleAddCheck() {
    if(!form.type||!form.due||!sheetTarget) return;
    const { data, error } = await supabase.from("checks").insert({property_id:sheetTarget.propertyId,type:form.type,due:form.due,doc_link:fixUrl(form.doc_link)||null,notes:(form.notes||"").trim()||null}).select().single();
    if(error) { setSheetError("Couldn't save: "+error.message); return; }
    if(data) setChecks(prev=>[...prev,data]);
    closeSheet();
  }
  async function handleEditCheck() {
    if(!form.type||!form.due||!sheetTarget) return;
    const { data, error } = await supabase.from("checks").update({type:form.type,due:form.due,doc_link:fixUrl(form.doc_link)||null,notes:(form.notes||"").trim()||null}).eq("id",sheetTarget.id).select().single();
    if(error) { setSheetError("Couldn't save: "+error.message); return; }
    if(data) setChecks(prev=>prev.map(ch=>ch.id===sheetTarget.id?data:ch));
    closeSheet();
  }
  async function handleDeleteCheck() {
    if(!sheetTarget) return;
    await supabase.from("checks").delete().eq("id",sheetTarget.id);
    setChecks(prev=>prev.filter(ch=>ch.id!==sheetTarget.id));
    closeSheet();
  }
  async function handleSaveFinancials() {
    if(!sheetTarget) return;
    const isLeasehold = !!form.leasehold;
    const payload = {
      property_id:           sheetTarget.propertyId,
      purchase_price:        parseFloat(form.purchase_price)||null,
      current_value:         parseFloat(form.current_value)||null,
      mortgage_balance:      parseFloat(form.mortgage_balance)||null,
      monthly_payment:       parseFloat(form.monthly_payment)||null,
      interest_rate:         parseFloat(form.interest_rate)||null,
      mortgage_renewal:      form.mortgage_renewal||null,
      is_leasehold:          isLeasehold,
      lease_years_remaining: isLeasehold ? parseInt(form.lease_years_remaining)||null : null,
      lease_ground_rent:     isLeasehold ? parseFloat(form.lease_ground_rent)||null   : null,
      lease_service_charge:  isLeasehold ? parseFloat(form.lease_service_charge)||null: null,
      lease_freeholder:      isLeasehold ? form.lease_freeholder||null                : null,
      lease_next_review:     isLeasehold ? form.lease_next_review||null               : null,
    };
    const existing = financials.find(f=>f.property_id===sheetTarget.propertyId);
    let data;
    if(existing) {
      const res = await supabase.from("financials").update(payload).eq("id",existing.id).select().single();
      data = res.data;
      if(data) setFinancials(prev=>prev.map(f=>f.id===existing.id?data:f));
    } else {
      const res = await supabase.from("financials").insert(payload).select().single();
      data = res.data;
      if(data) setFinancials(prev=>[...prev,data]);
    }
    closeSheet();
  }

  async function handleSaveTenancy() {
    if(!sheetTarget) return;
    if(!(form.tenant_name||"").trim()) { setSheetError("Enter the tenant's name"); return; }
    const payload = {
      tenant_name:    form.tenant_name.trim(),
      tenant_phone:   (form.tenant_phone||"").trim()||null,
      tenant_email:   (form.tenant_email||"").trim()||null,
      start_date:     form.start_date||null,
      end_date:       form.end_date||null,
      rent_amount:    form.rent_amount===""||form.rent_amount==null ? null : parseFloat(form.rent_amount),
      rent_frequency: form.rent_frequency||"monthly",
      deposit_amount: form.deposit_amount===""||form.deposit_amount==null ? null : parseFloat(form.deposit_amount),
      deposit_scheme: form.deposit_scheme||null,
      deposit_ref:    (form.deposit_ref||"").trim()||null,
      break_clause:   form.break_clause||null,
      doc_link:       fixUrl(form.doc_link)||null,
      notes:          (form.notes||"").trim()||null,
    };
    if(sheet==="addTenancy") {
      const { data, error } = await supabase.from("tenancies").insert({...payload,property_id:sheetTarget.propertyId}).select().single();
      if(error) { setSheetError("Couldn't save: "+error.message); return; }
      if(data) setTenancies(prev=>[data,...prev]);
    } else {
      const { data, error } = await supabase.from("tenancies").update(payload).eq("id",sheetTarget.id).select().single();
      if(error) { setSheetError("Couldn't save: "+error.message); return; }
      if(data) setTenancies(prev=>prev.map(t=>t.id===sheetTarget.id?data:t));
    }
    closeSheet();
  }
  async function handleDeleteTenancy() {
    if(!sheetTarget) return;
    const { error } = await supabase.from("tenancies").delete().eq("id",sheetTarget.id);
    if(error) { setSheetError("Couldn't delete: "+error.message); return; }
    setTenancies(prev=>prev.filter(t=>t.id!==sheetTarget.id));
    closeSheet();
  }

  function getAllChecks() {
    return checks.map(ch=>{
      const prop = properties.find(p=>p.id===ch.property_id);
      const co   = prop ? companies.find(c=>c.id===prop.company_id) : null;
      return { ...ch, property_address:prop?.address, company_name:co?.name };
    }).sort((a,b)=>getDaysUntil(a.due)-getDaysUntil(b.due));
  }

  // Mortgage renewals appear alongside compliance checks in Alerts / Home / WhatsApp
  function getMortgageItems() {
    return financials.filter(f=>f.mortgage_renewal).map(f=>{
      const prop = properties.find(p=>p.id===f.property_id);
      const co   = prop ? companies.find(c=>c.id===prop.company_id) : null;
      return { id:"mort-"+f.id, type:"Mortgage renewal", due:f.mortgage_renewal, property_id:f.property_id, property_address:prop?.address, company_name:co?.name, isMortgage:true };
    });
  }
  function openItem(ch) {
    if(ch.isMortgage) { const f=financials.find(x=>x.property_id===ch.property_id)||{}; openSheet("editFinancials",{...f,propertyId:ch.property_id}); }
    else openSheet("editCheck",ch);
  }
  function goToProperty(p) { setTab("home"); setSearch(""); setStack([{type:"company",id:p.company_id},{type:"property",id:p.id}]); setPropTab("compliance"); }

  function downloadBackup() {
    const payload = { app:"PropCompliance", exported_at:new Date().toISOString(), exported_by:session.user.email, companies, properties, checks, financials, tenancies };
    const blob = new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `propcompliance-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function copyWA(text) { navigator.clipboard.writeText(text).then(()=>{ setCopyDone(true); setTimeout(()=>setCopyDone(false),2000); }); }

  // ── Derived ──
  if(!authReady) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg}}><div style={{width:32,height:32,border:`3px solid ${T.border2}`,borderTopColor:T.accent,borderRadius:"50%"}}/></div>;
  if(!session)   return <AuthScreen/>;
  if(recovering) return <ResetPasswordScreen onDone={()=>setRecovering(false)}/>;

  const allChecks  = getAllChecks();
  const allItems   = [...allChecks, ...getMortgageItems()].sort((a,b)=>getDaysUntil(a.due)-getDaysUntil(b.due));
  const alerts     = allItems.filter(ch=>getDaysUntil(ch.due)<=90);
  const q          = search.trim().toLowerCase();
  const searchResults = q ? properties.filter(p=>{
    const co = companies.find(c=>c.id===p.company_id);
    const tn = tenancies.filter(t=>t.property_id===p.id).map(t=>t.tenant_name||"").join(" ");
    return [p.address,p.type,p.notes,co?.name,tn].some(v=>(v||"").toLowerCase().includes(q));
  }) : [];
  const equity     = (fin.current_value&&fin.mortgage_balance) ? fin.current_value-fin.mortgage_balance : null;
  const gain       = (fin.current_value&&fin.purchase_price)   ? fin.current_value-fin.purchase_price   : null;
  const mortDays   = fin.mortgage_renewal ? getDaysUntil(fin.mortgage_renewal) : null;
  const totals     = properties.reduce((acc,p)=>{
    const f=financials.find(fin=>fin.property_id===p.id)||{};
    acc.value+=f.current_value||0; acc.mortgage+=f.mortgage_balance||0; acc.payment+=f.monthly_payment||0; acc.count++;
    return acc;
  },{value:0,mortgage:0,payment:0,count:0});
  const waText = buildWAText(allItems);
  const maxW   = isIPad ? 768 : 480;

  const showHome     = tab==="home"&&!currentFrame;
  const showCompany  = tab==="home"&&currentFrame?.type==="company";
  const showProperty = tab==="home"&&currentFrame?.type==="property";

  return (
    <div style={{background:T.bg,minHeight:"100vh",maxWidth:maxW,margin:"0 auto",fontFamily:"'Outfit','Helvetica Neue',sans-serif",paddingBottom:80,overflow:"hidden"}}>

      {/* ── Top bar ── */}
      <div style={{background:T.bg,borderBottom:`1px solid ${T.border}`,padding:"16px 20px 12px",paddingTop:"calc(16px + env(safe-area-inset-top))",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {stack.length>0&&<button onClick={popStack} style={{background:"none",border:"none",color:T.accent,fontSize:22,cursor:"pointer",padding:"0 4px 0 0",lineHeight:1}}>‹</button>}
            <div>
              {stack.length===0&&tab==="home"&&<div style={{fontSize:20,fontWeight:800,color:T.text,letterSpacing:"-0.5px"}}>PropCompliance</div>}
              {showCompany&&<div style={{fontSize:18,fontWeight:800,color:T.text,letterSpacing:"-0.3px"}}>{company?.name}</div>}
              {showProperty&&<div style={{fontSize:18,fontWeight:800,color:T.text,letterSpacing:"-0.3px"}}>{property?.address.split(",")[0]}</div>}
              {tab==="alerts"&&<div style={{fontSize:20,fontWeight:800,color:T.text,letterSpacing:"-0.5px"}}>Alerts</div>}
              {tab==="settings"&&<div style={{fontSize:20,fontWeight:800,color:T.text,letterSpacing:"-0.5px"}}>Settings</div>}
            </div>
          </div>
          {loading&&<div style={{width:18,height:18,border:`2px solid ${T.border2}`,borderTopColor:T.accent,borderRadius:"50%"}}/>}
        </div>
      </div>

      <div style={{padding:"20px 16px"}}>

        {/* ══ HOME ══ */}
        {showHome&&<>
          {totals.count>0&&(
            <div style={{background:`linear-gradient(135deg,${T.accentDim},${T.surface})`,border:`1px solid ${T.border2}`,borderRadius:20,padding:20,marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:16}}>Portfolio Overview</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                <BigNumber label="Total Value"    value={fmtGBP(totals.value)}    sub={`${totals.count} propert${totals.count===1?"y":"ies"}`}/>
                <BigNumber label="Total Equity"   value={fmtGBP(totals.value-totals.mortgage)} color={totals.value-totals.mortgage>0?T.green:T.red}/>
                <BigNumber label="Mortgage Debt"  value={fmtGBP(totals.mortgage)}/>
                <BigNumber label="Monthly"        value={fmtGBP(totals.payment)}  sub="combined payments"/>
              </div>
            </div>
          )}

          {properties.length>0&&(
            <div style={{position:"relative",marginBottom:18}}>
              <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search properties, companies, tenants…"
                style={{...FIELD_STYLE,paddingLeft:38}}/>
              <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:15,color:T.muted,pointerEvents:"none"}}>🔍</span>
            </div>
          )}
          {q&&<>
            <Section title={`${searchResults.length} result${searchResults.length===1?"":"s"}`}/>
            {searchResults.length===0&&<div style={{textAlign:"center",padding:"30px 20px",color:T.muted,fontSize:13}}>Nothing matches "{search.trim()}".</div>}
            {searchResults.map(p=>{
              const co=companies.find(c=>c.id===p.company_id);
              const cur=tenancies.filter(t=>t.property_id===p.id&&isCurrentTenancy(t));
              return (
                <Card key={p.id} onClick={()=>goToProperty(p)}>
                  <div style={{fontSize:15,fontWeight:700,color:T.text}}>{p.address.split(",")[0]}</div>
                  <div style={{fontSize:12,color:T.muted,marginTop:2}}>{p.address.split(",").slice(1).join(",").trim()}</div>
                  <div style={{fontSize:12,color:T.muted,marginTop:6}}>{co?.name}{cur.length>0&&` · ${cur.map(t=>t.tenant_name).filter(Boolean).join(", ")}`}</div>
                </Card>
              );
            })}
          </>}

          {!q&&<>
          <Section title="Companies" action={isOwner?<Btn label="+ Add" variant="ghost" small onClick={()=>openSheet("addCompany")}/>:null}/>
          {loadError&&<Banner kind="error">{loadError}</Banner>}

          {companies.length===0&&!loading&&(
            <div style={{textAlign:"center",padding:"48px 20px"}}>
              <div style={{fontSize:40,marginBottom:12}}>🏠</div>
              <div style={{fontSize:16,fontWeight:700,color:T.text,marginBottom:6}}>No companies yet</div>
              {isOwner
                ?<><div style={{fontSize:13,color:T.muted,marginBottom:20}}>Add your first limited company to get started</div><Btn label="Add Company" onClick={()=>openSheet("addCompany")}/></>
                :<div style={{fontSize:13,color:T.muted,lineHeight:1.5}}>No companies have been shared with you yet. Ask the portfolio owner to give you access, then pull down to refresh or log in again.</div>}
            </div>
          )}

          {companies.map(c=>{
            const cProps=properties.filter(p=>p.company_id===c.id);
            const cChecks=checks.filter(ch=>cProps.some(p=>p.id===ch.property_id));
            const od=cChecks.filter(ch=>getDaysUntil(ch.due)<0).length;
            const ur=cChecks.filter(ch=>{const d=getDaysUntil(ch.due);return d>=0&&d<=30;}).length;
            const totalVal=cProps.reduce((a,p)=>a+(financials.find(f=>f.property_id===p.id)?.current_value||0),0);
            const totalEq=cProps.reduce((a,p)=>{const f=financials.find(fin=>fin.property_id===p.id)||{};return a+(f.current_value||0)-(f.mortgage_balance||0);},0);
            return (
              <Card key={c.id} onClick={()=>pushStack({type:"company",id:c.id})}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:totalVal?12:0}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:700,color:T.text}}>{c.name}</div>
                    <div style={{fontSize:12,color:T.muted,marginTop:2}}>{cProps.length} propert{cProps.length===1?"y":"ies"}</div>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {od>0&&<Pill label={`${od} overdue`} color={T.red}/>}
                    {ur>0&&<Pill label={`${ur} due`} color={T.orange}/>}
                    <span style={{color:T.muted,fontSize:20}}>›</span>
                  </div>
                </div>
                {totalVal>0&&(
                  <div style={{display:"flex",gap:16,paddingTop:12,borderTop:`1px solid ${T.border}`}}>
                    <div><div style={{fontSize:10,color:T.muted}}>Value</div><div style={{fontSize:13,fontWeight:700,color:T.text}}>{fmtGBP(totalVal)}</div></div>
                    <div><div style={{fontSize:10,color:T.muted}}>Equity</div><div style={{fontSize:13,fontWeight:700,color:totalEq>0?T.green:T.red}}>{fmtGBP(totalEq)}</div></div>
                  </div>
                )}
              </Card>
            );
          })}

          {alerts.filter(ch=>getDaysUntil(ch.due)<=30).length>0&&<>
            <Section title="Due within 30 days" action={<Btn label="See all" variant="ghost" small onClick={()=>setTab("alerts")}/>}/>
            {allItems.filter(ch=>getDaysUntil(ch.due)<=30).slice(0,3).map(ch=>(
              <CheckRow key={ch.id} check={ch} subtitle={`${ch.property_address?.split(",")[0]} · ${ch.company_name}`} onEdit={()=>openItem(ch)}/>
            ))}
          </>}
          </>}
        </>}

        {/* ══ COMPANY ══ */}
        {showCompany&&company&&<>
          <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
            <Btn label="+ Add Property" onClick={()=>openSheet("addProperty",{companyId:company.id})}/>
            {isOwner&&<Btn label="Delete Company" variant="danger" small onClick={()=>openSheet("deleteCompany",company)}/>}
          </div>
          {properties.filter(p=>p.company_id===company.id).length===0&&(
            <div style={{textAlign:"center",padding:"40px 20px",color:T.muted,fontSize:13}}>No properties yet. Add one above.</div>
          )}
          {properties.filter(p=>p.company_id===company.id).map(p=>{
            const pChecks=checks.filter(ch=>ch.property_id===p.id);
            const od=pChecks.filter(ch=>getDaysUntil(ch.due)<0).length;
            const ur=pChecks.filter(ch=>{const d=getDaysUntil(ch.due);return d>=0&&d<=30;}).length;
            const f=financials.find(fin=>fin.property_id===p.id)||{};
            const eq=(f.current_value&&f.mortgage_balance)?f.current_value-f.mortgage_balance:null;
            return (
              <Card key={p.id} onClick={()=>{pushStack({type:"property",id:p.id});setPropTab("compliance");}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:15,fontWeight:700,color:T.text}}>{p.address.split(",")[0]}</div>
                    <div style={{fontSize:12,color:T.muted,marginTop:2}}>{p.address.split(",").slice(1).join(",").trim()}</div>
                    <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap",alignItems:"center"}}>
                      <Pill label={p.type} color={T.accent}/>
                      <Pill label={`${p.tenants} tenant${p.tenants!==1?"s":""}`} color={T.muted}/>
                      {f.is_leasehold&&<Pill label="Leasehold" color={T.purple}/>}
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,marginLeft:10}}>
                    {od>0&&<Pill label={`${od} overdue`} color={T.red}/>}
                    {ur>0&&<Pill label={`${ur} due`} color={T.orange}/>}
                    {eq!==null&&<div style={{fontSize:12,fontWeight:700,color:eq>0?T.green:T.red}}>{fmtGBP(eq)}</div>}
                    <span style={{color:T.muted,fontSize:20}}>›</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </>}

        {/* ══ PROPERTY ══ */}
        {showProperty&&property&&company&&<>
          <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <Pill label={property.type} color={T.accent}/>
              <Pill label={`${property.tenants} tenant${property.tenants!==1?"s":""}`} color={T.muted}/>
              {fin.is_leasehold&&<Pill label="Leasehold" color={T.purple}/>}
            </div>
            <div style={{display:"flex",gap:6}}>
              <Btn label="Edit" variant="ghost" small onClick={()=>openSheet("editProperty",property)}/>
              <Btn label="Delete" variant="danger" small onClick={()=>openSheet("deleteProperty",property)}/>
            </div>
          </div>

          {!isIPad&&(
            <div style={{display:"flex",background:T.surface,borderRadius:12,padding:4,marginBottom:16,gap:3}}>
              {[["compliance","Compliance"],["financials","Financials"],["tenants","Tenants"]].map(([t,l])=>(
                <button key={t} style={{flex:1,background:propTab===t?T.surface2:"transparent",border:propTab===t?`1px solid ${T.border2}`:"1px solid transparent",color:propTab===t?T.text:T.muted,padding:"9px",fontSize:13,fontWeight:700,borderRadius:9,cursor:"pointer"}} onClick={()=>setPropTab(t)}>{l}</button>
              ))}
            </div>
          )}

          <div style={isIPad?{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"start"}:{}}>
            {(propTab==="compliance"||isIPad)&&<div>
              <Section title="Compliance Checks" action={<Btn label="+ Add" variant="ghost" small onClick={()=>openSheet("addCheck",{propertyId:property.id})}/>}/>
              {propChecks.length===0&&<div style={{textAlign:"center",padding:"24px",color:T.muted,fontSize:13}}>No checks yet.</div>}
              {[...propChecks].sort((a,b)=>getDaysUntil(a.due)-getDaysUntil(b.due)).map(ch=>(
                <CheckRow key={ch.id} check={ch} onEdit={()=>openSheet("editCheck",ch)}/>
              ))}
            </div>}

            {(propTab==="financials"||isIPad)&&<div>
              <Section title="Financials" action={<Btn label="Edit" variant="ghost" small onClick={()=>openSheet("editFinancials",{...fin,propertyId:property.id})}/>}/>
              {!fin.purchase_price&&!fin.current_value
                ?<div style={{textAlign:"center",padding:"24px",color:T.muted,fontSize:13}}>No financial data yet — tap Edit to add.</div>
                :<>
                  <div style={{background:`linear-gradient(135deg,${T.accentDim},${T.surface})`,border:`1px solid ${T.border2}`,borderRadius:16,padding:16,marginBottom:10}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                      <BigNumber label="Purchase Price" value={fmtGBP(fin.purchase_price)}/>
                      <BigNumber label="Current Value"  value={fmtGBP(fin.current_value)}/>
                      <BigNumber label="Equity" value={equity!==null?fmtGBP(equity):"—"} color={equity>0?T.green:equity<0?T.red:undefined} sub={gain!==null?`${gain>=0?"+":""}${fmtGBP(gain)} vs purchase`:undefined}/>
                      <BigNumber label="Mortgage" value={fmtGBP(fin.mortgage_balance)}/>
                    </div>
                  </div>
                  <Card>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>Mortgage</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                      {[["Monthly",fmtGBP(fin.monthly_payment)],["Rate",fin.interest_rate?`${fin.interest_rate}%`:"—"],["Renewal",fmtDate(fin.mortgage_renewal)],["Days left",mortDays!==null?(mortDays<0?`${Math.abs(mortDays)}d overdue`:`${mortDays}d`):"—"]].map(([l,v])=>(
                        <div key={l}><div style={{fontSize:10,color:T.muted}}>{l}</div><div style={{fontSize:14,fontWeight:700,color:l==="Days left"&&mortDays!==null&&mortDays<=90?STATUS_COLOR[getStatus(mortDays)]:T.text}}>{v}</div></div>
                      ))}
                    </div>
                  </Card>
                  {fin.is_leasehold&&(
                    <Card style={{borderColor:T.purple+"44"}}>
                      <div style={{fontSize:11,fontWeight:700,color:T.purple,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>Leasehold</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                        {[["Years left",fin.lease_years_remaining??"—"],["Ground rent",fmtGBP(fin.lease_ground_rent)+"/yr"],["Service charge",fmtGBP(fin.lease_service_charge)+"/yr"],["Freeholder",fin.lease_freeholder||"—"],["Next review",fmtDate(fin.lease_next_review)]].map(([l,v])=>(
                          <div key={l}><div style={{fontSize:10,color:T.muted}}>{l}</div><div style={{fontSize:13,fontWeight:700,color:T.text}}>{v}</div></div>
                        ))}
                      </div>
                    </Card>
                  )}
                </>
              }
            </div>}

            {(propTab==="tenants"||isIPad)&&<div style={isIPad?{gridColumn:"1 / span 2"}:{}}>
              <Section title="Tenants" action={<Btn label="+ Add" variant="ghost" small onClick={()=>openSheet("addTenancy",{propertyId:property.id})}/>}/>
              {propTenancies.length===0&&<div style={{textAlign:"center",padding:"24px",color:T.muted,fontSize:13}}>No tenants recorded yet.</div>}
              {propTenancies.map(t=>{
                const cur=isCurrentTenancy(t);
                const endDays=t.end_date?getDaysUntil(t.end_date):null;
                return (
                  <Card key={t.id} onClick={()=>openSheet("editTenancy",t)} style={{opacity:cur?1:0.65}}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,marginBottom:8}}>
                      <div style={{fontSize:15,fontWeight:700,color:T.text,minWidth:0,wordBreak:"break-word"}}>{t.tenant_name||"Unnamed tenant"}</div>
                      <Pill label={cur?"Current":"Ended"} color={cur?T.green:T.muted}/>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <div><div style={{fontSize:10,color:T.muted}}>Rent</div><div style={{fontSize:13,fontWeight:700,color:T.text}}>{t.rent_amount!=null?`${fmtGBP(t.rent_amount)} ${t.rent_frequency||"monthly"}`:"—"}</div></div>
                      <div><div style={{fontSize:10,color:T.muted}}>Deposit</div><div style={{fontSize:13,fontWeight:700,color:T.text}}>{t.deposit_amount!=null?fmtGBP(t.deposit_amount):"—"}{t.deposit_scheme?` · ${t.deposit_scheme.split(" ")[0]}`:""}</div></div>
                      <div><div style={{fontSize:10,color:T.muted}}>Started</div><div style={{fontSize:13,fontWeight:700,color:T.text}}>{fmtDate(t.start_date)}</div></div>
                      <div><div style={{fontSize:10,color:T.muted}}>Ends</div><div style={{fontSize:13,fontWeight:700,color:endDays!==null&&endDays>=0&&endDays<=90?STATUS_COLOR[getStatus(endDays)]:T.text}}>{t.end_date?fmtDate(t.end_date):"Rolling / not set"}</div></div>
                    </div>
                    {(t.tenant_phone||t.tenant_email||t.doc_link)&&(
                      <div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:12,paddingTop:10,borderTop:`1px solid ${T.border}`}} onClick={e=>e.stopPropagation()}>
                        {t.tenant_phone&&<a href={`tel:${t.tenant_phone.replace(/\s+/g,"")}`} style={{fontSize:13,fontWeight:600,color:T.accent,textDecoration:"none"}}>📞 {t.tenant_phone}</a>}
                        {t.tenant_email&&<a href={`mailto:${t.tenant_email}`} style={{fontSize:13,fontWeight:600,color:T.accent,textDecoration:"none",wordBreak:"break-all"}}>✉️ {t.tenant_email}</a>}
                        {t.doc_link&&<a href={fixUrl(t.doc_link)} target="_blank" rel="noopener noreferrer" style={{fontSize:13,fontWeight:600,color:T.accent,textDecoration:"none"}}>📎 Tenancy document</a>}
                      </div>
                    )}
                    {t.notes&&<div style={{fontSize:12,color:T.muted,marginTop:10,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{t.notes}</div>}
                  </Card>
                );
              })}
            </div>}
          </div>
        </>}

        {/* ══ ALERTS ══ */}
        {tab==="alerts"&&<>
          {alerts.length===0
            ?<div style={{textAlign:"center",padding:"60px 20px"}}>
              <div style={{fontSize:40,marginBottom:12}}>✅</div>
              <div style={{fontSize:16,fontWeight:700,color:T.text,marginBottom:6}}>All clear</div>
              <div style={{fontSize:13,color:T.muted}}>No checks or mortgage renewals due in the next 90 days</div>
            </div>
            :alerts.map(ch=>(
              <CheckRow key={ch.id} check={ch} subtitle={`${ch.property_address?.split(",")[0]} · ${ch.company_name}`} onEdit={()=>openItem(ch)}/>
            ))
          }
        </>}

        {/* ══ SETTINGS ══ */}
        {tab==="settings"&&<>
          <Card>
            <div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:4}}>Signed in as</div>
            <div style={{fontSize:13,color:T.muted,marginBottom:12}}>{session.user.email}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <Btn label="Account & password" onClick={()=>setAccountOpen(true)}/>
              <Btn label="Sign out" variant="ghost" onClick={()=>supabase.auth.signOut()}/>
            </div>
          </Card>

          {isOwner&&(
            <Card>
              <div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:4}}>Team & access</div>
              <div style={{fontSize:12,color:T.muted,marginBottom:12,lineHeight:1.5}}>
                Give people access and choose exactly which companies each person can see. You can switch access on or off at any time.
              </div>
              <Btn label="Manage team & access" onClick={()=>setTeamOpen(true)}/>
            </Card>
          )}

          <Card>
            <div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:4}}>Back up your data</div>
            <div style={{fontSize:12,color:T.muted,marginBottom:12,lineHeight:1.5}}>
              Downloads a file with everything you can see here (companies, properties, checks, financials, tenants). Do this now and then, and always before big changes.
            </div>
            <Btn label="Download backup" onClick={downloadBackup}/>
          </Card>

          <Card>
            <div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:4}}>WhatsApp update</div>
            <div style={{fontSize:12,color:T.muted,marginBottom:12}}>Copy a compliance summary to send to your partner.</div>
            <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px",fontSize:12,color:T.text,whiteSpace:"pre-wrap",lineHeight:1.6,marginBottom:12,fontFamily:"monospace",maxHeight:180,overflowY:"auto"}}>{waText}</div>
            <Btn label={copyDone?"✓ Copied!":"Copy for WhatsApp"} onClick={()=>copyWA(waText)} variant={copyDone?"ghost":"primary"}/>
          </Card>

          <div style={{fontSize:11,color:T.muted,textAlign:"center",marginTop:8}}>PropCompliance · Built with Claude</div>
        </>}
      </div>

      {/* ── Bottom tab bar ── */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:maxW,background:T.surface,borderTop:`1px solid ${T.border}`,display:"flex",zIndex:100,paddingBottom:"env(safe-area-inset-bottom)"}}>
        {[{id:"home",icon:"🏠",label:"Portfolio"},{id:"alerts",icon:"🔔",label:"Alerts",badge:alerts.filter(ch=>getDaysUntil(ch.due)<=30).length},{id:"settings",icon:"⚙︎",label:"Settings"}].map(t=>(
          <button key={t.id} onClick={()=>{setTab(t.id);if(t.id!=="home")resetStack();}} style={{flex:1,background:"none",border:"none",padding:"10px 0 8px",cursor:"pointer",position:"relative"}}>
            <div style={{fontSize:22,lineHeight:1}}>{t.icon}</div>
            <div style={{fontSize:10,fontWeight:600,color:tab===t.id?T.accent:T.muted,marginTop:3,letterSpacing:"0.02em"}}>{t.label}</div>
            {t.badge>0&&<div style={{position:"absolute",top:6,right:"50%",transform:"translateX(10px)",background:T.red,color:"#fff",fontSize:10,fontWeight:700,borderRadius:10,padding:"1px 5px",minWidth:16,textAlign:"center"}}>{t.badge}</div>}
            {tab===t.id&&<div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:32,height:2,background:T.accent,borderRadius:"0 0 2px 2px"}}/>}
          </button>
        ))}
      </div>

      {/* ── Sheets ── */}
      <Sheet open={sheet==="addCompany"} onClose={closeSheet} title="Add Company">
        <Input label="Company name" placeholder="e.g. Oakfield Properties Ltd" value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})}/>
        <div style={{display:"flex",gap:10,marginTop:8}}><Btn label="Cancel" variant="ghost" onClick={closeSheet}/><button onClick={handleAddCompany} style={{flex:1,background:T.accent,color:"#fff",border:"none",borderRadius:10,padding:13,fontSize:14,fontWeight:700,cursor:"pointer"}}>Add Company</button></div>
      </Sheet>

      <Sheet open={sheet==="deleteCompany"} onClose={closeSheet} title="Delete Company?">
        <div style={{background:T.red+"15",border:`1px solid ${T.red}30`,borderRadius:12,padding:14,marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,color:T.red,marginBottom:6}}>⚠ This cannot be undone</div>
          <div style={{fontSize:13,color:T.muted,lineHeight:1.5}}>Permanently deletes <strong style={{color:T.text}}>{company?.name}</strong> and all properties inside it.</div>
        </div>
        <div style={{display:"flex",gap:10}}><Btn label="Cancel" variant="ghost" onClick={closeSheet}/><button onClick={handleDeleteCompany} style={{flex:1,background:T.red,color:"#fff",border:"none",borderRadius:10,padding:13,fontSize:14,fontWeight:700,cursor:"pointer"}}>Yes, delete everything</button></div>
      </Sheet>

      <Sheet open={sheet==="addProperty"} onClose={closeSheet} title="Add Property">
        <Input label="Full address" placeholder="14 Maple Street, Bristol, BS1 4TQ" value={form.address||""} onChange={e=>setForm({...form,address:e.target.value})}/>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Type</div>
          <select value={form.type||"BTL"} onChange={e=>setForm({...form,type:e.target.value})} style={{width:"100%",background:T.surface,border:`1px solid ${T.border2}`,borderRadius:10,padding:"11px 12px",color:T.text,fontSize:15,outline:"none",boxSizing:"border-box"}}>
            {PROPERTY_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <Input label="Number of tenants" type="number" min="1" value={form.tenants||""} onChange={e=>setForm({...form,tenants:e.target.value})}/>
        <Input label="Purchase date (optional)" type="date" value={form.purchase_date||""} onChange={e=>setForm({...form,purchase_date:e.target.value})}/>
        <div style={{display:"flex",gap:10,marginTop:8}}><Btn label="Cancel" variant="ghost" onClick={closeSheet}/><button onClick={handleAddProperty} style={{flex:1,background:T.accent,color:"#fff",border:"none",borderRadius:10,padding:13,fontSize:14,fontWeight:700,cursor:"pointer"}}>Add Property</button></div>
      </Sheet>

      <Sheet open={sheet==="editProperty"} onClose={closeSheet} title="Edit Property">
        <Input label="Full address" value={form.address||""} onChange={e=>setForm({...form,address:e.target.value})}/>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Type</div>
          <select value={form.type||"BTL"} onChange={e=>setForm({...form,type:e.target.value})} style={{width:"100%",background:T.surface,border:`1px solid ${T.border2}`,borderRadius:10,padding:"11px 12px",color:T.text,fontSize:15,outline:"none",boxSizing:"border-box"}}>
            {PROPERTY_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <Input label="Number of tenants" type="number" min="1" value={form.tenants||""} onChange={e=>setForm({...form,tenants:e.target.value})}/>
        <Input label="Purchase date" type="date" value={form.purchase_date||""} onChange={e=>setForm({...form,purchase_date:e.target.value})}/>
        <Input label="Notes" value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Any notes about this property…"/>
        <div style={{display:"flex",gap:10,marginTop:8}}><Btn label="Cancel" variant="ghost" onClick={closeSheet}/><button onClick={handleEditProperty} style={{flex:1,background:T.accent,color:"#fff",border:"none",borderRadius:10,padding:13,fontSize:14,fontWeight:700,cursor:"pointer"}}>Save</button></div>
      </Sheet>

      <Sheet open={sheet==="deleteProperty"} onClose={closeSheet} title="Delete Property?">
        <div style={{background:T.red+"15",border:`1px solid ${T.red}30`,borderRadius:12,padding:14,marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,color:T.red,marginBottom:6}}>⚠ This cannot be undone</div>
          <div style={{fontSize:13,color:T.muted,lineHeight:1.5}}>Permanently deletes <strong style={{color:T.text}}>{property?.address.split(",")[0]}</strong> and all its data.</div>
        </div>
        <div style={{display:"flex",gap:10}}><Btn label="Cancel" variant="ghost" onClick={closeSheet}/><button onClick={handleDeleteProperty} style={{flex:1,background:T.red,color:"#fff",border:"none",borderRadius:10,padding:13,fontSize:14,fontWeight:700,cursor:"pointer"}}>Yes, delete property</button></div>
      </Sheet>

      <Sheet open={sheet==="addCheck"||sheet==="editCheck"} onClose={closeSheet} title={sheet==="addCheck"?"Add Check":"Edit Check"}>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Check type</div>
          <select value={form.type||""} onChange={e=>setForm({...form,type:e.target.value})} style={{width:"100%",background:T.surface,border:`1px solid ${T.border2}`,borderRadius:10,padding:"11px 12px",color:T.text,fontSize:15,outline:"none",boxSizing:"border-box"}}>
            <option value="">Select…</option>
            {CHECK_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <Input label="Due / renewal date" type="date" value={form.due||""} onChange={e=>setForm({...form,due:e.target.value})}/>
        <Input label="Document link (optional)" type="text" inputMode="url" autoCapitalize="none" value={form.doc_link||""} onChange={e=>setForm({...form,doc_link:e.target.value})} placeholder="Paste a Google Drive / Dropbox / OneDrive link"/>
        {form.doc_link&&<a href={fixUrl(form.doc_link)} target="_blank" rel="noopener noreferrer" style={{display:"inline-block",fontSize:13,fontWeight:600,color:T.accent,textDecoration:"none",margin:"-6px 0 14px"}}>Open document ↗</a>}
        <TextArea label="Notes (optional)" value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Engineer, certificate number, anything useful…"/>
        {sheetError&&<Banner kind="error">{sheetError}</Banner>}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          {sheet==="editCheck"&&<Btn label="Delete" variant="danger" onClick={handleDeleteCheck}/>}
          <Btn label="Cancel" variant="ghost" onClick={closeSheet}/>
          <button onClick={sheet==="addCheck"?handleAddCheck:handleEditCheck} style={{flex:1,background:T.accent,color:"#fff",border:"none",borderRadius:10,padding:13,fontSize:14,fontWeight:700,cursor:"pointer"}}>Save</button>
        </div>
      </Sheet>

      <Sheet open={sheet==="editFinancials"} onClose={closeSheet} title="Financial Details">
        {FIN_FIELDS.map(f=><Input key={f.key} label={f.label} type={f.type} step="any" value={form[f.key]||""} onChange={e=>setForm({...form,[f.key]:e.target.value})}/>)}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <input type="checkbox" id="lh" checked={!!form.leasehold} onChange={e=>setForm({...form,leasehold:e.target.checked})} style={{width:18,height:18,accentColor:T.purple}}/>
          <label htmlFor="lh" style={{fontSize:14,fontWeight:600,color:T.purple,cursor:"pointer"}}>Leasehold property</label>
        </div>
        {form.leasehold&&<>
          <div style={{fontSize:11,fontWeight:700,color:T.purple,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>Lease Details</div>
          {LEASE_FIELDS.map(f=><Input key={f.key} label={f.label} type={f.type} step="any" value={form[f.key]||""} onChange={e=>setForm({...form,[f.key]:e.target.value})}/>)}
        </>}
        <div style={{display:"flex",gap:10,marginTop:8}}><Btn label="Cancel" variant="ghost" onClick={closeSheet}/><button onClick={handleSaveFinancials} style={{flex:1,background:T.accent,color:"#fff",border:"none",borderRadius:10,padding:13,fontSize:14,fontWeight:700,cursor:"pointer"}}>Save</button></div>
      </Sheet>

      <Sheet open={sheet==="addTenancy"||sheet==="editTenancy"} onClose={closeSheet} title={sheet==="addTenancy"?"Add Tenant":"Edit Tenant"}>
        <Input label="Tenant name" type="text" value={form.tenant_name||""} onChange={e=>setForm({...form,tenant_name:e.target.value})} placeholder="e.g. Sam Jones (add more names if joint)"/>
        <Input label="Phone (optional)" type="tel" value={form.tenant_phone||""} onChange={e=>setForm({...form,tenant_phone:e.target.value})}/>
        <Input label="Email (optional)" type="email" autoCapitalize="none" value={form.tenant_email||""} onChange={e=>setForm({...form,tenant_email:e.target.value})}/>
        <Input label="Tenancy start" type="date" value={form.start_date||""} onChange={e=>setForm({...form,start_date:e.target.value})}/>
        <Input label="Tenancy end (leave blank if rolling)" type="date" value={form.end_date||""} onChange={e=>setForm({...form,end_date:e.target.value})}/>
        <Input label="Break clause date (optional)" type="date" value={form.break_clause||""} onChange={e=>setForm({...form,break_clause:e.target.value})}/>
        <Input label="Rent (£)" type="number" step="any" value={form.rent_amount??""} onChange={e=>setForm({...form,rent_amount:e.target.value})}/>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Rent paid</div>
          <select value={form.rent_frequency||"monthly"} onChange={e=>setForm({...form,rent_frequency:e.target.value})} style={FIELD_STYLE}>
            {RENT_FREQS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <Input label="Deposit (£)" type="number" step="any" value={form.deposit_amount??""} onChange={e=>setForm({...form,deposit_amount:e.target.value})}/>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Deposit scheme</div>
          <select value={form.deposit_scheme||""} onChange={e=>setForm({...form,deposit_scheme:e.target.value})} style={FIELD_STYLE}>
            <option value="">Select…</option>
            {DEPOSIT_SCHEMES.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <Input label="Deposit reference (optional)" type="text" value={form.deposit_ref||""} onChange={e=>setForm({...form,deposit_ref:e.target.value})}/>
        <Input label="Tenancy document link (optional)" type="text" inputMode="url" autoCapitalize="none" value={form.doc_link||""} onChange={e=>setForm({...form,doc_link:e.target.value})} placeholder="Paste a Google Drive / Dropbox / OneDrive link"/>
        <TextArea label="Notes (optional)" value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})}/>
        {sheetError&&<Banner kind="error">{sheetError}</Banner>}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          {sheet==="editTenancy"&&<Btn label="Delete" variant="danger" onClick={handleDeleteTenancy}/>}
          <Btn label="Cancel" variant="ghost" onClick={closeSheet}/>
          <button onClick={handleSaveTenancy} style={{flex:1,background:T.accent,color:"#fff",border:"none",borderRadius:10,padding:13,fontSize:14,fontWeight:700,cursor:"pointer"}}>Save</button>
        </div>
      </Sheet>

      <AccountSheet open={accountOpen} onClose={()=>setAccountOpen(false)} email={session.user.email}/>

      {isOwner&&<TeamSheet open={teamOpen} onClose={()=>setTeamOpen(false)} orgId={orgId} companies={companies} myId={session.user.id}/>}

    </div>
  );
}
