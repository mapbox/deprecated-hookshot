'use strict';

const cf = require('@mapbox/cloudfriend');
const buildWebhook = require('..').passthrough;

const myTemplate = {
  Resources: {
    MyLogs: {
      Type: 'AWS::Logs::LogGroup',
      Properties: {
        LogGroupName: cf.sub('/aws/lambda/${AWS::StackName}'),
        RetentionInDays: 14
      }
    },
    MyLambda: {
      Type: 'AWS::Lambda::Function',
      Properties: {
        Code: {
          ZipFile: cf.join('\n', [
            'module.exports.handler = (event, context, callback) => {',
            '  console.log(event);',
            '  callback();',
            '};'
          ])
        },
        FunctionName: cf.stackName,
        Handler: 'index.handler',
        MemorySize: 128,
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
                  Resource: cf.getAtt('MyLogs', 'Arn')
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
