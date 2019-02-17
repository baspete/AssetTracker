/* eslint-disable no-console */
/* global require console process Promise module */

const express = require('express'),
  azure = require('azure-storage'),
  parser = require('body-parser'),
  moment = require('moment'),
  geomagnetism = require('geomagnetism'),
  geolib = require('geolib'),
  app = express();

// Expecting AZURE_STORAGE_CONNECTION_STRING env variable to be set
let tableSvc = azure.createTableService();

// ========================================================================
// SETUP

const params = [
  // GPS
  { name: 'lat', type: 'string' },
  { name: 'latitude', type: 'float' },
  { name: 'lon', type: 'string' },
  { name: 'longitude', type: 'float' },
  { name: 'speed', type: 'float' },
  { name: 'angle', type: 'int' },
  { name: 'fixquality', type: 'int' },
  // BNO55
  { name: 'x', type: 'int' },
  { name: 'y', type: 'int' },
  { name: 'z', type: 'int' },
  // MCP9808
  { name: 'temp1', type: 'float' },
  // Voltages
  { name: 'v1', type: 'float' },
  { name: 'v2', type: 'float' }
];

// Corrections for how the sensor is aligned
// along the axis of the boat.
// TODO: this should come from somewhere else
const corrections = {
  heading: 0,
  pitch: 0,
  roll: 0
};

// parse application/x-www-form-urlencoded
app.use(parser.urlencoded({ extended: false }));
// parse application/json
app.use(parser.json());

// ========================================================================
// PRIVATE METHODS

/**
 * Rounds a number
 * @param {number} value     A number to round
 * @param {int}   precision The number of decimal places to round
 * @returns {number}
 */
function round(value, precision) {
  var multiplier = Math.pow(10, precision || 0);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Given any number of degrees, positive or negative,
 * this function will return that number's compass degrees.
 * Example: -10 -> 350
 *          375 -> 15
 *          240 -> 240
 * @param {number} val
 * @returns {number} a number >= 0 and < 360
 */
function normalizeToCompass(val) {
  if (val >= 360) {
    val = val - 360;
  }
  if (val < 0) {
    val = val + 360;
  }
  return val;
}

/**
 * Converts latitude or longitude from the concatenated degrees/minutes format
 * returned by the Adafruit GPS library to decimal latitude or longitude.
 * @param {number} dms latitude or longitude with degrees and minutes concatenated
 * @param {string} direction direction from meridium or equator, ie: 'N', 'E', etc
 * @returns {number} a positive or negative decimal value for latitude or longitude
 */
function convertDMToDecimal(dms, direction) {
  const s = direction === 'N' || direction === 'S' ? 2 : 3;
  const c = direction === 'S' || direction === 'W' ? -1 : 1; // S or W are negative
  const deg = Number(dms.toString().substring(0, s));
  const min = Number(dms.toString().substring(s));
  // Positive or negative
  let dd = (deg + min / 60) * c;
  // Round to 7 decimal places
  dd = Math.round(dd * 1e7) / 1e7;
  return dd;
}

/**
 * Turns a database fix entry into something useful:
 *  - converts Adafruit GPS library-style lat/longs to decimal lat/longs
 *  - converts headings into object with mag & true values, adding any
 *    corrections from the 'corrections' object above
 *
 * @param {object} entry
 * @returns {object} a more useful fix
 */
function parseFix(entry) {
  let response = {};
  // Calculate magnetic declination for this point
  const decl = geomagnetism
    .model()
    .point([
      convertDMToDecimal(entry.latitude._, entry.lat._),
      convertDMToDecimal(entry.longitude._, entry.lon._)
    ]).decl;
  for (let field in entry) {
    if (
      entry[field]._ !== 'undefined' &&
      field !== 'lat' && // ignore
      field !== 'lon' && // ignore
      field !== 'PartitionKey' // ignore
    ) {
      switch (field) {
      case 'RowKey':
        response['timestamp'] = entry[field]._;
        break;
      case 'Timestamp':
        response['savedAt'] = entry[field]._;
        break;
      case 'latitude':
        response[field] = convertDMToDecimal(entry[field]._, entry.lat._);
        break;
      case 'longitude':
        response[field] = convertDMToDecimal(entry[field]._, entry.lon._);
        break;
      case 'x': {
        const m = Math.round(
          normalizeToCompass(entry[field]._ + corrections.heading)
        );
          // Calculate true
        let t = Math.round(normalizeToCompass(m + decl));
        response['heading'] = {
          mag: m,
          true: t
        };
        break;
      }
      case 'angle': {
        const t = Math.round(entry[field]._);
        // Calculate magnetic
        const m = Math.round(normalizeToCompass(t - decl));
        response['angle'] = {
          mag: m,
          true: t
        };
        break;
      }
      case 'y': // Pitch
        response['pitch'] = Math.round(entry[field]._ + corrections.pitch);
        break;
      case 'z': // Roll
        response['roll'] = Math.round(entry[field]._ + corrections.roll);
        break;
      case 'velocity': // Knots
        response['velocity'] = round(entry[field]._, 1);
        break;
      default:
        // Otherwise just return the value
        response[field] = entry[field]._;
      }
    }
  }
  return response;
}

/**
 * Retrieve a list of tables
 * @returns {Promise} Promise object with the entries in the table query results
 */
function getTables() {
  return new Promise((resolve, reject) => {
    tableSvc.listTablesSegmented(null, (error, results) => {
      if (!error) {
        resolve(results.entries);
      } else {
        reject(error);
      }
    });
  });
}

/**
 * Runs a table query with specific page size and continuationToken
 * @param {TableQuery}             query             Query to execute
 * @param {array}                  results           An array of items to be appended
 * @param {TableContinuationToken} continuationToken Continuation token to continue a query
 * @param {function}               callback          Additional sample operations to run after this one completes
 */
function getTelemetry(id, query, results, continuationToken, callback) {
  tableSvc.queryEntities(id, query, continuationToken, (error, response) => {
    if (error) {
      return callback(error);
    }
    response.entries.map(entry => {
      results.push(parseFix(entry));
    });
    if (response.continuationToken) {
      getTelemetry(id, query, results, response.continuationToken, callback);
    } else {
      callback(results);
    }
  });
}

/**
 * Turns a fix string from an asset tracker into an object
 * that can be stored in the database.
 * @param {string} fix
 * @returns {object}
 */
function fixStrToObj(fix) {
  const data = fix.data.split(',');
  let newData = {};
  for (let i = 0; i < params.length; i++) {
    switch (params[i].type) {
    case 'int':
      newData[params[i].name] = parseInt(data[i]);
      break;
    case 'float':
      newData[params[i].name] = parseFloat(data[i]);
      break;
    default:
      // just send a string
      newData[params[i].name] = data[i];
    }
  }
  fix.data = newData;
  return fix;
}

/**
 * Saves a fix to the table with this coreid
 * @param {string} coreid
 * @param {string} timestamp ISO8601 timestamp
 * @param {object} data
 * @returns {Promise}
 */
function saveFix(coreid, timestamp, data) {
  return new Promise((resolve, reject) => {
    tableSvc.createTableIfNotExists(coreid.toString(), error => {
      if (!error) {
        // Insert this into the "fix" partition
        tableSvc.insertOrReplaceEntity(
          coreid,
          Object.assign(
            {
              PartitionKey: 'fix',
              RowKey: timestamp
            },
            data
          ),
          (error, _result, response) => {
            if (!error) {
              // Insert this into the "latest" row
              tableSvc.insertOrReplaceEntity(
                coreid,
                Object.assign(
                  {
                    PartitionKey: 'fix',
                    RowKey: 'latest'
                  },
                  data
                ),
                (error, _result, response) => {
                  if (!error) {
                    console.log('Saved Fix:', data);
                    resolve(response);
                  } else {
                    reject(error);
                  }
                }
              );
            } else {
              reject(error);
            }
          }
        );
      } else {
        reject(error);
      }
    });
  });
}

/**
 * Given a request object, calls the right private method handler.
 * Possible values are: 'fix'.
 * @param {object} req Expressjs request object
 * @returns {Promise} Promise object returns the result of the private function called.
 */
function createEvent(req) {
  return new Promise((resolve, reject) => {
    if (req.body && req.body.event) {
      switch (req.body.event) {
      case 'fix': {
        const coreid = req.body['coreid'],
          timestamp = req.body['published_at'],
          data = fixStrToObj(req.body).data;
        saveFix(coreid, timestamp, data)
          .then(results => {
            resolve(results);
          })
          .catch(error => {
            reject(error);
          });
        break;
      }
      default:
        reject('Failed: Unknown event type');
      }
    } else {
      reject('Failed: No data to process');
    }
  });
}

/**
 *
 * @param {string} id Asset ID
 * @param {string} [since] ISO8601 date string
 * @param {string} [before] ISO8601 date string
 * @returns {Promise}
 */
function getFixes(id, since = null, before = null, latest = false) {
  return new Promise((resolve, reject) => {
    let query = '',
      resultsArr = [];
    if (latest) {
      query = new azure.TableQuery()
        .select(query['fix'])
        .where('RowKey eq \'latest\'');
    } else if (since || before) {
      let beforeStr = before ? `(RowKey <= '${before}')` : '',
        sinceStr = since ? `(RowKey >= '${since}')` : '',
        andStr = before && since ? ' and ' : '';
      query = new azure.TableQuery()
        .select(query['fix'])
        .where(beforeStr + andStr + sinceStr);
    } else {
      // Default is one week's worth of fixes
      const since = moment()
        .subtract(1, 'weeks')
        .toISOString();
      query = new azure.TableQuery()
        .select(query['fix'])
        .where('RowKey >= ?', since);
    }
    getTelemetry(id, query, resultsArr, null, () => {
      // Calculate total distance
      let coords = [];
      resultsArr.map(fix => {
        coords.push({ latitude: fix.latitude, longitude: fix.longitude });
      });
      resolve({
        count: resultsArr.length,
        distance: geolib.convertUnit('sm', geolib.getPathLength(coords)), // sea miles (?!)
        bounds: geolib.getBounds(coords),
        items: resultsArr
      });
      resultsArr = [];
    });
  });
}

/**
 * Given an array of fixes and optional distance, speed or number of fixes lower thresholds,
 * this function will promise an array of objects, each of which is a trip in the original
 * array of fixes.
 * @param {array} fixes
 * @param {number} [distanceThreshold=33] Minimum distance to start/continue a trip
 * @param {number} [speedThreshold =1] Minimum speed to start/continue a trip
 * @param {number} [fixesThreshold=3] Minimum number of fixes to make a trip
 * @returns {Promise} Promise array of trip objects
 */
function findTrips(
  fixes,
  distanceThreshold = 33, // meters
  speedThreshold = 1, // knots
  fixesThreshold = 3 // number of fixes
) {
  return new Promise((resolve, reject) => {
    let trips = [];
    let numFixes = 0;
    let trip = {};
    let coords = [];
    for (let i = 1; i < fixes.length; i++) {
      let p0 = {
        latitude: fixes[i - 1].latitude,
        longitude: fixes[i - 1].longitude
      };
      let p1 = { latitude: fixes[i].latitude, longitude: fixes[i].longitude };
      let d = geolib.getDistanceSimple(p0, p1); // meters
      if (d >= distanceThreshold || fixes[i].speed >= speedThreshold) {
        // Starting a trip
        if (numFixes === 0) {
          trip.start = fixes[i].timestamp;
          coords.push({
            latitude: fixes[i].latitude,
            longitude: fixes[i].longitude
          });
          numFixes++;
        } else {
          // Continuing a trip
          coords.push({
            latitude: fixes[i].latitude,
            longitude: fixes[i].longitude
          });
          numFixes++;
        }
      } else {
        if (numFixes > 0) {
          // Ending a trip
          coords.push({
            latitude: fixes[i].latitude,
            longitude: fixes[i].longitude
          });
          trip.distance = geolib.convertUnit(
            'sm',
            geolib.getPathLength(coords)
          );
          trip.end = fixes[i].timestamp;
          trip.numFixes = numFixes + 1;
          if (numFixes > fixesThreshold) {
            trips.push(trip);
          }
          // Reset the counters
          numFixes = 0;
          trip = {};
          coords = [];
        } else {
          // nothing to see here, asset hasn't moved
        }
      }
    }

    resolve(trips);
  });
}

// ========================================================================
// API ENDPOINTS

app.put('/api/events', (req, res) => {
  createEvent(req)
    .then(response => {
      res.status(201).send(response);
    })
    .catch(error => {
      res.status(400).send(error);
    });
});

app.use('/api/assets/:id/fixes', (req, res) => {
  getFixes(req.params.id, req.query.since, req.query.before, false)
    .then(results => {
      res.send(results);
    })
    .catch(error => {
      res.status(400).send(error);
    });
});

app.use('/api/assets/:id/latest', (req, res) => {
  getFixes(req.params.id, null, null, true)
    .then(results => {
      res.send(results);
    })
    .catch(error => {
      res.status(400).send(error);
    });
});

app.use('/api/assets/:id/trips', (req, res) => {
  getFixes(req.params.id, req.query.since, req.query.before, false)
    .then(results => {
      findTrips(results.items)
        .then(trips => {
          res.send(trips);
        })
        .catch(error => {
          res.status(400).send(error);
        });
    })
    .catch(error => {
      res.status(400).send(error);
    });
});

app.get('/api/assets', (req, res) => {
  getTables()
    .then(results => {
      res.status(200).send(
        // Filter out any non-assset tables
        results.filter(id => {
          return id.length === 24; // Particle GUIDs have 24 chars
        })
      );
    })
    .catch(error => {
      res.status(400).send(error);
    });
});

// ========================================================================
// WEB APP

app.use('/', express.static('public'));

// ========================================================================
// INIT

const port = process.env.PORT || 9000;
app.listen(port);
console.log('Asset tracker app started on port ' + port);
