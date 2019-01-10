/* global require console process Promise module */

const express = require('express'),
  axios = require('axios'),
  app = express();

// URL for PiAware Server
const host = process.env.PIAWAREHOST || 'http://192.168.1.5';

// FlightAware API Info
const FLIGHTAWARE_USERNAME = process.env.FLIGHTAWARE_USERNAME;
const FLIGHTAWARE_API_KEY = process.env.FLIGHTAWARE_API_KEY;
const FLIGHTAWARE_URL = 'http://flightxml.flightaware.com/json/FlightXML2/';

// Start with KOAK as a location, we'll switch this to the
// receiver's location when we initialize the app
let location = {
  lat: 37.72125,
  lon: -122.2211389
};

let icao = {};

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

function getCompassPoints(degrees) {
  if (typeof degrees !== 'number') {
    return degrees.toString();
  } else {
    if (degrees < 22.5) {
      return 'N';
    } else if (degrees < 67.5) {
      return 'NE';
    } else if (degrees < 112.5) {
      return 'E';
    } else if (degrees < 157.5) {
      return 'SE';
    } else if (degrees < 202.5) {
      return 'S';
    } else if (degrees < 247.5) {
      return 'SW';
    } else if (degrees < 292.5) {
      return 'W';
    } else if (degrees < 337.5) {
      return 'NW';
    } else if (degrees < 360.5) {
      return 'N';
    }
  }
}

/**
 * This function calculates the bearing and distance from the receiver to an aircraft.
 * φ is latitude in radians, λ is longitude in radians, R is earth’s radius (mean radius = 3,440 nm)
 * https://www.movable-type.co.uk/scripts/latlong.html
 *
 * @param {array} aircraft An aircraft object from dump1090-fa/data/aircraft.json
 * @returns {array} The same list with additional "distance", "bearing" and "compass" properties
 */
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

    // add distance & bearing properties to the aircraft data
    aircraft[i].distance = parseFloat(distance.toFixed(1));
    aircraft[i].bearing = Math.round(bearing)
      .toString()
      .padStart(3, '0');
    aircraft[i].compass = getCompassPoints(bearing);
  }
  return aircraft;
}

function db(aircraft) {
  let updatedAircraft = [];
  for (let i = 0; i < aircraft.length; i++) {
    let a = aircraft[i];
    if (!db[a.hex]) {
      console.log(`${a.hex} not found. Adding to DB: ${JSON.stringify(a)}`);
      db[a.hex] = a;
      db[a.hex]['status'] = 'A';
    } else {
      db[a.hex]['status'] = 'C';
      for (let param in a) {
        if (!db[a.hex][param] && a[param]) {
          console.log(`${a.hex} is missing ${param}, adding ${a[param]}`);
          db[a.hex][param] = a[param];
        }
      }
    }
    updatedAircraft.push(db[a.hex]);
  }
  return updatedAircraft;
}

/**
 *  This function parses the "flight" property and adds "airline" and "flight_num" properties
 * @param {array} aircraft An aircraft object from dump1090-fa/data/aircraft.json
 * @returns {array}
 */
function addAirlineAndFlight(aircraft) {
  for (let i = 0; i < aircraft.length; i++) {
    let a = aircraft[i];
    if (a.flight) {
      let identifier = a.flight.match(/\D+/) ? a.flight.match(/\D+/)[0] : null;
      let flight_num = a.flight.match(/\d+/) ? a.flight.match(/\d+/)[0] : null;
      if (identifier && identifier.length === 3) {
        a.airline = identifier;
        a['flight-num'] = flight_num;
      }
    }
  }
  return aircraft;
}

/**
 * Given a list of aircraft, his function will return a new list sorted by distance
 * and filtered to show only responses with lat/lon/altitude data
 * @param {array}  aircraft An array of aircraft returned by dump1090-fa/data/aircraft.json
 * @param {number} maxResults The maximum number of results to return
 */
function filter(aircraft, maxResults) {
  // Only return aircraft lat/lon/alt
  let filtered = aircraft.filter(a => {
    return a.seen < 20 && a.lat && a.lon && typeof a.alt_geom === 'number';
  });
  // Add distance an bearing properties
  filtered = addDistanceAndBearing(filtered);
  // Add airline and flight number fields
  filtered = addAirlineAndFlight(filtered);
  // Sort by distance
  let sorted = filtered.sort((a, b) => {
    return a.distance - b.distance;
  });
  if (maxResults && sorted.length > maxResults) {
    sorted = sorted.slice(0, maxResults);
  }
  return sorted;
}

// ========================================================================
// GETTING DATA

/**
 * Retrieves information about the PiAware receiver
 */
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

/**
 * This function retrieves the status of the PiAware server
 *
 * @param {object} req An Express request object
 * @param {object} res An express response object
 */
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
      let aircraft = filter(db(response.data.aircraft), req.query.n);
      console.log(`Retrieved ${aircraft.length} Aircraft`);
      res.json(aircraft);
    })
    .catch(error => {
      res.send('Error Getting Aircraft ' + error);
    });
}

function getFlightData(req, res) {
  const method = 'FlightInfoEx';
  return axios
    .get(`${FLIGHTAWARE_URL}${method}`, {
      auth: {
        username: FLIGHTAWARE_USERNAME,
        password: FLIGHTAWARE_API_KEY
      },
      params: {
        ident: req.params.id,
        howMany: 1
      }
    })
    .then(response => {
      console.log('success', response);
      res.json(response.data);
    })
    .catch(error => {
      console.log('error', error);
      res.send('Error Getting Aircraft Data ' + error);
    });
}

// ========================================================================
// API ENDPOINTS

// Allow CORS
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  next();
});

app.use('/api/status', (req, res) => {
  getServerStatus(req, res);
});

app.use('/api/aircraft/:id', (req, res) => {
  getFlightData(req, res);
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
    location.lat = results.lat;
    location.lon = results.lon;
    console.log('Receiver address', host);
    console.log('Receiver location is', location.lat, location.lon);
  })
  .catch(error => {
    console.log('error initializing', error);
  });

const port = process.env.PORT || 9000;
app.listen(port);
console.log('Flight tracker app started on port ' + port);
