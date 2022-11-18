import { EventBridgeEvent } from "aws-lambda";
import {todoItem} from "../../types/todoItem";
import {PublishCommand, SNSClient} from "@aws-sdk/client-sns";



export const handler = async function (
    event: EventBridgeEvent<"TodoCompleted", todoItem>
): Promise<void> {
    console.log(`Todo ${event.detail.todoId} completed`, event);

    // Create publish parameters
    const params = {
        Message: `Todo ${event.detail.todoId} completed`,
        Subject: `Todo completed`,
        TopicArn: process.env.TOPIC_ARN || "",
    };
    const snsClient = new SNSClient({});
    await snsClient.send(
        new PublishCommand(params)
    );
};