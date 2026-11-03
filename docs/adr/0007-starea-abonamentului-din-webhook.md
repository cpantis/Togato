# 0007 — Starea abonamentului se schimbă doar din webhook-uri Stripe

**Context.** Redirecționarea browserului după plată poate fi falsificată sau poate să nu aibă loc.

**Decizie.** Checkout-ul și portalul sunt create de server; starea (`subscriptionStatus`, plan, perioadă) se actualizează doar din webhook-uri cu semnătură verificată, procesate o singură dată (`stripe_events`). Proba expirată sau abonamentul anulat lasă datele accesibile pentru citire și export.

**Consecințe.** Activarea poate întârzia câteva secunde după plată (interfața o explică). Facturile Stripe nu sunt transmise în RO e-Factura — necesită o integrare separată.
