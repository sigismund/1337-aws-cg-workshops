import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  NodejsFunction,
  NodejsFunctionProps,
} from 'aws-cdk-lib/aws-lambda-nodejs';
import {Table, AttributeType, BillingMode, StreamViewType} from 'aws-cdk-lib/aws-dynamodb';
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
import {Runtime, StartingPosition} from 'aws-cdk-lib/aws-lambda';
import {DynamoEventSource} from "aws-cdk-lib/aws-lambda-event-sources";
import {EventBus, Rule} from "aws-cdk-lib/aws-events";
import {LambdaFunction} from "aws-cdk-lib/aws-events-targets";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";


export class TodoAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // SNS Topic
    const topic = new Topic(this, "TodoEventTopic");
    topic.addSubscription(new EmailSubscription("ziga.drnovscek@gmail.com"));

    // EventBridge bus
    const bus = new EventBus(this, "TodoEventBus");

    // DynamoDB Table
    const table = new Table(this, 'TodoTable', {
      partitionKey: {
        name: 'todoId',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_AND_OLD_IMAGES, // add this line
      pointInTimeRecovery: true,
    });

    // Lambda Functions
    const commonFunctionProps: NodejsFunctionProps = {
      handler: "handler",
      runtime: Runtime.NODEJS_16_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(60),
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

    const getFunction = new NodejsFunction(this, "GetTodoFunction", {
      entry: "functions/getTodo/handler.ts",
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

    const todoCreatedFunction = new NodejsFunction(this, "TodoCreatedFunction", {
      entry: "functions/todoCreatedEvent/handler.ts",
      ...commonFunctionProps,
    });

    const todoCompletedFunction = new NodejsFunction(this, "TodoCompletedFunction", {
      entry: "functions/todoCompletedEvent/handler.ts",
      ...commonFunctionProps,
      environment: {
        TOPIC_ARN: topic.topicArn,
      },
    });

    const todoDeletedFunction = new NodejsFunction(this, "TodoDeletedFunction", {
      entry: "functions/todoDeletedEvent/handler.ts",
      ...commonFunctionProps,
    });

    const streamFunction = new NodejsFunction(this, "StreamFunction", {
      entry: "functions/stream/handler.ts",
      ...commonFunctionProps,
      environment: {
        EVENT_BUS_NAME: bus.eventBusName,
      },
      // api props not needed here
    });

    // EventBridge integrations
    new Rule(this, "TodoCreatedRule", {
      eventBus: bus,
      eventPattern: { detailType: ["TodoCreated"] },
      targets: [new LambdaFunction(todoCreatedFunction)],
    });

    new Rule(this, "TodoCompletedRule", {
      eventBus: bus,
      eventPattern: { detailType: ["TodoCompleted"] },
      targets: [new LambdaFunction(todoCompletedFunction)],
    });

    new Rule(this, "TodoDeletedRule", {
      eventBus: bus,
      eventPattern: { detailType: ["TodoDeleted"] },
      targets: [new LambdaFunction(todoDeletedFunction)],
    });

    // DynamoDB stream integration
    streamFunction.addEventSource(
        new DynamoEventSource(table, {
          startingPosition: StartingPosition.TRIM_HORIZON,
          batchSize: 10,
          retryAttempts: 3,
        })
    );

    // Add Lambda runtime permissions
    table.grantReadData(getFunction);
    table.grantReadData(listFunction);
    table.grantWriteData(createFunction);
    table.grantWriteData(updateFunction);
    table.grantWriteData(deleteFunction);

    // Grant stream function put permissions for EventBus
    bus.grantPutEventsTo(streamFunction);

    topic.grantPublish(todoCompletedFunction);

    // REST API
    const restApi = new RestApi(this, 'RestApi', {});

    const todos = restApi.root.addResource('todo');
    todos.addMethod('GET', new LambdaIntegration(listFunction));
    todos.addMethod('POST', new LambdaIntegration(createFunction));

    const todo = todos.addResource('{todoId}');
    todo.addMethod('GET', new LambdaIntegration(getFunction));
    todo.addMethod('PATCH', new LambdaIntegration(updateFunction));
    todo.addMethod('DELETE', new LambdaIntegration(deleteFunction));
  }
}
