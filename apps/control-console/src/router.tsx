import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
} from '@tanstack/react-router';
import { AppShell, EmptyPanel, PanelCard } from './components';
import { useControlConsoleEnvironment } from './query';
import { AgentsWorkspace } from './pages/agents';
import { ApprovalsWorkspace } from './pages/approvals';
import { ArtifactWorkspace } from './pages/artifacts';
import { CapabilitiesWorkspace } from './pages/capabilities';
import { DraftsWorkspace } from './pages/drafts';
import { GovernanceWorkspace } from './pages/governance';
import { RunsWorkspace } from './pages/runs';
import { StudioWorkspace } from './pages/studio';
import { TemplatesWorkspace } from './pages/templates';

function RootLayout() {
  const { identity, streamMode } = useControlConsoleEnvironment();
  return (
    <AppShell streamMode={streamMode} sessionId={identity.sessionId} userId={identity.userId}>
      <Outlet />
    </AppShell>
  );
}

function HomeRoute() {
  return (
    <PanelCard title="Console Areas" description="Use the primary operator domains below to run the pure-v1 control surface.">
      <div data-ui="grid" data-gap="4" className="console-card-grid">
        <div data-ui="card" data-padding="md" data-variant="outlined" data-elevation="none">
          <span data-ui="text" data-variant="h3" data-tone="primary">/templates</span>
          <p data-ui="text" data-variant="body" data-tone="secondary">Published templates, versions, and debug-only direct starts.</p>
        </div>
        <div data-ui="card" data-padding="md" data-variant="outlined" data-elevation="none">
          <span data-ui="text" data-variant="h3" data-tone="primary">/studio</span>
          <p data-ui="text" data-variant="body" data-tone="secondary">Spec-first draft authoring, validation, publish, and helper input.</p>
        </div>
        <div data-ui="card" data-padding="md" data-variant="outlined" data-elevation="none">
          <span data-ui="text" data-variant="h3" data-tone="primary">/agents</span>
          <p data-ui="text" data-variant="body" data-tone="secondary">Agent lifecycle, trigger bindings, action bindings, and production starts.</p>
        </div>
        <div data-ui="card" data-padding="md" data-variant="outlined" data-elevation="none">
          <span data-ui="text" data-variant="h3" data-tone="primary">/capabilities</span>
          <p data-ui="text" data-variant="body" data-tone="secondary">Connector, event subscription, and bridge management.</p>
        </div>
        <div data-ui="card" data-padding="md" data-variant="outlined" data-elevation="none">
          <span data-ui="text" data-variant="h3" data-tone="primary">/governance</span>
          <p data-ui="text" data-variant="body" data-tone="secondary">Policy, secret, scope, and change-request operations.</p>
        </div>
        <div data-ui="card" data-padding="md" data-variant="outlined" data-elevation="none">
          <span data-ui="text" data-variant="h3" data-tone="primary">/runs</span>
          <p data-ui="text" data-variant="body" data-tone="secondary">Runboard, approval investigation, and artifact deep links.</p>
        </div>
      </div>
    </PanelCard>
  );
}

function NotFoundRoute() {
  return <EmptyPanel title="Route not found" body="Use one of the primary console routes to continue." />;
}

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundRoute,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeRoute,
});

const templatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/templates',
  component: () => <TemplatesWorkspace />,
});

const templateDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/templates/$workflowId',
  component: () => {
    const { workflowId } = templateDetailRoute.useParams();
    return <TemplatesWorkspace selectedWorkflowId={workflowId} />;
  },
});

const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents',
  component: () => <AgentsWorkspace />,
});

const agentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents/$agentId',
  component: () => {
    const { agentId } = agentDetailRoute.useParams();
    return <AgentsWorkspace selectedAgentId={agentId} />;
  },
});

const agentFromTemplateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents/from-template/$templateVersionRef',
  component: () => {
    const { templateVersionRef } = agentFromTemplateRoute.useParams();
    return <AgentsWorkspace templateVersionRef={templateVersionRef} />;
  },
});

const capabilitiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/capabilities',
  component: () => <CapabilitiesWorkspace />,
});

const governanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/governance',
  component: () => <GovernanceWorkspace />,
});

const governanceRequestDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/governance/requests/$requestId',
  component: () => {
    const { requestId } = governanceRequestDetailRoute.useParams();
    return <GovernanceWorkspace selectedRequestId={requestId} />;
  },
});

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/runs',
  component: () => <RunsWorkspace />,
});

const runDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/runs/$runId',
  component: () => {
    const { runId } = runDetailRoute.useParams();
    return <RunsWorkspace selectedRunId={runId} />;
  },
});

const approvalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/approvals',
  component: () => <ApprovalsWorkspace />,
});

const approvalDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/approvals/$approvalRequestId',
  component: () => {
    const { approvalRequestId } = approvalDetailRoute.useParams();
    return <ApprovalsWorkspace selectedApprovalRequestId={approvalRequestId} />;
  },
});

const draftsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/drafts',
  component: () => <DraftsWorkspace />,
});

const draftDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/drafts/$draftId',
  component: () => {
    const { draftId } = draftDetailRoute.useParams();
    return <DraftsWorkspace selectedDraftId={draftId} />;
  },
});

const studioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/studio',
  component: () => <StudioWorkspace />,
});

const studioDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/studio/$draftId',
  component: () => {
    const { draftId } = studioDetailRoute.useParams();
    return <StudioWorkspace selectedDraftId={draftId} />;
  },
});

const artifactsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/artifacts',
  component: () => <ArtifactWorkspace />,
});

const artifactDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/artifacts/$artifactId',
  component: () => {
    const { artifactId } = artifactDetailRoute.useParams();
    return <ArtifactWorkspace artifactId={artifactId} />;
  },
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  templatesRoute,
  templateDetailRoute,
  agentsRoute,
  agentDetailRoute,
  agentFromTemplateRoute,
  capabilitiesRoute,
  governanceRoute,
  governanceRequestDetailRoute,
  runsRoute,
  runDetailRoute,
  approvalsRoute,
  approvalDetailRoute,
  draftsRoute,
  draftDetailRoute,
  studioRoute,
  studioDetailRoute,
  artifactsRoute,
  artifactDetailRoute,
]);

export function buildRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    defaultPreload: 'intent',
  });
}

export function buildMemoryRouter(initialEntries: string[]) {
  return buildRouter(createMemoryHistory({ initialEntries }));
}

export const router = buildRouter();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
