/* global require console process Promise module */

const express = require('express'),
  app = express();

// ========================================================================
// WEB APP
app.use('/', express.static('public'));

// ========================================================================
// WEB SERVER
const port = process.env.PORT || 9000;
app.listen(port);
console.log('Flight tracker app started on port ' + port);
