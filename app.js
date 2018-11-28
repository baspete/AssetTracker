/* global require console process Promise module */

const express = require('express'),
  axios = require('axios'),
  app = express();

// URL for PiAware Server
const host = 'http://192.168.1.5';

// Start with KOAK as a location, we'll switch this to the
// receiver's location when we initialize the app
let location = {
  lat: 37.72125,
  lon: -122.2211389
};

// ========================================================================
// PRIVATE METHODS

// Converts from degrees to radians.
Math.radians = function(degrees) {
  return (degrees * Math.PI) / 180;
};

// Converts from radians to degrees.
Math.degrees = function(radians) {
  return (radians * 180) / Math.PI;
};

// https://www.movable-type.co.uk/scripts/latlong.html
// φ is latitude, λ is longitude, R is earth’s radius (mean radius = 3,440 nm)
function addDistanceAndBearing(aircraft) {
  for (let i = 0; i < aircraft.length; i++) {
    const φ1 = Math.radians(location.lat);
    const φ2 = Math.radians(aircraft[i].lat);
    const λ1 = Math.radians(location.lon);
    const λ2 = Math.radians(aircraft[i].lon);
    const R = 3440;
    let x, y;

    // calculate distance
    x = (λ2 - λ1) * Math.cos((φ1 + φ2) / 2);
    y = φ2 - φ1;
    const distance = Math.sqrt(x * x + y * y) * R;

    // calculate bearing
    y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    x =
      Math.cos(φ1) * Math.sin(φ2) -
      Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    const bearing = (Math.degrees(Math.atan2(y, x)) + 360) % 360;

    aircraft[i].distance = distance;
    aircraft[i].bearing = Math.round(bearing);
  }
  return aircraft;
}

function filter(aircraft) {
  // Filter out stuff we don't want
  let filtered = aircraft.filter(a => {
    return a.flight && a.lat && a.lon && a.alt_baro;
  });
  // Add distance an bearing properties
  filtered = addDistanceAndBearing(filtered);
  // Sort by distance
  let sorted = filtered.sort((a, b) => {
    return a.distance - b.distance;
  });
  console.log('sorted:');
  for (let i = 0; i < sorted.length; i++) {
    console.log(
      `${sorted[i].flight}: ${sorted[i].bearing}/${sorted[i].distance.toFixed(
        1
      )} ${sorted[i].alt_baro}ft ${sorted[i].gs}kts`
    );
  }
  return sorted;
}

// ========================================================================
// GETTING DATA

function getReceiverInfo() {
  return axios
    .get(`${host}/dump1090-fa/data/receiver.json`)
    .then(response => {
      return response.data;
    })
    .catch(error => {
      return `getReceiverInfo error: ${error}`;
    });
}

function getServerStatus(req, res) {
  return axios
    .get(`${host}/status.json`)
    .then(response => {
      res.json(response.data);
    })
    .catch(error => {
      res.json({ error });
    });
}

function getAircraft(req, res) {
  return axios
    .get(`${host}/dump1090-fa/data/aircraft.json`)
    .then(response => {
      let aircraft = filter(response.data.aircraft);
      res.json(aircraft);
    })
    .catch(error => {
      res.json({ error });
    });
}

// ========================================================================
// API ENDPOINTS

app.use('/api/status', (req, res) => {
  getServerStatus(req, res);
});

app.use('/api/aircraft', (req, res) => {
  getAircraft(req, res);
});

// ========================================================================
// WEB APP
app.use('/', express.static('public'));

// ========================================================================
// INIT

getReceiverInfo()
  .then(results => {
    console.log('receiverInfo:', results);
    location.lat = results.lat;
    location.lon = results.lon;
  })
  .catch(error => {
    console.log('error initializing', error);
  });

const port = process.env.PORT || 9000;
app.listen(port);
console.log('Flight tracker app started on port ' + port);
