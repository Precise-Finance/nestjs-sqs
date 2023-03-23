import { Inject, Injectable, Logger, LoggerService, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer } from 'sqs-consumer';
import { Producer } from 'sqs-producer';
import { QueueName, SqsConsumerEventHandlerMeta, SqsMessageHandlerMeta, SqsOptions, Message as SNSMessage } from './sqs.types';
import { DiscoveryService } from '@nestjs-plus/discovery';
import { SQS_CONSUMER_EVENT_HANDLER, SQS_CONSUMER_METHOD, SQS_OPTIONS } from './sqs.constants';
import type { QueueAttributeName } from 'aws-sdk/clients/sqs';
import { GetQueueAttributesCommand, Message, PurgeQueueCommand, SQSClient } from '@aws-sdk/client-sqs';
import { AuditContext, runWithContext } from '@precise/audit';

@Injectable()
export class SqsService implements OnModuleInit, OnModuleDestroy {
  public readonly consumers = new Map<QueueName, Consumer>();
  public readonly producers = new Map<QueueName, Producer>();

  private readonly logger = new Logger(SqsService.name);

  public constructor(
    @Inject(SQS_OPTIONS) public readonly options: SqsOptions,
    private readonly discover: DiscoveryService,
  ) {}

  public async onModuleInit(): Promise<void> {
    const messageHandlers = await this.discover.providerMethodsWithMetaAtKey<SqsMessageHandlerMeta>(
      SQS_CONSUMER_METHOD,
    );
    const eventHandlers = await this.discover.providerMethodsWithMetaAtKey<SqsConsumerEventHandlerMeta>(
      SQS_CONSUMER_EVENT_HANDLER,
    );

    this.options.consumers?.forEach((options) => {
      const { name, ...consumerOptions } = options;
      if (this.consumers.has(name)) {
        throw new Error(`Consumer already exists: ${name}`);
      }

      const metadata = messageHandlers.find(({ meta }) => meta.name === name);
      if (!metadata) {
        this.logger.warn(`No metadata found for: ${name}`);
      }

      const isBatchHandler = metadata.meta.batch === true;
      for (let i = 0; i < metadata.meta.instances; i++) {
        const consumerName = i == 0 ? metadata.meta.name : `${metadata.meta.name}_${i}`;
        const consumer = Consumer.create({
          ...consumerOptions,
          ...(isBatchHandler
            ? {
                handleMessageBatch: metadata.discoveredMethod.handler.bind(
                  metadata.discoveredMethod.parentClass.instance,
                ),
              }
            : {
                handleMessage: async (message: Message) => {
                  // Will create a telemetry context with MessageId as traceId
                  let auditContext = {};

                  if (metadata.meta.auditContext) {
                    const attrs = message.MessageAttributes;

                    auditContext = new AuditContext({
                      ...metadata.meta.auditContext,
                      userAgent: attrs?.userAgent?.StringValue as string,
                      ip: attrs?.ip?.StringValue as string,
                      host: attrs?.host?.StringValue as string,
                      path: metadata.discoveredMethod.methodName,
                    });
                  }

                  return await runWithContext(
                    auditContext,
                    async () =>
                      await metadata.discoveredMethod.handler.bind(metadata.discoveredMethod.parentClass.instance)(
                        message,
                      ),
                  );
                },
              }),
        });

        // Same event handler for all instances
        const eventsMetadata = eventHandlers.filter(({ meta }) => meta.name === name);
        for (const eventMetadata of eventsMetadata) {
          if (eventMetadata) {
            consumer.addListener(
              eventMetadata.meta.eventName,
              eventMetadata.discoveredMethod.handler.bind(metadata.discoveredMethod.parentClass.instance),
            );
          }
        }
        consumer.addListener('error', (err, message) => this.logger.error({ ...err, sqsMessage: message }));
        this.consumers.set(consumerName, consumer);
      }
    });

    this.options.producers?.forEach((options) => {
      const { name, ...producerOptions } = options;
      if (this.producers.has(name)) {
        throw new Error(`Producer already exists: ${name}`);
      }

      const producer = Producer.create(producerOptions);
      this.producers.set(name, producer);
    });

    for (const consumer of this.consumers.values()) {
      consumer.start();
    }
  }

  public onModuleDestroy() {
    for (const consumer of this.consumers.values()) {
      consumer.stop();
    }
  }

  private getQueueInfo(name: QueueName) {
    if (!this.consumers.has(name) && !this.producers.has(name)) {
      throw new Error(`Consumer/Producer does not exist: ${name}`);
    }

    const { sqs, queueUrl } = (this.consumers.get(name) || this.producers.get(name)) as {
      sqs: SQSClient;
      queueUrl: string;
    };
    if (!sqs) {
      throw new Error('SQS instance does not exist');
    }

    return {
      sqs,
      queueUrl,
    };
  }

  public async purgeQueue(name: QueueName) {
    const { sqs, queueUrl } = this.getQueueInfo(name);
    const command = new PurgeQueueCommand({
      QueueUrl: queueUrl,
    });
    return await sqs.send(command);
  }

  public async getQueueAttributes(name: QueueName) {
    const { sqs, queueUrl } = this.getQueueInfo(name);
    const command = new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['All'],
    });
    const response = await sqs.send(command);
    return response.Attributes as { [key in QueueAttributeName]: string };
  }

  public getProducerQueueSize(name: QueueName) {
    if (!this.producers.has(name)) {
      throw new Error(`Producer does not exist: ${name}`);
    }

    return this.producers.get(name).queueSize();
  }

  public send<T = any>(name: QueueName, payload: SNSMessage<T> | SNSMessage<T>[]) {
    if (!this.producers.has(name)) {
      throw new Error(`Producer does not exist: ${name}`);
    }

    const originalMessages = Array.isArray(payload) ? payload : [payload];
    const messages = originalMessages.map((message) => {
      let body = message.body;
      if (typeof body !== 'string') {
        body = JSON.stringify(body) as any;
      }

      return {
        ...message,
        body,
      };
    });

    const producer = this.producers.get(name);
    return producer.send(messages as any[]);
  }
}
