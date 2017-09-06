#!/usr/bin/env bash

validate="./node_modules/.bin/validate-template"

echo "github:"
${validate} test/github.test.js

echo "github-named:"
${validate} test/github-named.test.js

echo "passthrough:"
${validate} test/passthrough.test.js

echo "passthrough-named:"
${validate} test/passthrough-named.test.js
