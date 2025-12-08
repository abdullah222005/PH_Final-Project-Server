const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require('express');
const cors = require("cors");
const app = express();
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const crypto = require('crypto');

function generateTrackingId() {
  const prefix = 'ZAP';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${date}-${random}`;
}


const port = process.env.PORT || 3333;

//middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gh1jtid.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db('Zap-Shift_DB');
    const parcelCollection = db.collection('parcels');
    const paymentCollection = db.collection('payments');

    //parcels API
    app.get('/parcels', async (req, res)=>{
        const query = {}
        const {email} = req.query;
        //parcels?email=''&
        if(email){
            query.senderEmail = email;
        }
        const cursor = parcelCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
    })

    app.get('/parcels/:id', async(req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await parcelCollection.findOne(query);
      res.send(result);
    })

    app.post('/parcels', async (req, res)=>{
        const parcel = req.body;
        // Parcel creation time
        parcel.createdAt = new Date();
        const result = await parcelCollection.insertOne(parcel);
        res.send(result);
    })

    app.delete('/parcels/:id', async (req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await parcelCollection.deleteOne(query);
      res.send(result);
    })

    // payment section's api
    app.post('/zapshift-checkout-session', async(req, res)=>{
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.parcelName,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.senderEmail,
        mode: "payment",
        metadata: {
          parcelId: paymentInfo.parcelId,
          parcelName: paymentInfo.parcelName,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });
      res.send({url: session.url});
    })

   app.patch("/verify-payment-success", async (req, res) => {
     try {
       const sessionId = req.query.session_id;

       if (!sessionId) {
         return res
           .status(400)
           .send({ success: false, message: "Session ID is required" });
       }

       const session = await stripe.checkout.sessions.retrieve(sessionId);
       //  console.log(session);

       const transactionId = session.payment_intent;
       const query = {transactionId: transactionId};
       const paymentExist = await paymentCollection.findOne(query);
       if(paymentExist){
        return res.send({message: 'already exists', transactionId});
       }
       
       if (session.payment_status === "paid") {
         const id = session.metadata.parcelId;
         const trackingId = generateTrackingId(); // Generate tracking ID here
         const query = { _id: new ObjectId(id) };
         const update = {
           $set: {
             paymentStatus: "paid",
             trackingId: trackingId, // Use the generated trackingId
           },
         };
         const result = await parcelCollection.updateOne(query, update);

         const payment = {
           amount: session.amount_total / 100,
           currency: session.currency,
           customerEmail: session.customer_email,
           parcelId: session.metadata.parcelId,
           parcelName: session.metadata.parcelName,
           transactionId: session.payment_intent,
           paymentStatus: session.payment_status,
           trackingId: trackingId, // Add tracking ID to payment record
           paidAt: new Date(),
         };

         const resultPayment = await paymentCollection.insertOne(payment);

         // Send response
         return res.send({
           success: true,
           modifyParcel: result,
           trackingId: trackingId, 
           transactionId: session.payment_intent,
           paymentInfo: resultPayment,
         });
       } else {
         return res.send({
           success: false,
           message: "Payment not completed",
           paymentStatus: session.payment_status,
         });
       }
     } catch (error) {
       console.error("Payment verification error:", error);
       res.status(500).send({ success: false, error: error.message });
     }
   });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res)=>{
    res.send("Zap is Shifting..!!!");
})

app.listen(port, ()=>{
    console.log(`Server is running on port: ${port}`);
})