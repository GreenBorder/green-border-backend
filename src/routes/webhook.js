const express = require("express");
const Stripe = require("stripe");
const { addCredits } = require("../utils/credits");

const PRICE_TO_CREDITS = {
  "price_1SxQOCH27V3cOtxesaN0eL3Y": 10,
  "price_1SxQR9H27V3cOtxeZBWrhxOg": 50,
  "price_1SxQSiH27V3cOtxeRZooQjU2": 200,
};

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
  const session = event.data.object;

  console.log("=== STRIPE WEBHOOK checkout.session.completed ===");
  console.log("SESSION ID:", session.id);

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
  console.log("LINE ITEMS RAW:", JSON.stringify(lineItems.data, null, 2));

  const firstItem = lineItems.data[0];
  const priceId = firstItem?.price?.id;

  console.log("PRICE ID EXTRAIT:", priceId);

  const credits = PRICE_TO_CREDITS[priceId];
  console.log("CRÉDITS RÉSOLUS:", credits);

  if (!credits) {
    console.error("❌ PRICE ID INCONNU :", priceId);
    return res.json({ received: true }); // on ACK le webhook quand même
  }

  addCredits(session.id, credits);

  console.log(
    `✅ ${credits} crédits ajoutés pour la session ${session.id}`
  );
}

    res.json({ received: true });
  }
);

module.exports = router;
