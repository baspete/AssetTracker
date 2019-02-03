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
 * @param {float} value     A number to round
 * @param {int}   precision The number of decimal places to round
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
 */
function normalizeToCompass(val) {
  if (val > 360) {
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
 * @param {any} dms latitude or longitude with degrees and minutes concatenated
 * @param {string} direction direction from meridium or equator, ie: 'N', 'E', etc
 */
function convertDMToDecimal(dms, direction) {
  const s = direction === 'N' || direction === 'S' ? 2 : 3;
  const c = direction === 'S' || direction === 'W' ? -1 : 1; // S or W are negative
  const deg = Number(dms.toString().substring(0, s));
  const min = Number(dms.toString().substring(s));
  let dd = (deg + min / 60) * c;
  return dd;
}

function parseEntry(entry) {
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
      entry[field]._ &&
      field !== 'PartitionKey' && // ignore
      field !== 'RowKey' // ignore
    ) {
      switch (field) {
      case 'Timestamp':
        response[field] = entry[field]._; // string
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
 * Runs a table query with specific page size and continuationToken
 * @param {TableQuery}             query             Query to execute
 * @param {array}                  results           An array of items to be appended
 * @param {TableContinuationToken} continuationToken Continuation token to continue a query
 * @param {function}               callback          Additional sample operations to run after this one completes
 */
function getTelemetry(id, query, results, continuationToken, callback) {
  const telemetryTable = id;
  tableSvc.queryEntities(
    telemetryTable,
    query,
    continuationToken,
    (error, response) => {
      if (error) {
        return callback(error);
      }
      response.entries.map(entry => {
        results.push(parseEntry(entry));
      });
      if (response.continuationToken) {
        getTelemetry(query, results, response.continuationToken, callback);
      } else {
        callback(results);
      }
    }
  );
}

function formatFix(fix) {
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

function saveFix(req) {
  return new Promise((resolve, reject) => {
    const coreid = req.body['coreid'],
      timestamp = req.body['published_at'],
      data = formatFix(req.body).data;

    tableSvc.createTableIfNotExists(coreid.toString(), error => {
      if (!error) {
        // Table exists or created
        const fix = Object.assign(
          {
            PartitionKey: 'fix',
            RowKey: timestamp
          },
          data
        );
        console.log('Storing', JSON.stringify(fix));
        // Send it to Azure Table Storage
        tableSvc.insertOrReplaceEntity(
          coreid,
          fix,
          (error, _result, response) => {
            if (!error) {
              resolve(response);
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

function createEvent(req) {
  return new Promise((resolve, reject) => {
    if (req.body && req.body.event) {
      switch (req.body.event) {
      case 'fix':
        saveFix(req)
          .then(results => {
            resolve(results);
          })
          .catch(error => {
            reject(error);
          });
        break;
      default:
        reject('Failed: Unknown event type');
      }
    } else {
      reject('Failed: No data to process');
    }
  });
}

/**
 * Given an asset ID this function retrieves the most recent
 * fix for that asset.
 * @param {string} id The id of the asset
 */
function getLastFix(id) {
  return new Promise((resolve, reject) => {
    const recent = moment()
      .subtract(19, 'minutes')
      .toISOString();
    const query = new azure.TableQuery().where(
      `(PartitionKey eq 'fix') and (RowKey ge '${recent}')`
    );
    tableSvc.queryEntities(id, query, null, (error, response) => {
      if (!error) {
        let fix = parseEntry(response.entries[response.entries.length - 1]);
        resolve(fix);
      } else {
        reject(error);
      }
    });
  });
}

/**
 * Retrieve a list of tables
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
  let query = '',
    resultsArr = [];
  if (req.query.since) {
    query = new azure.TableQuery()
      .select(query.fix)
      .where('RowKey >= ?', req.query.since);
  } else if (req.query.before) {
    query = new azure.TableQuery()
      .select(query.fix)
      .where('RowKey <= ?', req.query.before);
  } else {
    const now = Date.now(),
      span = 1000 * 60 * 60 * 24, // 24 hours
      since = new Date(now - span).toISOString();
    query = new azure.TableQuery()
      .select(query.fix)
      .where('RowKey >= ?', since);
  }

  getTelemetry(req.params.id, query, resultsArr, null, () => {
    res.json({
      count: resultsArr.length,
      items: resultsArr
    });
    resultsArr = [];
  });
});

app.get('/api/assets/:id?', (req, res) => {
  if (req.params.id) {
    getLastFix(req.params.id)
      .then(fix => {
        res.status(200).send({ last: fix });
      })
      .catch(error => {
        res.status(400).send(error);
      });
  } else {
    getTables()
      .then(results => {
        res.status(200).send(results);
      })
      .catch(error => {
        res.status(400).send(error);
      });
  }
});

// ========================================================================
// WEB APP

app.use('/', express.static('public'));

// ========================================================================
// INIT

const port = process.env.PORT || 9000;
app.listen(port);
console.log('Asset tracker app started on port ' + port);
