# DHIS2 Query Alias example

This is a simple Node.js script (written in typescript) which demonstrates how a DHIS2 Rest API client can perform automatic creation of query aliases, avoiding `HTTP 414 URI Too Long` errors.

The main example code is found in [src/fetchDHIS2WithAliasFallback.ts](./src/fetchDHIS2WithAliasFallback.ts)
