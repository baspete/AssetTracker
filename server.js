/* global require console process Promise module */

const express = require('express'),
  parser = require('body-parser'),
  admin = require('firebase-admin'),
  Firestore = require('@google-cloud/firestore'),
  app = express();

const firebase_private_key = process.env.FIREBASE_PRIVATE_KEY || '';
// ========================================================================
// SETUP

const params = [
  // GPS
  'lat',
  'latitude',
  'lon',
  'longitude',
  'speed',
  'angle',
  'fixquality',
  // BNO55
  'x',
  'y',
  'z',
  // MCP9808
  'temp1',
  // Voltages
  'v1',
  'v2'
];

// parse application/x-www-form-urlencoded
app.use(parser.urlencoded({ extended: false }));
// parse application/json
app.use(parser.json());

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: 'basdesign-asset-tracker',
    clientEmail:
      'firebase-adminsdk-yqacy@basdesign-asset-tracker.iam.gserviceaccount.com',
    privateKey: firebase_private_key.replace(/\\n/g, '\n')
  }),
  databaseURL: 'https://basdesign-asset-tracker.firebaseio.com'
});

let db = admin.firestore();
db.settings = { timestampsInSnapshots: true };

// ========================================================================
// PRIVATE METHODS

function formatFix(fix) {
  const data = fix.data.split(',');
  let newData = {};
  for (let i = 0; i < params.length; i++) {
    newData[params[i]] = data[i];
  }
  newData['type'] = 'fix';
  fix.data = newData;
  return fix;
}

function saveFix(req, res) {
  const coreid = req.body['coreid'],
    doc = req.body['published_at'],
    data = formatFix(req.body).data;

  db.collection(coreid)
    .doc(doc)
    .set(data)
    .then(response => {
      res.status(201).send(`Saved fix ${doc} for ${coreid}`);
    })
    .catch(error => {
      res.status(400).send(error);
    });
}

function createEvent(req, res) {
  if (req.body && req.body.event) {
    switch (req.body.event) {
    case 'fix':
      saveFix(req, res);
      break;
    default:
      res.status(400).send('Failed: Unknown event type');
    }
  } else {
    res.status(400).send('Failed: No data to process');
  }
}

// ========================================================================
// API ENDPOINTS

app.put('/api/events', (req, res) => {
  createEvent(req, res);
});

// ========================================================================
// WEB APP

app.use('/', express.static('public'));

// ========================================================================
// INIT

const port = process.env.PORT || 9000;
app.listen(port);
console.log('Asset tracker app started on port ' + port);
