import { S3Event } from "aws-lambda";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { parseStream } from "@fast-csv/parse";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Readable } from "stream";

const QUEUE_URL = process.env.QUEUE_URL || "";
const sqsClient = new SQSClient({});
const s3Client = new S3Client({});

// This should match the structure of your CSV file
type CsvRow = {
    name: string;
};

export const handler = async function (event: S3Event): Promise<void> {
    for await (const record of event.Records) {
        const response = await s3Client.send(
            new GetObjectCommand({
                Bucket: record.s3.bucket.name,
                Key: record.s3.object.key,
            })
        );

        const csvStream = parseStream<CsvRow, CsvRow>(response.Body as Readable, {
            headers: true,
            ignoreEmpty: true,
        });

        const sqsPromises = [];

        for await (const row of csvStream) {
            sqsPromises.push(sqsClient.send(
                new SendMessageCommand({
                    QueueUrl: QUEUE_URL,
                    MessageBody: JSON.stringify(row),
                })
            ));
        }

        const processedMessages = await Promise.all(sqsPromises);

        console.log(`Created ${processedMessages.length} SQS messages.`);
    }
};