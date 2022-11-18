import { EventBridgeEvent } from "aws-lambda";
import {todoItem} from "../../types/todoItem";

export const handler = async function (
    event: EventBridgeEvent<"TodoCreated", todoItem>
): Promise<void> {
    console.log(`Todo ${event.detail.todoId} created`, event);
};