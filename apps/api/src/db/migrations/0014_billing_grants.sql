-- evenimentele Stripe sunt procesate doar de conexiunea de serviciu (webhook public)
REVOKE ALL ON "stripe_events" FROM togato_app;
