import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight, CreditCard, Lightbulb, LogOut, Plus, ReceiptText,
  ShieldCheck, Sparkles, Trash2, WalletCards, X
} from "lucide-react";
import "./styles.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const RAZORPAY_KEY = import.meta.env.VITE_RAZORPAY_KEY_ID;

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="center-screen"><div className="loader"/></div>;
  if (!user) return <Auth onLogin={setUser} />;

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} user={user} setUser={setUser} />
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">PAYPILOT / CONTROL CENTER</p>
            <h1>{page === "dashboard" ? "Good to see you." : page === "payments" ? "Payments" : "Idea Lab"}</h1>
          </div>
          <div className="profile-pill">
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>{user.name[0]}</span>}
            <div><strong>{user.name}</strong><small>{user.email}</small></div>
          </div>
        </header>
        {error && <div className="toast error">{error}<button onClick={() => setError("")}><X size={16}/></button></div>}
        {page === "dashboard" && <Dashboard user={user} go={setPage} setError={setError} />}
        {page === "payments" && <Payments setError={setError} />}
        {page === "ideas" && <Ideas setError={setError} />}
      </main>
    </div>
  );
}

function Auth({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const d = await api(`/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST", body: JSON.stringify(form)
      });
      onLogin(d.user);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-orb orb-one"/><div className="auth-orb orb-two"/>
      <section className="auth-card">
        <div className="brand-mark"><WalletCards size={24}/></div>
        <p className="eyebrow">PAYPILOT</p>
        <h1>{mode === "login" ? "Your money, under control." : "Create your PayPilot."}</h1>
        <p className="muted">A clean payment command center built for your next payment idea.</p>

        {error && <div className="form-error">{error}</div>}
        <form onSubmit={submit}>
          {mode === "register" && <input placeholder="Full name" value={form.name} onChange={e => setForm({...form,name:e.target.value})} />}
          <input type="email" placeholder="Email address" value={form.email} onChange={e => setForm({...form,email:e.target.value})} required />
          <input type="password" placeholder="Password" value={form.password} onChange={e => setForm({...form,password:e.target.value})} required />
          <button className="primary wide" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>

        <div className="divider"><span>or</span></div>
        <a className="google-btn" href={`${API}/auth/google`}>
          <span className="google-g">G</span> Continue with Google
        </a>
        <button className="link-btn" onClick={() => {setMode(mode === "login" ? "register" : "login");setError("")}}>
          {mode === "login" ? "Create a new account" : "Already have an account? Sign in"}
        </button>
      </section>
    </div>
  );
}

function Sidebar({ page, setPage, user, setUser }) {
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
  };
  return (
    <aside className="sidebar">
      <div className="logo"><WalletCards size={21}/><span>PayPilot</span></div>
      <nav>
        <button className={page==="dashboard"?"active":""} onClick={()=>setPage("dashboard")}><Sparkles/> Overview</button>
        <button className={page==="payments"?"active":""} onClick={()=>setPage("payments")}><CreditCard/> Payments</button>
        <button className={page==="ideas"?"active":""} onClick={()=>setPage("ideas")}><Lightbulb/> Idea Lab</button>
      </nav>
      <div className="sidebar-bottom">
        <div className="security"><ShieldCheck size={17}/><div><strong>Protected</strong><small>Secure session</small></div></div>
        <button className="logout" onClick={logout}><LogOut size={17}/> Sign out</button>
      </div>
    </aside>
  );
}

function Dashboard({ go, setError }) {
  const [payments, setPayments] = useState([]);
  const [showPay, setShowPay] = useState(false);

  useEffect(() => { api("/payments").then(d=>setPayments(d.payments)).catch(e=>setError(e.message)); }, [setError]);
  const paid = payments.filter(p=>p.status==="PAID").reduce((s,p)=>s+p.amount,0)/100;
  const count = payments.filter(p=>p.status==="PAID").length;

  return (
    <>
      <section className="hero-grid">
        <div className="hero-card">
          <div><span className="label">TOTAL PAID</span><h2>₹{paid.toLocaleString("en-IN")}</h2><p>Across your PayPilot transactions</p></div>
          <div className="hero-icon"><WalletCards/></div>
        </div>
        <div className="stat-card"><span>Successful payments</span><strong>{count}</strong><small>Verified transactions</small></div>
        <div className="stat-card"><span>Payment ideas</span><strong>∞</strong><small>Build your next feature</small></div>
      </section>
      <section className="action-grid">
        <button className="action-card" onClick={()=>setShowPay(true)}><div className="action-icon"><CreditCard/></div><strong>Make a payment</strong><span>Pay securely with Razorpay</span><ArrowUpRight/></button>
        <button className="action-card" onClick={()=>go("ideas")}><div className="action-icon"><Lightbulb/></div><strong>Open Idea Lab</strong><span>Capture your next payment idea</span><ArrowUpRight/></button>
      </section>
      <section className="panel">
        <div className="panel-head"><div><span className="label">RECENT</span><h3>Transactions</h3></div><button className="text-btn" onClick={()=>go("payments")}>View all</button></div>
        {payments.length ? payments.slice(0,5).map(p=><PaymentRow key={p.id} p={p}/>) : <Empty text="No payments yet. Your first transaction will appear here."/>}
      </section>
      {showPay && <PaymentModal close={()=>setShowPay(false)} onDone={()=>{setShowPay(false);location.reload()}} setError={setError}/>}
    </>
  );
}

function Payments({ setError }) {
  const [payments, setPayments] = useState([]);
  const [showPay, setShowPay] = useState(false);
  const load = ()=>api("/payments").then(d=>setPayments(d.payments)).catch(e=>setError(e.message));
  useEffect(load, []);

  return <>
    <div className="page-actions"><p className="muted">Your verified Razorpay transactions.</p><button className="primary" onClick={()=>setShowPay(true)}><Plus size={18}/> New payment</button></div>
    <section className="panel">
      {payments.length ? payments.map(p=><PaymentRow key={p.id} p={p}/>) : <Empty text="No transactions yet."/>}
    </section>
    {showPay && <PaymentModal close={()=>setShowPay(false)} onDone={()=>{setShowPay(false);load()}} setError={setError}/>}
  </>;
}

function PaymentRow({p}) {
  return <div className="payment-row">
    <div className="payment-symbol"><ReceiptText size={18}/></div>
    <div className="payment-main"><strong>{p.description}</strong><small>{new Date(p.createdAt).toLocaleString()}</small></div>
    <strong>₹{(p.amount/100).toLocaleString("en-IN")}</strong>
    <span className={`status ${p.status.toLowerCase()}`}>{p.status}</span>
  </div>;
}

function PaymentModal({close,onDone,setError}) {
  const [amount,setAmount]=useState("");
  const [description,setDescription]=useState("");
  const [busy,setBusy]=useState(false);

  const pay = async (e)=>{
    e.preventDefault(); setBusy(true);
    try {
      const order = await api("/payments/create-order", {
        method:"POST",
        body:JSON.stringify({amount:Math.round(Number(amount)*100),description})
      });
      if (!window.Razorpay) throw new Error("Razorpay checkout script is unavailable.");
      const rzp = new window.Razorpay({
        key: order.keyId || RAZORPAY_KEY,
        amount: order.amount,
        currency: order.currency,
        name: "PayPilot",
        description,
        order_id: order.orderId,
        handler: async (response)=>{
          try { await api("/payments/verify",{method:"POST",body:JSON.stringify(response)}); onDone(); }
          catch(e){setError(e.message);setBusy(false);}
        },
        modal:{ondismiss:()=>setBusy(false)}
      });
      rzp.open();
    } catch(e){setError(e.message);setBusy(false);}
  };

  return <div className="modal-backdrop"><div className="modal">
    <div className="modal-head"><div><span className="label">RAZORPAY</span><h3>Make a payment</h3></div><button className="icon-btn" onClick={close}><X/></button></div>
    <form onSubmit={pay}>
      <label>Amount (INR)<input type="number" min="1" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="2500" required/></label>
      <label>Description<input value={description} onChange={e=>setDescription(e.target.value)} placeholder="What is this payment for?" maxLength="120" required/></label>
      <button className="primary wide" disabled={busy}>{busy?"Opening checkout...":"Continue to Razorpay"}</button>
      <small className="muted center">Use Razorpay Test Mode while developing.</small>
    </form>
  </div></div>;
}

function Ideas({setError}) {
  const [ideas,setIdeas]=useState([]);
  const [open,setOpen]=useState(false);
  const load=()=>api("/ideas").then(d=>setIdeas(d.ideas)).catch(e=>setError(e.message));
  useEffect(load,[]);
  const remove=async id=>{try{await api(`/ideas/${id}`,{method:"DELETE"});load()}catch(e){setError(e.message)}};

  return <>
    <div className="page-actions"><p className="muted">Capture and turn your payment concepts into real features.</p><button className="primary" onClick={()=>setOpen(true)}><Plus size={18}/> Add idea</button></div>
    <section className="idea-grid">
      {ideas.length ? ideas.map(i=><article className="idea-card" key={i.id}>
        <div className="idea-top"><span className="idea-tag">{i.category}</span><button className="icon-btn" onClick={()=>remove(i.id)}><Trash2 size={16}/></button></div>
        <h3>{i.title}</h3><p>{i.description}</p>
        <div className="idea-meta"><span>{i.priority}</span><span>{i.status}</span></div>
      </article>) : <div className="panel"><Empty text="Your Idea Lab is empty. Add your first payment idea." /></div>}
    </section>
    {open && <IdeaModal close={()=>setOpen(false)} done={()=>{setOpen(false);load()}} setError={setError}/>}
  </>;
}

function IdeaModal({close,done,setError}) {
  const [form,setForm]=useState({title:"",description:"",category:"Payments",priority:"Medium",status:"IDEA",notes:""});
  const submit=async e=>{e.preventDefault();try{await api("/ideas",{method:"POST",body:JSON.stringify(form)});done()}catch(e){setError(e.message)}};
  return <div className="modal-backdrop"><div className="modal">
    <div className="modal-head"><div><span className="label">IDEA LAB</span><h3>New payment idea</h3></div><button className="icon-btn" onClick={close}><X/></button></div>
    <form onSubmit={submit}>
      <label>Idea name<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Group expense split"/></label>
      <label>Description<textarea required rows="4" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Describe the payment experience you want to build."/></label>
      <div className="two-col"><label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option>Low</option><option>Medium</option><option>High</option></select></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="IDEA">Idea</option><option value="PLANNED">Planned</option><option value="TESTING">Testing</option><option value="IMPLEMENTED">Implemented</option></select></label></div>
      <button className="primary wide">Save idea</button>
    </form>
  </div></div>;
}

function Empty({text}) { return <div className="empty"><Lightbulb size={22}/><span>{text}</span></div>; }

const style = document.createElement("script");
function AppRoot(){return <App/>}
createRoot(document.getElementById("root")).render(<AppRoot/>);

const script = document.createElement("script");
script.src = "https://checkout.razorpay.com/v1/checkout.js";
script.async = true;
document.head.appendChild(script);
