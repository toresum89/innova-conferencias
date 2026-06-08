require('dotenv').config();
const express = require('express');
const app = express();
app.use(require('./api/handler'));
module.exports = app;
