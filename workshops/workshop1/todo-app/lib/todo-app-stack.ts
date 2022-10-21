import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {Runtime} from "aws-cdk-lib/aws-lambda";
import {LambdaIntegration, RestApi} from "aws-cdk-lib/aws-apigateway";
import {NodejsFunction, NodejsFunctionProps} from "aws-cdk-lib/aws-lambda-nodejs";
import {AttributeType, BillingMode, Table} from "aws-cdk-lib/aws-dynamodb";
import {puts} from "util";

export class TodoAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB table
    const table = new Table(this, "TodoTable", {
      partitionKey: {
        name: "todoId",
        type: AttributeType.STRING
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
    });

    // Common function code
    const commonFunctionProps: NodejsFunctionProps = {
      handler: 'handler',
      runtime: Runtime.NODEJS_16_X,
      environment: {
        TABLE_NAME: table.tableName,
      },
      memorySize: 1024,
      timeout: cdk.Duration.seconds(29)
    };

    // Lambda Functions
    const getFunction = new NodejsFunction(this, "GetTodoFunction", {
      entry: "functions/get_todo/handler.ts",
      ...commonFunctionProps
    });

    const createFunction = new NodejsFunction(this, "CreateTodoFunction", {
      entry: "functions/create_todo/handler.ts",
      ...commonFunctionProps
    });

    const updateFunction = new NodejsFunction(this, "UpdateTodoFunction", {
      entry: "functions/update_todo/handler.ts",
      ...commonFunctionProps
    });

    const deleteFunction = new NodejsFunction(this, "DeleteTodoFunction", {
      entry: "functions/delete_todo/handler.ts",
      ...commonFunctionProps
    });

    const listFunction = new NodejsFunction(this, "ListTodoFunction", {
      entry: "functions/list_todo/handler.ts",
      ...commonFunctionProps
    });

  // Add Lambda runtime permissions
    table.grantReadData(getFunction);
    table.grantWriteData(createFunction);
    table.grantReadData(listFunction);
    table.grantWriteData(updateFunction);
    table.grantWriteData(deleteFunction);

    // REST API
    const restApi = new RestApi(this, "RestApi", {});
    const todos = restApi.root.addResource("todo");
    const todo = todos.addResource("{todoId}");
    todo.addMethod("GET", new LambdaIntegration(getFunction));
    todos.addMethod("POST", new LambdaIntegration(createFunction));
    todos.addMethod("GET", new LambdaIntegration(listFunction));
    todo.addMethod("PATCH", new LambdaIntegration(updateFunction));
    todo.addMethod("DELETE", new LambdaIntegration(deleteFunction));
  }
}