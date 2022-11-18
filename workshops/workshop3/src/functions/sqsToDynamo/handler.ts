import { SQSEvent } from "aws-lambda";
import {v4 as uuidv4} from "uuid";
import {DynamoDBDocumentClient, PutCommand} from "@aws-sdk/lib-dynamodb";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME || '';
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type SqsRecord = {
    name: string;
};

export const handler = async function (event: SQSEvent): Promise<void> {
    const dynamoDbPromises = [];
    for (const sqsRecord of event.Records) {
        console.log({sqsRecord});

        const todo = JSON.parse(sqsRecord.body) as SqsRecord;
        console.log({todo});

        const timestamp = new Date().getTime();

        const item = {
            todoId: uuidv4(),
            name: todo.name,
            completed: false,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        dynamoDbPromises.push(client.send(
            new PutCommand({
                TableName: TABLE_NAME,
                Item: item,
            }),
        ));
    }

    const createdTodos = await Promise.all(dynamoDbPromises);
    console.log(`Added ${createdTodos.length} new todos`, {createdTodos});
};
