import { applyDecorators, SetMetadata } from '@nestjs/common';
import { SQS_CONSUMER_EVENT_HANDLER, SQS_CONSUMER_METHOD } from './sqs.constants';
import { AuditContext } from '@precise/audit';
import { Span } from '@precise/nestjs-opentelemetry';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const SqsMessageHandler = (name: string, batch?: boolean, auditContext?: Partial<AuditContext>, instances = 1) =>
  applyDecorators(Span(), SetMetadata(SQS_CONSUMER_METHOD, { name, batch, auditContext }));
export const SqsConsumerEventHandler = (name: string, eventName: string) =>
  applyDecorators(Span(), SetMetadata(SQS_CONSUMER_EVENT_HANDLER, { name, eventName }));
