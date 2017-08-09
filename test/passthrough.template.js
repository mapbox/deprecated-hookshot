'use strict';

const cf = require('@mapbox/cloudfriend');
const buildWebhook = require('..').passthrough;

const myTemplate = {
  Resources: {
    MyLambda: {
      Type: 'AWS::Lambda::Function',
      Properties: {
        Code: {
          S3Bucket: 'my-bucket',
          S3Key: 'my-code.zip'
        },
        FunctionName: 'MyGithubWebhook',
        Handler: 'index.handler',
        MemorySize: 256,
        Runtime: 'nodejs6.10',
        Timeout: 300,
        Role: cf.getAtt('LambdaRole', 'Arn')
      }
    },
    LambdaRole: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }
          ]
        },
        Policies: [
          {
            PolicyName: 'write-logs',
            PolicyDocument: {
              Statement: [
                {
                  Effect: 'Allow',
                  Action: 'logs:*',
                  Resource: 'arn:aws:logs:*'
                }
              ]
            }
          }
        ]
      }
    }
  }
};

const webhook = buildWebhook('MyLambda');

module.exports = cf.merge(myTemplate, webhook);
