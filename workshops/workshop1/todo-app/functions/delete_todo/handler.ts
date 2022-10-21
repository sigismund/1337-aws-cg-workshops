import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {DeleteCommand, DynamoDBDocumentClient, GetCommand} from "@aws-sdk/lib-dynamodb";
import {ConditionalCheckFailedException, DynamoDBClient} from "@aws-sdk/client-dynamodb";

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
        await client.send(
            new DeleteCommand({
                TableName: TABLE_NAME,
                Key: {
                    todoId,
                },
                ConditionExpression: "attribute_exists(todoId)",
            })
        );

        return {
            statusCode: 204,
            body: '',
        }
    } catch (error) {
        if (error instanceof ConditionalCheckFailedException) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: `Todo with ID ${todoId} not found`,
                }),
            };
        } else {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: `There was an error deleting TODO with an ID: ${todoId}`,
                }),
            };
        }
    }
};