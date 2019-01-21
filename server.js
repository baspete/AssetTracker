/* global require console process Promise module */

const express = require("express"),
  // parser = require("body-parser"),
  app = express();

// ========================================================================
// SETUP

// parse application/x-www-form-urlencoded
// app.use(parser.urlencoded({ extended: false }));
// parse application/json
// app.use(parser.json());

// ========================================================================
// PRIVATE METHODS

function events(req, res) {
  res.json({ body: "hello world" });
}

// ========================================================================
// API ENDPOINTS

app.use("/api/events", (req, res) => {
  events(req, res);
});

// ========================================================================
// WEB APP

app.use("/", express.static("public"));

// ========================================================================
// INIT

const port = process.env.PORT || 9000;
app.listen(port);
console.log("Asset tracker app started on port " + port);
