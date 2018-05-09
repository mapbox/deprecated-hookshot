'use strict';

const crypto = require('crypto');
const cf = require('@mapbox/cloudfriend');

const random = crypto.randomBytes(4).toString('hex');

const Topic = (lambda) => ({
  Type: 'AWS::SNS::Topic',
  Properties: {
    Subscription: [
      {
        Protocol: 'lambda',
        Endpoint: cf.getAtt(lambda, 'Arn')
      }
    ]
  }
});

const SnsPermission = (lambda, prefix) => ({
  Type: 'AWS::Lambda::Permission',
  Properties: {
    Action: 'lambda:invokeFunction',
    FunctionName: cf.ref(lambda),
    Principal: 'sns.amazonaws.com',
    SourceArn: cf.ref(`${prefix}InvocationTopic`)
  }
});

const Secret = () => ({
  Type: 'AWS::ApiGateway::ApiKey',
  Properties: {
    Enabled: false
  }
});

const Api = () => ({
  Type: 'AWS::ApiGateway::RestApi',
  Properties: {
    Name: cf.sub('${AWS::StackName}-webhook'),
    FailOnWarnings: true
  }
});

const Stage = (prefix) => ({
  Type: 'AWS::ApiGateway::Stage',
  Properties: {
    DeploymentId: cf.ref(`${prefix}Deployment${random}`),
    StageName: 'hookshot',
    RestApiId: cf.ref(`${prefix}Api`),
    MethodSettings: [
      {
        HttpMethod: '*',
        ResourcePath: '/*',
        ThrottlingBurstLimit: 20,
        ThrottlingRateLimit: 5
      }
    ]
  }
});

const Deployment = (prefix) => ({
  Type: 'AWS::ApiGateway::Deployment',
  DependsOn: `${prefix}Method`,
  Properties: {
    RestApiId: cf.ref(`${prefix}Api`),
    StageName: 'unused'
  }
});

const Method = (prefix) => ({
  Type: 'AWS::ApiGateway::Method',
  Properties: {
    RestApiId: cf.ref(`${prefix}Api`),
    ResourceId: cf.ref(`${prefix}Resource`),
    ApiKeyRequired: false,
    AuthorizationType: 'None',
    HttpMethod: 'POST',
    Integration: {
      Type: 'AWS',
      IntegrationHttpMethod: 'POST',
      IntegrationResponses: [
        {
          StatusCode: 200
        },
        {
          StatusCode: 500,
          SelectionPattern: '^error.*'
        },
        {
          StatusCode: 403,
          SelectionPattern: '^invalid.*'
        }
      ],
      Uri: cf.sub(`arn:aws:apigateway:\${AWS::Region}:lambda:path/2015-03-31/functions/\${${prefix}Function.Arn}/invocations`),
      RequestTemplates: {
        'application/json': "{\"signature\":\"$input.params('X-Hub-Signature')\",\"body\":$input.json('$')}"
      }
    },
    MethodResponses: [
      {
        StatusCode: '200',
        ResponseModels: {
          'application/json': 'Empty'
        }
      },
      {
        StatusCode: '500',
        ResponseModels: {
          'application/json': 'Empty'
        }
      },
      {
        StatusCode: '403',
        ResponseModels: {
          'application/json': 'Empty'
        }
      }
    ]
  }
});

const PassthroughFunction = (lambda, prefix) => ({
  Type: 'AWS::Lambda::Function',
  Properties: {
    Code: {
      ZipFile: cf.join('\n', [
        '"use strict";',
        'const AWS = require("aws-sdk");',
        cf.sub('const lambda = new AWS.Lambda({ region: "${AWS::Region}" });'),
        'module.exports.lambda = (event, context, callback) => {',
        '  if (event.httpMethod === "OPTIONS") {',
        '    const requestHeaders = event.headers["Access-Control-Request-Headers"]',
        '      || event.headers["access-control-request-headers"];',
        '    const response = {',
        '      statusCode: 200,',
        '      body: "",',
        '      headers: {',
        '        "Access-Control-Allow-Headers": requestHeaders,',
        '        "Access-Control-Allow-Methods": "POST, OPTIONS",',
        '        "Access-Control-Allow-Origin": "*"',
        '      }',
        '    };',
        '    callback(null, response);',
        '    return;',
        '  }',
        '  const lambdaParams = {',
        cf.sub(`    FunctionName: "\${${lambda}}",`),
        '    Payload: JSON.stringify(event)',
        '  };',
        '  lambda.invoke(lambdaParams, (err, response) => {',
        '    if (err) return callback(err);',
        '    if (!response || !response.Payload) {',
        `      callback(new Error("Your Lambda function ${lambda} did not provide a payload"));`,
        '      return;',
        '    }',
        '    var payload = JSON.parse(response.Payload);',
        '    payload.headers = payload.headers || {};',
        '    payload.headers["Access-Control-Allow-Origin"] = "*";',
        '    callback(null, payload)',
        '  });',
        '};'
      ])
    },
    Role: cf.getAtt(`${prefix}PassthroughFunctionRole`, 'Arn'),
    Description: cf.sub('Passthrough function for ${AWS::StackName}'),
    Handler: 'index.lambda',
    Runtime: 'nodejs6.10',
    Timeout: 30,
    MemorySize: 128
  }
});

const PassthroughMethod = (lambda, prefix) => ({
  Type: 'AWS::ApiGateway::Method',
  Properties: {
    RestApiId: cf.ref(`${prefix}Api`),
    ResourceId: cf.ref(`${prefix}Resource`),
    ApiKeyRequired: false,
    AuthorizationType: 'None',
    HttpMethod: 'POST',
    Integration: {
      Type: 'AWS_PROXY',
      IntegrationHttpMethod: 'POST',
      Uri: cf.sub(`arn:aws:apigateway:\${AWS::Region}:lambda:path/2015-03-31/functions/\${${prefix}PassthroughFunction.Arn}/invocations`)
    }
  }
});

const Resource = (prefix) => ({
  Type: 'AWS::ApiGateway::Resource',
  Properties: {
    ParentId: cf.getAtt(`${prefix}Api`, 'RootResourceId'),
    RestApiId: cf.ref(`${prefix}Api`),
    PathPart: 'webhook'
  }
});

const OptionsMethod = (prefix) => ({
  Type: 'AWS::ApiGateway::Method',
  Properties: {
    RestApiId: cf.ref(`${prefix}Api`),
    ResourceId: cf.ref(`${prefix}Resource`),
    ApiKeyRequired: false,
    AuthorizationType: 'None',
    HttpMethod: 'OPTIONS',
    Integration: {
      Type: 'AWS_PROXY',
      IntegrationHttpMethod: 'POST',
      Uri: cf.sub(`arn:aws:apigateway:\${AWS::Region}:lambda:path/2015-03-31/functions/\${${prefix}PassthroughFunction.Arn}/invocations`)
    }
  }
});

const PassthroughFunctionRole = (lambda, prefix) => ({
  Type: 'AWS::IAM::Role',
  Properties: {
    AssumeRolePolicyDocument: {
      Statement: [
        {
          Sid: 'passthroughrole',
          Effect: 'Allow',
          Principal: {
            Service: 'lambda.amazonaws.com'
          },
          Action: 'sts:AssumeRole'
        }
      ]
    },
    Policies: [
      {
        PolicyName: `${prefix}PassthroughPolicy`,
        PolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Action: [
                'logs:*'
              ],
              Resource: [
                'arn:aws:logs:*:*:*'
              ]
            },
            {
              Effect: 'Allow',
              Action: [
                'lambda:InvokeFunction'
              ],
              Resource: cf.getAtt(lambda, 'Arn')
            }
          ]
        }
      }
    ]
  }
});

const FunctionRole = (prefix) => ({
  Type: 'AWS::IAM::Role',
  Properties: {
    AssumeRolePolicyDocument: {
      Statement: [
        {
          Sid: 'webhookrole',
          Effect: 'Allow',
          Principal: {
            Service: 'lambda.amazonaws.com'
          },
          Action: 'sts:AssumeRole'
        }
      ]
    },
    Policies: [
      {
        PolicyName: `${prefix}Policy`,
        PolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Action: [
                'logs:*'
              ],
              Resource: [
                'arn:aws:logs:*:*:*'
              ]
            },
            {
              Effect: 'Allow',
              Action: [
                'sns:Publish'
              ],
              Resource: [
                cf.ref(`${prefix}InvocationTopic`)
              ]
            }
          ]
        }
      }
    ]
  }
});

const LambdaFunction = (prefix) => ({
  Type: 'AWS::Lambda::Function',
  Properties: {
    Code: {
      ZipFile: cf.join('\n', [
        'var AWS = require("aws-sdk");',
        cf.sub('var sns = new AWS.SNS({ region: "${AWS::Region}" });'),
        cf.sub(`var topic = "\${${prefix}InvocationTopic}";`),
        cf.sub(`var secret = "\${${prefix}Secret}";`),
        'var crypto = require("crypto");',
        'module.exports.webhooks = function(event, context) {',
        '  var body = event.body',
        '  var hash = "sha1=" + crypto.createHmac("sha1", secret).update(new Buffer(JSON.stringify(body))).digest("hex");',
        '  if (event.signature !== hash) return context.done("invalid: signature does not match");',
        '  if (body.zen) return context.done(null, "ignored ping request");',
        '  var push;',
        '  try {',
        '    push = {',
        '      ref: event.body.ref,',
        '      after: event.body.after,',
        '      before: event.body.before,',
        '      deleted: event.body.deleted,',
        '      repository: {',
        '        name: event.body.repository.name,',
        '        owner: { name: event.body.repository.owner.name }',
        '      },',
        '      pusher: { name: event.body.pusher.name }',
        '    };',
        '  } catch (err) {',
        '    return context.done(null, "Ignored unparseable event from Github");',
        '  }',
        '  var params = {',
        '    TopicArn: topic,',
        '    Subject: "webhook",',
        '    Message: JSON.stringify(push)',
        '  };',
        '  sns.publish(params, function(err) {',
        '    if (err) return context.done("error: " + err.message);',
        '    context.done(null, "success");',
        '  });',
        '};'
      ])
    },
    Role: cf.getAtt(`${prefix}FunctionRole`, 'Arn'),
    Description: cf.sub('Github webhook for ${AWS::StackName}'),
    Handler: 'index.webhooks',
    Runtime: 'nodejs6.10',
    Timeout: 30,
    MemorySize: 128
  }
});

const Permission = (prefix) => ({
  Type: 'AWS::Lambda::Permission',
  Properties: {
    FunctionName: cf.ref(`${prefix}Function`),
    Action: 'lambda:InvokeFunction',
    Principal: 'apigateway.amazonaws.com',
    SourceArn: cf.sub(`arn:aws:execute-api:\${AWS::Region}:\${AWS::AccountId}:\${${prefix}Api}/*`)
  }
});

const PassthroughFunctionPermission = (lambda, prefix) => ({
  Type: 'AWS::Lambda::Permission',
  Properties: {
    FunctionName: cf.ref(`${prefix}PassthroughFunction`),
    Action: 'lambda:InvokeFunction',
    Principal: 'apigateway.amazonaws.com',
    SourceArn: cf.sub(`arn:aws:execute-api:\${AWS::Region}:\${AWS::AccountId}:\${${prefix}Api}/*`)
  }
});

const EndpointOuput = (prefix) => ({
  Description: 'The HTTPS endpoint used to send github webhooks',
  Value: cf.sub(`https://\${${prefix}Api}.execute-api.\${AWS::Region}.amazonaws.com/hookshot/webhook`)
});

const SecretOutput = (prefix) => ({
  Description: 'A secret key to give Github to use when signing webhook requests',
  Value: cf.ref(`${prefix}Secret`)
});

const github = (lambda, prefix = 'Webhook') => {
  const Resources = {};
  const Outputs = {};

  Resources[`${prefix}InvocationTopic`] = Topic(lambda, prefix);
  Resources[`${prefix}InvocationPermission`] = SnsPermission(lambda, prefix);
  Resources[`${prefix}Secret`] = Secret();
  Resources[`${prefix}Api`] = Api(prefix);
  Resources[`${prefix}Stage`] = Stage(prefix);
  Resources[`${prefix}Method`] = Method(prefix);
  Resources[`${prefix}Resource`] = Resource(prefix);
  Resources[`${prefix}FunctionRole`] = FunctionRole(prefix);
  Resources[`${prefix}Function`] = LambdaFunction(prefix);
  Resources[`${prefix}Permission`] = Permission(prefix);
  Resources[`${prefix}Deployment${random}`] = Deployment(prefix);

  Outputs[`${prefix}EndpointOutput`] = EndpointOuput(prefix);
  Outputs[`${prefix}SecretOutput`] = SecretOutput(prefix);

  return { Resources, Outputs };
};

const passthrough = (lambda, prefix = 'Webhook') => {
  const Resources = {};
  const Outputs = {};

  Resources[`${prefix}InvocationTopic`] = Topic(lambda, prefix);
  Resources[`${prefix}Api`] = Api(prefix);
  Resources[`${prefix}Stage`] = Stage(prefix);
  Resources[`${prefix}Method`] = PassthroughMethod(lambda, prefix);
  Resources[`${prefix}PassthroughFunction`] = PassthroughFunction(lambda, prefix);
  Resources[`${prefix}OptionsMethod`] = OptionsMethod(prefix);
  Resources[`${prefix}Resource`] = Resource(prefix);
  Resources[`${prefix}PassthroughFunctionRole`] = PassthroughFunctionRole(lambda, prefix);
  Resources[`${prefix}PassthroughFunctionPermission`] = PassthroughFunctionPermission(lambda, prefix);
  Resources[`${prefix}Deployment${random}`] = Deployment(prefix);
  Resources[`${prefix}Secret`] = Secret();

  Outputs[`${prefix}EndpointOutput`] = EndpointOuput(prefix);
  Outputs[`${prefix}SecretOutput`] = SecretOutput(prefix);

  return { Resources, Outputs };
};

module.exports = { github, passthrough };
