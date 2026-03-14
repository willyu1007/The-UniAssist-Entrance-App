import type { WorkflowConsoleStreamEvent } from '@uniassist/workflow-contracts';

type Subscriber = (event: WorkflowConsoleStreamEvent) => void;

export class ControlConsoleStreamBroker {
  private readonly subscribers = new Set<Subscriber>();

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  publish(event: WorkflowConsoleStreamEvent): void {
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }
}
