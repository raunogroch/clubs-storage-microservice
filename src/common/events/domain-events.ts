export interface DomainEvent<TPayload = unknown> {
  eventName: string;
  occurredAt: string;
  payload: TPayload;
}

export interface FileUploadedEvent {
  id: string;
  userId: string;
  type: string;
  url?: string;
  mimeType?: string;
}
