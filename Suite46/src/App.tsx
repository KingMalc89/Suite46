import React, { useEffect, useMemo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { CartItem } from "./types";
import {
  ORDER_ENDPOINT,
  CREATE_CHECKOUT_SESSION_ENDPOINT,
  TAX_RATE_DEFAULT,
  TIP_PRESETS,
  STRIPE_PRICE_MAP
} from "./config";

const MENU = {
  categories: [
    { name: "Seafood Favorites", items: [
      { id: "snapper_fries",   name: "Snapper & Fries", price: 25, img: "/images/snapper-fries.jpg" },
      { id: "snapper_only",    name: "Snapper Only",    price: 22, img: "/images/snapper.jpg" },
      { id: "tilapia_fries",   name: "Tilapia & Fries", price: 12, img: "/images/tilapia-fries.jpg" },
      { id: "tilapia_only",    name: "Tilapia Only",    price: 10, img: "/images/tilapia.jpg" },
    ]},
    { name: "Wings & Ribs", items: [
      { id: "wings_fries",       name: "Fried Whole Wings & Fries", price: 13, img: "/images/wings-fries.jpg" },
      { id: "wings_5pc",         name: "Fried Whole Wings (5 pc)",  price: 10, img: "/images/wings-5pc.jpg" },
      { id: "rib_sandwich",      name: "BBQ Rib Sandwich",          price: 13, img: "/images/rib-sandwich.jpg" },
      { id: "chicken_sandwich",  name: "BBQ Chicken Sandwich",       price: 11, img: "/images/chicken-sandwich.jpg" },
    ]},
    { name: "Sides", items: [
      { id: "fries", name: "Fries", price: 5, img: "/images/fries.jpg" },
      { id: "corn",  name: "Corn",  price: 5, img: "/images/corn.jpg"  },
    ]},
    { name: "Desserts", items: [
      { id: "pound_cake",     name: "Pound Cake",               price: 5, img: "/images/pound-cake.jpg" },
      { id: "red_velvet_2",   name: "Red Velvet Cupcakes (2)",  price: 7, img: "/images/red-velvet.jpg" },
      { id: "cupcake_single", name: "Single Cupcake",           price: 4, img: "/images/cupcake.jpg" },
    ]},
    { name: "Drinks", items: [
      { id: "peach_lemonade", name: "Peach Lemonade", price: 4, img: "/images/peach-lemonade.jpg" },
      { id: "fruit_punch",    name: "Fruit Punch",    price: 4, img: "/images/fruit-punch.jpg" },
      { id: "water",          name: "Water",          price: 2, img: "/images/water.jpg" },
    ]},
  ]
};


function buildPickupSlots(start = "12:00", end = "16:00") {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const slots: string[] = [];
  const d = new Date(); d.setHours(sh, sm, 0, 0);
  const e = new Date(); e.setHours(eh, em, 0, 0);
  while (d <= e) {
    const hh = (d.getHours() % 12) || 12; const mm = d.getMinutes().toString().padStart(2, "0");
    slots.push(`${hh}:${mm} ${d.getHours() >= 12 ? "PM" : "AM"}`);
    d.setMinutes(d.getMinutes() + 15);
  }
  return slots;
}

export default function App(){
  const [taxRate] = useState(TAX_RATE_DEFAULT);
  const [tipRate, setTipRate] = useState(0);
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pickup, setPickup] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [payMode, setPayMode] = useState<"pickup"|"prepay">("pickup");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(()=>{ const saved=localStorage.getItem("s46_cart"); if(saved) setCart(JSON.parse(saved)); },[]);
  useEffect(()=>{ localStorage.setItem("s46_cart", JSON.stringify(cart)); },[cart]);

  const items = Object.values(cart);
  const pickupSlots = useMemo(()=>buildPickupSlots("12:00","16:00"),[]);
  const subtotal = items.reduce((s,it)=>s+it.unitPrice*it.qty,0);
  const tax = +(subtotal*taxRate).toFixed(2);
  const tip = +((subtotal+tax)*tipRate).toFixed(2);
  const total = +(subtotal+tax+tip).toFixed(2);

  const search = typeof window!=="undefined"? new URLSearchParams(window.location.search): new URLSearchParams();
  const paidParam = search.get("paid");
  const paidOrderId = search.get("order_id")||"";
  const lastOrder = typeof window!=="undefined"? (()=>{ try{return JSON.parse(localStorage.getItem("s46_last_order")||"null");}catch{return null;} })(): null;

  if (paidParam === "success") return <SuccessPage orderId={paidOrderId} lastOrder={lastOrder}/>;

  function addToCart(id:string,name:string,price:number){
    setCart(prev=>{ const next={...prev}; const ex=next[id]; next[id]={ id, name, unitPrice:price, qty:(ex?.qty||0)+1 }; return next; });
  }
  function decFromCart(id:string){ setCart(prev=>{ const ex=prev[id]; if(!ex) return prev; const q=ex.qty-1; const next={...prev}; if(q<=0) delete next[id]; else next[id]={...ex,qty:q}; return next; }); }
  function clearCart(){ setCart({}); }
  function genOrderId(){ const d=new Date(); const yymmdd=d.toISOString().slice(2,10).replaceAll("-",""); const r=Math.floor(1000+Math.random()*9000); return `S46-${yymmdd}-${r}`; }

  async function submitOrder(){
    if(!items.length) return alert("Your cart is empty");
    if(!name.trim()) return alert("Please enter your name");
    if(!phone.trim()) return alert("Please enter your phone number");
    if(!pickup.trim()) return alert("Please choose a pickup time");
    setSubmitting(true);

    const orderId = genOrderId();
    const payload = {
      timestamp_utc: new Date().toISOString(),
      order_id: orderId,
      customer_name: name.trim(),
      phone_e164: phone.trim(),
      email: email.trim(),
      pickup_time_local: pickup,
      items_json: items.map(it=>({ id:it.id, name:it.name, qty:it.qty, unitPrice:it.unitPrice, lineTotal:+(it.qty*it.unitPrice).toFixed(2) })),
      subtotal:+subtotal.toFixed(2), tax, tip, total,
      notes: notes.trim(),
      payment_status: payMode === "prepay" ? "Pending" : "Unpaid",
      order_status: "Queued",
      kitchen_assigned: "", ready_time_local: "", picked_up_time_local: "", admin_private_comment: ""
    } as const;

    try {
      if (ORDER_ENDPOINT) {
        await fetch(ORDER_ENDPOINT, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) });
      } else {
        const local = JSON.parse(localStorage.getItem("s46_local_orders")||"[]");
        local.push(payload); localStorage.setItem("s46_local_orders", JSON.stringify(local));
      }

      if (payMode === "prepay") {
        try { localStorage.setItem("s46_last_order", JSON.stringify(payload)); } catch {}
        const stripeLineItems = items.filter(it=>STRIPE_PRICE_MAP[it.id]).map(it=>({ price: STRIPE_PRICE_MAP[it.id], quantity: it.qty }));
        const body:any = {
          order_id: payload.order_id,
          customer_name: payload.customer_name,
          phone_e164: payload.phone_e164,
          pickup_time_local: payload.pickup_time_local,
          notes: payload.notes,
          items: payload.items_json,
          subtotal: payload.subtotal, tax: payload.tax, tip: payload.tip, total: payload.total,
          success_url: `${window.location.origin}?paid=success&order_id=${encodeURIComponent(payload.order_id)}`,
          cancel_url: `${window.location.origin}?paid=cancel&order_id=${encodeURIComponent(payload.order_id)}`,
        };
        if (stripeLineItems.length>0) body.line_items = stripeLineItems; else { body.amount_total = Math.round(payload.total*100); body.currency = "usd"; body.description = `Suite 46 Order ${payload.order_id}`; }
        const resp = await fetch(CREATE_CHECKOUT_SESSION_ENDPOINT, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
        if (!resp.ok) throw new Error(`Checkout session error ${resp.status}`);
        const data = await resp.json();
        if (data?.url) { window.location.href = data.url; return; }
        else throw new Error("No checkout URL returned");
      }

      alert("Order placed! See you soon.");
      clearCart(); setName(""); setPhone(""); setEmail(""); setPickup(""); setNotes("");
    } catch(e:any){ console.error(e); alert("Could not submit order. Please try again."); }
    finally { setSubmitting(false); }
  }

  const itemsCount = items.reduce((s,i)=>s+i.qty,0);

  return (
    <div>
      {/* Header */}
      <div className="header">
        <div className="container hstack" style={{justifyContent:"space-between", padding:"10px 16px"}}>
          <div className="hstack"><strong style={{fontSize:18}}>Suite 46</strong><span style={{color:"#666"}}>Pickup orders — Saturdays 12PM until sold out</span></div>
          <div className="hstack">
            <a href="https://maps.apple.com/?q=4600+SW+19th+St,+West+Park,+FL" style={{textDecoration:"none", color:"#333"}}>4600 SW 19th St</a>
            <button className="btn primary" onClick={()=>setSheetOpen(true)}>
              Cart • ${ (subtotal + tax + tip).toFixed(2) } {itemsCount>0 && <span className="badge" style={{marginLeft:8}}>{itemsCount}</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="container" style={{paddingTop:16}}>
        <div className="card">
          <div className="content hstack" style={{justifyContent:"space-between", flexWrap:"wrap"}}>
            <div className="vstack">
              <h1 style={{margin:0}}>Order Fresh Plates</h1>
              <div style={{color:"#666"}}>Saturdays • 12:00 PM until sold out</div>
              <div style={{color:"#666"}}>Questions? Robin (954) 294-9140 • Nika (954) 558-5657</div>
            </div>
            <div className="hstack">
              <button className="btn" onClick={()=>setQrOpen(true)}>Scan QR to Order</button>
              <button className="btn primary" onClick={()=>setSheetOpen(true)}>Cart • ${ (subtotal + tax + tip).toFixed(2) }</button>
            </div>
          </div>
        </div>
      </div>

      {/* Menu */}
      <div className="container" style={{paddingBottom:32}}>
        {MENU.categories.map(cat=> (
          <div key={cat.name}>
            <h2 style={{marginTop:24}}>{cat.name}</h2>
            <div className="grid" style={{gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))"}}>
              {cat.items.map(it=> (
                <div key={it.id} className="card">
                  <div className="content vstack">
                   <img
  src={it.img}
  alt={it.name}
  loading="lazy"
  onError={(e) => {
    // fallback to a neutral placeholder if the file is missing
    (e.currentTarget as HTMLImageElement).src =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="#f3f3f3"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#999" font-family="Arial" font-size="18">Photo coming soon</text></svg>'
      );
  }}
  style={{
    width: "100%",
    height: 140,
    objectFit: "cover",
    borderRadius: 12,
    background: "#f3f3f3"
  }}
/>

                    <div className="hstack" style={{justifyContent:"space-between"}}>
                      <div className="vstack">
                        <strong>{it.name}</strong>
                        <div style={{color:"#666"}}>${it.price.toFixed(2)}</div>
                      </div>
                      <div className="hstack">
                        <button className="btn" onClick={()=>decFromCart(it.id)}>-</button>
                        <div style={{width:28, textAlign:"center"}}>{cart[it.id]?.qty || 0}</div>
                        <button className="btn" onClick={()=>addToCart(it.id,it.name,it.price)}>+</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Cart Sheet */}
      {sheetOpen && (
        <>
          <div className="sheet-backdrop" onClick={()=>setSheetOpen(false)}></div>
          <div className="sheet">
            <h3>Your Cart</h3>
            {items.length===0 ? (<p className="muted">Your cart is empty.</p>) : (
              <div className="vstack">
                {items.map(it=> (
                  <div key={it.id} className="hstack" style={{justifyContent:"space-between"}}>
                    <div>
                      <div><strong>{it.name}</strong></div>
                      <div className="muted">${it.unitPrice.toFixed(2)} × {it.qty}</div>
                    </div>
                    <div className="hstack">
                      <button className="btn" onClick={()=>decFromCart(it.id)}>-</button>
                      <div style={{width:28, textAlign:"center"}}>{it.qty}</div>
                      <button className="btn" onClick={()=>addToCart(it.id,it.name,it.unitPrice)}>+</button>
                    </div>
                  </div>
                ))}

                <div style={{borderTop:"1px solid #eee", paddingTop:8}}>
                  <div className="hstack" style={{justifyContent:"space-between"}}><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                  <div className="hstack" style={{justifyContent:"space-between"}}><span>Tax</span><span>${tax.toFixed(2)}</span></div>
                  <div className="hstack" style={{justifyContent:"space-between", alignItems:"center"}}>
                    <span>Tip</span>
                    <div className="hstack">
                      {TIP_PRESETS.map(t=> (
                        <button key={t} className={`btn ${t===tipRate? 'primary':''}`} onClick={()=>setTipRate(t)}>{Math.round(t*100)}%</button>
                      ))}
                    </div>
                    <span>${tip.toFixed(2)}</span>
                  </div>
                  <div className="hstack" style={{justifyContent:"space-between", fontWeight:700}}><span>Total</span><span>${total.toFixed(2)}</span></div>
                </div>

                <div style={{borderTop:"1px solid #eee", paddingTop:8}} className="vstack">
                  <div style={{fontSize:14, color:"#333"}}>Payment</div>
                  <div className="hstack">
                    <button className={`btn ${payMode==='pickup'? 'primary':''}`} onClick={()=>setPayMode('pickup')}>Pay at Pickup</button>
                    <button className={`btn ${payMode==='prepay'? 'primary':''}`} onClick={()=>setPayMode('prepay')}>Prepay (Card)</button>
                  </div>
                  <input className="input" placeholder="Full Name" value={name} onChange={e=>setName(e.target.value)}/>
                  <input className="input" placeholder="Mobile Number" value={phone} onChange={e=>setPhone(e.target.value)}/>
                  <input className="input" placeholder="Email (optional)" value={email} onChange={e=>setEmail(e.target.value)}/>
                  <select className="select" value={pickup} onChange={e=>setPickup(e.target.value)}>
                    <option value="">Pickup Time (15-min slots)</option>
                    {pickupSlots.map(p=> <option key={p} value={p}>{p}</option>)}
                  </select>
                  <textarea className="textarea" placeholder="Notes (no onions, extra sauce...)" value={notes} onChange={e=>setNotes(e.target.value)}/>
                  <button className="btn primary" disabled={submitting} onClick={submitOrder}>{submitting? 'Placing Order…' : 'Place Order'}</button>
                  <button className="btn" onClick={clearCart}>Clear Cart</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* QR Modal */}
      {qrOpen && (
        <div className="modal" onClick={()=>setQrOpen(false)}>
          <div className="modal-inner" onClick={e=>e.stopPropagation()}>
            <h2 className="sr-only">Scan QR to Order</h2>
            <div style={{display:"grid", placeItems:"center"}}>
              <QRCodeCanvas value={typeof window!=="undefined"? window.location.href : 'https://suite46.local'} size={220} includeMargin/>
              <p style={{color:"#666"}}>Download this QR and place it on your flyers/signs.</p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="footer">
        <div className="container hstack" style={{justifyContent:"space-between", flexWrap:"wrap"}}>
          <div>© {new Date().getFullYear()} Suite 46 • West Park, FL</div>
          <div className="hstack">
            <span>Scan to order next time:</span>
            <div style={{background:"#fff", padding:6, border:"1px solid #eee", borderRadius:10}}>
              <QRCodeCanvas value={typeof window!=="undefined"? window.location.href : 'https://suite46.local'} size={84}/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuccessPage({ orderId, lastOrder }:{ orderId:string, lastOrder:any }){
  const items: CartItem[] = (lastOrder?.items_json||[]).map((x:any)=>({
    id:x.id, name:x.name, unitPrice:x.unitPrice, qty:x.qty
  }));
  const total:number = typeof lastOrder?.total === 'number' ? lastOrder.total : 0;
  const pickup = lastOrder?.pickup_time_local || '';
  function clearParams(){ if(typeof window!=="undefined"){ const url=new URL(window.location.href); url.searchParams.delete('paid'); url.searchParams.delete('order_id'); window.location.replace(url.toString()); } }
  return (
    <div>
      <div className="container" style={{padding:"32px 16px"}}>
        <div className="card"><div className="content">
          <div style={{color:"#0a7a3f", fontWeight:700, marginBottom:6}}>Payment Successful</div>
          <h1>Thanks for your order!</h1>
          <p>Order <code>{orderId || lastOrder?.order_id || '—'}</code>{pickup? <> • Pickup at <strong>{pickup}</strong></> : null}</p>
          <div style={{border:"1px solid #eee", borderRadius:12, padding:10}}>
            {items.length>0 ? (
              <>
                {items.map(it=> (
                  <div key={it.id} className="hstack" style={{justifyContent:"space-between"}}>
                    <span>{it.name} × {it.qty}</span>
                    <span>${(it.qty*it.unitPrice).toFixed(2)}</span>
                  </div>
                ))}
                <div className="hstack" style={{justifyContent:"space-between", marginTop:6}}>
                  <span>Total</span><strong>${total.toFixed(2)}</strong>
                </div>
              </>
            ) : (
              <div style={{color:"#666"}}>We couldn't load item details, but your payment was received. Show your order number at pickup.</div>
            )}
          </div>
          <div className="hstack" style={{gap:8, marginTop:10}}>
            <a className="btn" href="https://maps.google.com/?q=4600+SW+19th+St,+West+Park,+FL" target="_blank" rel="noreferrer">Directions</a>
            <button className="btn primary" onClick={clearParams}>Back to Menu</button>
          </div>
        </div></div>
      </div>
    </div>
  );
}
