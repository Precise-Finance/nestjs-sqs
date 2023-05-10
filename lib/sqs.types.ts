import type { ConsumerOptions } from 'sqs-consumer';
import type { Producer } from 'sqs-producer';
import type { ModuleMetadata, Type, LoggerService } from '@nestjs/common';
import type { AuditContext } from '@precise/audit';
import { MessageAttributeValue } from '@aws-sdk/client-sqs';

export type ProducerOptions = Parameters<typeof Producer.create>[0];
export type QueueName = string;

export type SqsConsumerOptions = Omit<ConsumerOptions, 'handleMessage' | 'handleMessageBatch'> & {
  name: QueueName;
};

export type SqsProducerOptions = ProducerOptions & {
  name: QueueName;
};

export interface SqsOptions {
  consumers?: SqsConsumerOptions[];
  producers?: SqsProducerOptions[];
  logger?: LoggerService;
}

export interface SqsModuleOptionsFactory {
  createOptions(): Promise<SqsOptions> | SqsOptions;
}

export interface SqsModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useExisting?: Type<SqsModuleOptionsFactory>;
  useClass?: Type<SqsModuleOptionsFactory>;
  useFactory?: (...args: any[]) => Promise<SqsOptions> | SqsOptions;
  inject?: any[];
}

export interface Message<T = any> {
  id: string;
  body: T;
  groupId?: string;
  deduplicationId?: string;
  delaySeconds?: number;
  messageAttributes?: Record<string, MessageAttributeValue>;
}

export interface SqsMessageHandlerMeta {
  name: string;
  batch?: boolean;
  auditContext?: Partial<AuditContext>;
  instances: number;
}

export interface SqsConsumerEventHandlerMeta {
  name: string;
  eventName: string;
}
