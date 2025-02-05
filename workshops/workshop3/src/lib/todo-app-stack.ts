import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  NodejsFunction,
  NodejsFunctionProps,
} from 'aws-cdk-lib/aws-lambda-nodejs';
import { DynamoEventSource, SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import {
  Table,
  AttributeType,
  BillingMode,
  StreamViewType,
} from 'aws-cdk-lib/aws-dynamodb';
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
import { Runtime, StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Bucket, EventType } from "aws-cdk-lib/aws-s3"; // add EventType to this import
import { LambdaDestination } from "aws-cdk-lib/aws-s3-notifications";

export class TodoAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // EventBridge bus
    const bus = new EventBus(this, 'TodoEventBus');

    // SNS Topic
    const topic = new Topic(this, 'TodoEventTopic');
    topic.addSubscription(new EmailSubscription('ziga.drnovscek@1337.tech'));

    // DynamoDB Table
    const table = new Table(this, 'TodoTable', {
      partitionKey: {
        name: 'todoId',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      pointInTimeRecovery: true,
    });

    // S3 Bucket
    const bucket = new Bucket(this, 'TodoImportBucket');

    // Import Queue
    const queue = new Queue(this, 'TodoImportQueue', {
      visibilityTimeout: cdk.Duration.seconds(120),
    });

    // Lambda Functions
    const commonFunctionProps: NodejsFunctionProps = {
      handler: 'handler',
      runtime: Runtime.NODEJS_16_X,
      memorySize: 1024,
      bundling: {
        minify: true,
      },
    };

    const apiFunctionProps: NodejsFunctionProps = {
      timeout: cdk.Duration.seconds(29),
      environment: {
        TABLE_NAME: table.tableName,
      },
    };

    const getFunction = new NodejsFunction(this, 'GetTodoFunction', {
      entry: 'functions/getTodo/handler.ts',
      ...commonFunctionProps,
      ...apiFunctionProps,
    });
    const listFunction = new NodejsFunction(this, 'ListTodoFunction', {
      entry: 'functions/listTodos/handler.ts',
      ...commonFunctionProps,
      ...apiFunctionProps,
    });
    const createFunction = new NodejsFunction(this, 'CreateTodoFunction', {
      entry: 'functions/createTodo/handler.ts',
      ...commonFunctionProps,
      ...apiFunctionProps,
    });
    const updateFunction = new NodejsFunction(this, 'UpdateTodoFunction', {
      entry: 'functions/updateTodo/handler.ts',
      ...commonFunctionProps,
      ...apiFunctionProps,
    });
    const deleteFunction = new NodejsFunction(this, 'DeleteTodoFunction', {
      entry: 'functions/deleteTodo/handler.ts',
      ...commonFunctionProps,
      ...apiFunctionProps,
    });
    const streamFunction = new NodejsFunction(this, 'StreamFunction', {
      entry: 'functions/stream/handler.ts',
      ...commonFunctionProps,
      timeout: cdk.Duration.seconds(60),
      environment: {
        EVENT_BUS_NAME: bus.eventBusName,
      },
    });
    const todoCreatedFunction = new NodejsFunction(
      this,
      'TodoCreatedFunction',
      {
        entry: 'functions/todoCreatedEvent/handler.ts',
        ...commonFunctionProps,
        timeout: cdk.Duration.seconds(60),
      },
    );
    const todoCompletedFunction = new NodejsFunction(
      this,
      'TodoCompletedFunction',
      {
        entry: 'functions/todoCompletedEvent/handler.ts',
        ...commonFunctionProps,
        timeout: cdk.Duration.seconds(60),
        environment: {
          TOPIC_ARN: topic.topicArn,
        },
      },
    );
    const todoDeletedFunction = new NodejsFunction(
      this,
      'TodoDeletedFunction',
      {
        entry: 'functions/todoDeletedEvent/handler.ts',
        ...commonFunctionProps,
        timeout: cdk.Duration.seconds(60),
      },
    );
    const s3ToSqsFunction = new NodejsFunction(this, "S3ToSqsFunction", {
      entry: "functions/s3ToSqs/handler.ts",
      ...commonFunctionProps,
      timeout: cdk.Duration.seconds(900),
      environment: {
        QUEUE_URL: queue.queueUrl,
        BUCKET_NAME: bucket.bucketName,
      },
    });

    const sqsToDynamo = new NodejsFunction(this, "SqsToDynamoFunction", {
      entry: "functions/sqsToDynamo/handler.ts",
      ...commonFunctionProps,
      timeout: cdk.Duration.seconds(60),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    // Add Lambda runtime permissions
    table.grantReadData(getFunction);
    table.grantReadData(listFunction);
    table.grantWriteData(createFunction);
    table.grantWriteData(updateFunction);
    table.grantWriteData(deleteFunction);
    table.grantWriteData(sqsToDynamo);
    bus.grantPutEventsTo(streamFunction);
    topic.grantPublish(todoCompletedFunction);
    // Lambda access to S3
    bucket.grantRead(s3ToSqsFunction);
    // Lambda access to SQS
    queue.grantSendMessages(s3ToSqsFunction);

    // S3 integration
    bucket.addEventNotification(
        EventType.OBJECT_CREATED,
        new LambdaDestination(s3ToSqsFunction),
        { prefix: "import/" }
    );

    // REST API
    const restApi = new RestApi(this, 'RestApi', {});

    const todos = restApi.root.addResource('todo');
    todos.addMethod('GET', new LambdaIntegration(listFunction));
    todos.addMethod('POST', new LambdaIntegration(createFunction));

    const todo = todos.addResource('{todoId}');
    todo.addMethod('GET', new LambdaIntegration(getFunction));
    todo.addMethod('PATCH', new LambdaIntegration(updateFunction));
    todo.addMethod('DELETE', new LambdaIntegration(deleteFunction));

    // DynamoDB stream integration
    streamFunction.addEventSource(
      new DynamoEventSource(table, {
        startingPosition: StartingPosition.TRIM_HORIZON,
        batchSize: 10,
        retryAttempts: 3,
      }),
    );

    // SQS integration
    sqsToDynamo.addEventSource(
        new SqsEventSource(queue, {
          batchSize: 5,
        })
    );

    // EventBridge integrations
    new Rule(this, 'TodoCreatedRule', {
      eventBus: bus,
      eventPattern: { detailType: ['todoCreated'] },
      targets: [new LambdaFunction(todoCreatedFunction)],
    });

    new Rule(this, 'TodoCompletedRule', {
      eventBus: bus,
      eventPattern: { detailType: ['todoCompleted'] },
      targets: [new LambdaFunction(todoCompletedFunction)],
    });

    new Rule(this, 'TodoDeletedRule', {
      eventBus: bus,
      eventPattern: { detailType: ['todoDeleted'] },
      targets: [new LambdaFunction(todoDeletedFunction)],
    });

    // Outputs
    new cdk.CfnOutput(this, 'TodoImportBucketOutput', {
      value: bucket.bucketName,
    });
  }
}
