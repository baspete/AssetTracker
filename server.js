/* global require console process Promise module */

const express = require('express'),
  azure = require('azure-storage'),
  parser = require('body-parser'),
  geomagnetism = require('geomagnetism'),
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
  heading: -90,
  pitch: 0,
  roll: -1
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
        let fix = {};

        for (let field in entry) {
          if (
            entry[field]._ &&
            field !== 'PartitionKey' && // ignore
            field !== 'RowKey' // ignore
          ) {
            switch (field) {
            case 'Timestamp':
              fix[field] = entry[field]._; // string
              break;
            case 'x': // Heading
              let decl = geomagnetism
                .model()
                .point([parseFloat(entry.lat._), parseFloat(entry.lon._)])
                .decl;
              let m = Math.round(
                parseFloat(entry[field]._) + corrections.heading
              );
                // Calculate true
              let t = Math.round(m + decl);
              fix['heading'] = {
                mag: m < 0 ? 360 + m : m,
                true: t < 0 ? 360 + t : t
              };
              break;
            case 'y': // Pitch
              fix['pitch'] = Math.round(
                parseFloat(entry[field]._) + corrections.pitch
              );
              break;
            case 'z': // Roll
              fix['roll'] = Math.round(
                parseFloat(entry[field]._) + corrections.roll
              );
              break;
            case 'velocity': // Knots
              fix['velocity'] = round(parseFloat(entry[field]._), 1);
              break;
            default:
              // Otherwise just return the float
              fix[field] = parseFloat(entry[field]._);
            }
          }
        }
        results.push(fix);
      });

      if (response.continuationToken) {
        getTelemetry(query, results, result.continuationToken, callback);
      } else {
        callback(results);
      }
    }
  );
}

function formatQueryResponse(response) {
  return response;
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
  newData['type'] = 'fix';
  fix.data = newData;
  return fix;
}

function saveFix(req, res) {
  const coreid = req.body['coreid'],
    timestamp = req.body['published_at'],
    data = formatFix(req.body).data;

  tableSvc.createTableIfNotExists(
    coreid.toString(),
    (error, result, response) => {
      if (!error) {
        // Table exists or created
        const entity = Object.assign(
          {
            PartitionKey: 'fix',
            RowKey: timestamp
          },
          data
        );

        console.log('Storing', JSON.stringify(entity));

        // Send it to Azure Table Storage
        tableSvc.insertOrReplaceEntity(
          coreid,
          entity,
          (error, result, response) => {
            if (!error) {
              res.status(201).send(response);
            } else {
              res.status(400).send(error);
            }
          }
        );
      } else {
        res.status(400).send(error);
      }
    }
  );
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

function getTables(req, res) {
  tableSvc.listTablesSegmented(null, (error, results) => {
    if (!error) {
      res.status(200).send(results.entries);
    } else {
      res.status(400).send(error);
    }
  });
}

function getAssetInfo(req, res) {
  const query = new azure.TableQuery().top(1).where('PartitionKey eq ?', 'fix');
  tableSvc.queryEntities(req.params.id, query, null, (error, result) => {
    if (!error) {
      res.status(200).send(formatQueryResponse(result));
    } else {
      res.status(404).send(error);
    }
  });
}

// ========================================================================
// API ENDPOINTS

app.put('/api/events', (req, res) => {
  createEvent(req, res);
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
    console.log(`/api/fixes returned ${resultsArr.length} items`);
    res.json({
      count: resultsArr.length,
      items: resultsArr
    });
    resultsArr = [];
  });
});

app.get('/api/assets/:id?', (req, res) => {
  res.send(req.params.id);
});

// ========================================================================
// WEB APP

app.use('/', express.static('public'));

// ========================================================================
// INIT

const port = process.env.PORT || 9000;
app.listen(port);
console.log('Asset tracker app started on port ' + port);
