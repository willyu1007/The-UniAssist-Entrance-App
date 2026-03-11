import type {
  WorkflowCreateRequest,
  WorkflowTemplateRecord,
  WorkflowTemplateVersionRecord,
} from '@baseinterface/workflow-contracts';

export class PlatformStore {
  private readonly templatesById = new Map<string, WorkflowTemplateRecord>();

  private readonly workflowKeyToTemplateId = new Map<string, string>();

  private readonly versionsById = new Map<string, WorkflowTemplateVersionRecord>();

  private readonly versionsByWorkflowKey = new Map<string, WorkflowTemplateVersionRecord[]>();

  createWorkflow(
    request: WorkflowCreateRequest,
    ids: { workflowId: string; templateVersionId: string; timestamp: number },
  ): { workflow: WorkflowTemplateRecord; version: WorkflowTemplateVersionRecord } {
    const workflow: WorkflowTemplateRecord = {
      workflowId: ids.workflowId,
      workflowKey: request.workflowKey,
      name: request.name,
      compatProviderId: request.compatProviderId,
      status: 'active',
      createdAt: ids.timestamp,
      updatedAt: ids.timestamp,
    };
    const version: WorkflowTemplateVersionRecord = {
      templateVersionId: ids.templateVersionId,
      workflowId: ids.workflowId,
      workflowKey: request.workflowKey,
      version: 1,
      status: 'published',
      spec: request.spec,
      createdAt: ids.timestamp,
    };
    this.templatesById.set(workflow.workflowId, workflow);
    this.workflowKeyToTemplateId.set(workflow.workflowKey, workflow.workflowId);
    this.versionsById.set(version.templateVersionId, version);
    this.versionsByWorkflowKey.set(workflow.workflowKey, [version]);
    return { workflow, version };
  }

  listWorkflows(): WorkflowTemplateRecord[] {
    return [...this.templatesById.values()].sort((a, b) => a.workflowKey.localeCompare(b.workflowKey));
  }

  getWorkflow(workflowId: string): { workflow: WorkflowTemplateRecord; versions: WorkflowTemplateVersionRecord[] } | undefined {
    const workflow = this.templatesById.get(workflowId);
    if (!workflow) return undefined;
    return {
      workflow,
      versions: this.versionsByWorkflowKey.get(workflow.workflowKey) || [],
    };
  }

  getWorkflowByKey(workflowKey: string): WorkflowTemplateRecord | undefined {
    const workflowId = this.workflowKeyToTemplateId.get(workflowKey);
    return workflowId ? this.templatesById.get(workflowId) : undefined;
  }

  getVersion(templateVersionId: string): WorkflowTemplateVersionRecord | undefined {
    return this.versionsById.get(templateVersionId);
  }

  getLatestVersion(workflowKey: string): WorkflowTemplateVersionRecord | undefined {
    const versions = this.versionsByWorkflowKey.get(workflowKey) || [];
    return versions[versions.length - 1];
  }
}
