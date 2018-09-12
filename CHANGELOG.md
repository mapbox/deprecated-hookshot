# Changelog

## 5.0.1

- Allow lowercase CORS headers from browsers.

## 5.0.0

- Passthrough functions handle CORS.

## 4.0.0

## 3.1.0

- Secrets are stored with Api Gateway Keys instead of IAM users. ([#15](https://github.com/mapbox/hookshot/pull/15))
- NB: Upgrading to this version will generate a **new webhook secret** that will need to be updated in your application.
