/* global require console process Promise module */

const express = require("express"),
  parser = require("body-parser"),
  admin = require("firebase-admin"),
  Firestore = require("@google-cloud/firestore"),
  app = express();

// ========================================================================
// SETUP

const params = [
  "lat",
  "latitude",
  "lon",
  "longitude",
  "x",
  "y",
  "z",
  "speed",
  "angle",
  "fixquality",
  "temp1",
  "v1",
  "v2"
];

// parse application/x-www-form-urlencoded
app.use(parser.urlencoded({ extended: false }));
// parse application/json
app.use(parser.json());

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: "basdesign-asset-tracker",
    clientEmail:
      "firebase-adminsdk-yqacy@basdesign-asset-tracker.iam.gserviceaccount.com",
    privateKey: process.env.FIREBASE_PRIVATE_KEY
  }),
  databaseURL: "https://basdesign-asset-tracker.firebaseio.com"
});

let db = admin.firestore();
db.settings = { timestampsInSnapshots: true };

// ========================================================================
// PRIVATE METHODS

function formatFix(fix) {
  const data = fix.data.split(",");
  let newData = {};
  for (let i = 0; i < params.length; i++) {
    newData[params[i]] = data[i];
  }
  newData["type"] = "fix";
  fix.data = newData;
  return fix;
}

function saveFix(fix) {
  return new Promise((resolve, reject) => {
    const c = fix["coreid"],
      d = fix["published_at"];

    db.collection(c)
      .doc(d)
      .set(fix.data)
      .then(response => {
        resolve(`Saved fix ${d} for ${c}`);
      })
      .catch(error => {
        reject(error);
      });
  });
}

function createEvent(req, res) {
  if (req.body && req.body.event) {
    switch (req.body.event) {
      case "fix":
        saveFix(formatFix(req.body))
          .then(response => {
            res.status(201).send(response);
          })
          .catch(error => {
            res.status(400).send(error);
          });
        break;
      default:
        res.status(400).send("Failed: Unknown event type");
    }
  } else {
    res.status(400).send("Failed: No data to process");
  }
}

// ========================================================================
// API ENDPOINTS

app.post("/api/events", (req, res) => {
  createEvent(req, res);
});

// ========================================================================
// WEB APP

app.use("/", express.static("public"));

// ========================================================================
// INIT

const port = process.env.PORT || 9000;
app.listen(port);
console.log("Asset tracker app started on port " + port);
