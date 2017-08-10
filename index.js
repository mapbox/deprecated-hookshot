'use strict';

const cf = require('@mapbox/cloudfriend');


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

const Permission = (lambda) => ({
  Type: 'AWS::Lambda::Permission',
  Properties: {
    Action: 'lambda:invokeFunction',
    FunctionName: cf.ref(lambda),
    Principal: 'sns.amazonaws.com',
    SourceArn: cf.ref('InvocationTopic')
  }
});

const WebhookUser = {
  Type: 'AWS::IAM::User',
  Properties: {
    Policies: []
  }
};

const WebhookUserKey = {
  Type: 'AWS::IAM::AccessKey',
  Properties: {
    Status: 'Active',
    UserName: cf.ref('WebhookUser')
  }
};

const WebhookApi = {
  Type: 'AWS::ApiGateway::RestApi',
  Properties: {
    Name: cf.sub('${AWS::StackName}-webhook'),
    FailOnWarnings: true
  }
};

const WebhookDeployment = {
  Type: 'AWS::ApiGateway::Deployment',
  DependsOn: 'WebhookMethod',
  Properties: {
    RestApiId: cf.ref('WebhookApi'),
    StageName: 'github',
    StageDescription: {
      MethodSettings: [
        {
          HttpMethod: '*',
          ResourcePath: '/*',
          ThrottlingBurstLimit: 20,
          ThrottlingRateLimit: 5
        }
      ]
    }
  }
};

const WebhookPassthroughDeployment = {
  Type: 'AWS::ApiGateway::Deployment',
  DependsOn: 'WebhookPassthroughMethod',
  Properties: {
    RestApiId: cf.ref('WebhookApi'),
    StageName: 'service',
    StageDescription: {
      MethodSettings: [
        {
          HttpMethod: '*',
          ResourcePath: '/*',
          ThrottlingBurstLimit: 20,
          ThrottlingRateLimit: 5
        }
      ]
    }
  }
};

const WebhookMethod = {
  Type: 'AWS::ApiGateway::Method',
  Properties: {
    RestApiId: cf.ref('WebhookApi'),
    ResourceId: cf.ref('WebhookResource'),
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
      Uri: cf.sub('arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${WebhookFunction.Arn}/invocations'),
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
};

const WebhookPassthroughMethod = (lambda) => ({
  Type: 'AWS::ApiGateway::Method',
  Properties: {
    RestApiId: cf.ref('WebhookApi'),
    ResourceId: cf.ref('WebhookResource'),
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
          StatusCode: 400,
          SelectionPattern: '^invalid.*'
        }
      ],
      Uri: cf.sub(`arn:aws:apigateway:\${AWS::Region}:lambda:path/2015-03-31/functions/\${${lambda}.Arn}/invocations`),
      RequestTemplates: {
        'application/json': "{\"headers\":\"$input.params()\",\"body\":$input.json('$'),\"method\":\"$context.httpMethod\"}"
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
        StatusCode: '400',
        ResponseModels: {
          'application/json': 'Empty'
        }
      }
    ]
  }
});

const WebhookResource = {
  Type: 'AWS::ApiGateway::Resource',
  Properties: {
    ParentId: cf.getAtt('WebhookApi', 'RootResourceId'),
    RestApiId: cf.ref('WebhookApi'),
    PathPart: 'webhook'
  }
};

const WebhookFunctionRole = {
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
        PolicyName: 'WebhookPolicy',
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
                cf.ref('InvocationTopic')
              ]
            }
          ]
        }
      }
    ]
  }
};

const WebhookFunction = {
  Type: 'AWS::Lambda::Function',
  Properties: {
    Code: {
      ZipFile: cf.join('\n', [
        'var AWS = require("aws-sdk");',
        cf.sub('var sns = new AWS.SNS({ region: "${AWS::Region}" });'),
        cf.sub('var topic = "${InvocationTopic}";'),
        cf.sub('var secret = "${WebhookUserKey}";'),
        'var crypto = require("crypto");',
        'module.exports.webhooks = function(event, context) {',
        '  var body = event.body',
        '  var hash = "sha1=" + crypto.createHmac("sha1", secret).update(new Buffer(JSON.stringify(body))).digest("hex");',
        '  if (event.signature !== hash) return context.done("invalid: signature does not match");',
        '  if (body.zen) return context.done(null, "ignored ping request");',
        '  var push = {',
        '    ref: event.body.ref,',
        '    after: event.body.after,',
        '    before: event.body.before,',
        '    deleted: event.body.deleted,',
        '    repository: {',
        '      name: event.body.repository.name,',
        '      owner: { name: event.body.repository.owner.name }',
        '    },',
        '    pusher: { name: event.body.pusher.name }',
        '  };',
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
    Role: cf.getAtt('WebhookFunctionRole', 'Arn'),
    Description: cf.sub('Github webhook for ${AWS::StackName}'),
    Handler: 'index.webhooks',
    Runtime: 'nodejs6.10',
    Timeout: 30,
    MemorySize: 128
  }
};

const WebhookPermission = {
  Type: 'AWS::Lambda::Permission',
  Properties: {
    FunctionName: cf.ref('WebhookFunction'),
    Action: 'lambda:InvokeFunction',
    Principal: 'apigateway.amazonaws.com',
    SourceArn: cf.sub('arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${WebhookApi}/*')
  }
};

const WebhookPassthroughPermission = (lambda) => ({
  Type: 'AWS::Lambda::Permission',
  Properties: {
    FunctionName: cf.ref(lambda),
    Action: 'lambda:InvokeFunction',
    Principal: 'apigateway.amazonaws.com',
    SourceArn: cf.sub('arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${WebhookApi}/*')
  }
});

const Outputs = {
  WebhookEndpoint: {
    Description: 'The HTTPS endpoint used to send github webhooks',
    Value: cf.sub('https://${WebhookApi}.execute-api.${AWS::Region}.amazonaws.com/github/webhook')
  },
  WebhookSecret: {
    Description: 'A secret key to give Github to use when signing webhook requests',
    Value: cf.ref('WebhookUserKey')
  }
};

const PassthroughOutputs = {
  WebhookEndpoint: {
    Description: 'The HTTPS endpoint used to send webhooks',
    Value: cf.sub('https://${WebhookApi}.execute-api.${AWS::Region}.amazonaws.com/service/webhook')
  }
};

const builder = (lambda) => ({
  Outputs,
  Resources: {
    InvocationTopic: Topic(lambda),
    InvocationPermission: Permission(lambda),
    WebhookUser,
    WebhookUserKey,
    WebhookApi,
    WebhookDeployment,
    WebhookMethod,
    WebhookResource,
    WebhookFunctionRole,
    WebhookFunction,
    WebhookPermission
  }
});

const passthrough = (lambda) => ({
  Outputs: PassthroughOutputs,
  Resources: {
    WebhookApi,
    WebhookPassthroughDeployment,
    WebhookPassthroughMethod: WebhookPassthroughMethod(lambda),
    WebhookResource,
    WebhookPassthroughPermission: WebhookPassthroughPermission(lambda)
  }
});

module.exports = builder;
module.exports.passthrough = passthrough;
