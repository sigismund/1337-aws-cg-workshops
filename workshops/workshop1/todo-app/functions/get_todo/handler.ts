import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {DynamoDBDocumentClient, GetCommand} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME || '';
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async function (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const todoId = event.pathParameters?.todoId;

  if (!todoId) {
    return {
      statusCode: 404,
      body: JSON.stringify({
        error: `Todo with ID ${todoId} not found`,
      }),
    }
  }

  try {
    const todoItem = await client.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            todoId,
          },
        })
    );

    if (!todoItem.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: `Todo with ID ${todoId} not found`,
        }),
      };
    }

    const responseItem = {
      todoId: todoItem.Item.todoId,
      name: todoItem.Item.name,
      completed: todoItem.Item.completed,
      createdAt: todoItem.Item.createdAt,
      updatedAt: todoItem.Item.updatedAt,
    };

    return {
      statusCode: 200,
      body: JSON.stringify(responseItem),
    }
  } catch (error) {
    console.error(`Encountered an error while fetching TODO item. Error: ${error.message}`)
    return {
      statusCode: 404,
      body: JSON.stringify({
        error: `Todo with ID ${todoId} not found`,
      }),
    }
  }
};