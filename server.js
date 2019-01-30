/* global require console process Promise module */

const express = require("express"),
  azure = require("azure-storage"),
  parser = require("body-parser"),
  app = express();

// Expecting AZURE_STORAGE_CONNECTION_STRING env variable to be set
let tableSvc = azure.createTableService();

// ========================================================================
// SETUP

const assets = [{ coreid: "e00fce6860329a838e34eaa" }];

const params = [
  // GPS
  { name: "lat", type: "string" },
  { name: "latitude", type: "float" },
  { name: "lon", type: "string" },
  { name: "longitude", type: "float" },
  { name: "speed", type: "float" },
  { name: "angle", type: "int" },
  { name: "fixquality", type: "int" },
  // BNO55
  { name: "x", type: "int" },
  { name: "y", type: "int" },
  { name: "z", type: "int" },
  // MCP9808
  { name: "temp1", type: "float" },
  // Voltages
  { name: "v1", type: "float" },
  { name: "v2", type: "float" }
];

// parse application/x-www-form-urlencoded
app.use(parser.urlencoded({ extended: false }));
// parse application/json
app.use(parser.json());

// ========================================================================
// PRIVATE METHODS

function formatFix(fix) {
  const data = fix.data.split(",");
  let newData = {};
  for (let i = 0; i < params.length; i++) {
    switch (params[i].type) {
      case "int":
        newData[params[i].name] = parseInt(data[i]);
        break;
      case "float":
        newData[params[i].name] = parseFloat(data[i]);
        break;
      default:
        // just send a string
        newData[params[i].name] = data[i];
    }
  }
  newData["type"] = "fix";
  fix.data = newData;
  return fix;
}

function saveFix(req, res) {
  const coreid = req.body["coreid"],
    timestamp = req.body["published_at"],
    data = formatFix(req.body).data;

  tableSvc.createTableIfNotExists(
    coreid.toString(),
    (error, result, response) => {
      if (!error) {
        // Table exists or created
        const entity = Object.assign(
          {
            PartitionKey: "fix",
            RowKey: timestamp
          },
          data
        );

        console.log("Storing", JSON.stringify(entity));

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
      case "fix":
        saveFix(req, res);
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

app.put("/api/events", (req, res) => {
  createEvent(req, res);
});

app.get("/api/events", (req, res) => {});

// ========================================================================
// WEB APP

app.use("/", express.static("public"));

// ========================================================================
// INIT

const port = process.env.PORT || 9000;
app.listen(port);
console.log("Asset tracker app started on port " + port);
