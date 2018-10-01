# deprecated-hookshot

⚠️  _This repo has been deprecated. Please use [@mapbox/cloudfriend](https://github.com/mapbox/cloudfriend) shortcuts instead: [hookshot shortcuts](https://github.com/mapbox/cloudfriend/blob/7f3652feeb8ee7437e1e526560940d3093343bf3/lib/shortcuts/readme.md#available-shortcuts)._ ⚠️

![hookshot](https://cloud.githubusercontent.com/assets/515424/25831605/3671112e-341a-11e7-8865-13ef8afc67fc.gif)

A simple helper to build a connection between 3rd-party service webhooks and your AWS Lambda functions.

## Respond to Github push events

```js
const hookshot = require('@mapbox/hookshot');
const webhook = hookshot.github('lambda function logical name');
```

You want to write a Lambda function and you want it to be triggered every time a push is made to a Github repository.

Hookshot helps you create a CloudFormation template that creates an API Gateway HTTPS endpoint. You define your Lambda function in the same template, and launch a CloudFormation stack. This provides you with a URL and a secret key that you can provide to a Github webhook integration.

Hookshot takes care of authenticating incoming requests. Any requests that did not come from Github or were not properly encrypted using your secret key are rejected, and will never make it to your Lambda function.

Your Lambda function will receive a shortened version of a [Github push event](https://developer.github.com/v3/activity/events/types/#pushevent). Here's an example:

```json
{
  "ref": "refs/head/changes",
  "after": "0d1a26e67d8f5eaf1f6ba5c57fc3c7d91ac0fd1c",
  "before": "9049f1265b7d61be4a8904a9a27120d2064dab3b",
  "deleted": false,
  "repository": {
    "name": "public-repo",
    "owner": {
      "name": "baxterthehacker"
    }
  },
  "pusher": {
    "name": "baxterthehacker"
  }
}
```

However that data will be "wrapped" a few levels deep. To access the data as a JavaScript object, you will want your Lambda function's code to parse the incoming event as follows:

```js
module.exports.handler = (event, context, callback) => {
  const message = JSON.parse(event.Records[0].Sns.Message);
}
```

## Respond to arbitrary POST requests

```js
const hookshot = require('@mapbox/hookshot');
const webhook = hookshot.passthrough('lambda function logical name');
```

If you simply need to be able to invoke a Lambda function through a straightforward POST request, hookshot has you covered here as well.

Note that in this case, your Lambda function will receive every HTTP POST request that arrives at the API Gateway URL that hookshot helped you create. You are responsible for any authentication that should be performed against incoming requests.

Your Lambda function will receive an event object which includes the request method, headers, and body, as well as other data specific to the API Gateway endpoint created by hookshot. See [AWS documentation here](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format) for a full description of the incoming data.

In order to work properly, **your lambda function must return a data object matching in a specific JSON format**. Again, see [AWS documentation for a full description](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-output-format).

### CORS handling

Your API Gateway endpoint will be set up to allow cross-origin resource sharing (CORS) required by requests from any web page. Preflight `OPTIONS` requests will receive a `200` response with CORS headers. And the response you return from your Lambda function will be modified to include CORS headers.

## How to use this module

1. Create a CloudFormation template (in JavaScript) that defines
  - a Lambda function that you've designed to process incoming requests, and
  - the IAM role that your Lambda function will need in order to function.

2. Use the JavaScript function exported by this module to create the rest of the resources required. Merge those resources with your own using [cloudfriend](https://github.com/mapbox/cloudfriend).

3. Create the CloudFormation stack by deploying your template using [cfn-config](https://github.com/mapbox/cfn-config), or by using [cloudfriend's `build-template` command](https://github.com/mapbox/cloudfriend#cli-tools) to produce the template as a JSON document and launch it in the AWS console.

4. Your stack will output the URL for your webhook's endpoint, and a secret token. If generating a Github webhook, provide these values to Github as a new webhook (see `settings/hooks/new` for your repository). Make sure to specify the Content type as `application/json`.

There are a few examples of very simple github and passthrough templates in this repositories' `/test/` directory.
