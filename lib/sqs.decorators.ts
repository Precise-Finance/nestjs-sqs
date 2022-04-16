import { SetMetadata } from '@nestjs/common';
import { SQS_CONSUMER_EVENT_HANDLER, SQS_CONSUMER_METHOD } from './sqs.constants';
import { AuditContext } from '@precise/audit';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const SqsMessageHandler = (name: string, batch?: boolean, auditContext?: Partial<AuditContext>) =>
  SetMetadata(SQS_CONSUMER_METHOD, { name, batch, auditContext });
export const SqsConsumerEventHandler = (name: string, eventName: string) =>
  SetMetadata(SQS_CONSUMER_EVENT_HANDLER, { name, eventName });
