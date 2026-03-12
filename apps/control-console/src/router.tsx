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
import { ApprovalsWorkspace } from './pages/approvals';
import { DraftsWorkspace } from './pages/drafts';
import { RunsWorkspace } from './pages/runs';
import { StudioWorkspace } from './pages/studio';

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
    <PanelCard title="Console Areas" description="Use the primary route groups below to operate the B4 control console.">
      <div data-ui="grid" data-gap="4" className="console-card-grid">
        <div data-ui="card" data-padding="md" data-variant="outlined" data-elevation="none">
          <span data-ui="text" data-variant="h3" data-tone="primary">/runs</span>
          <p data-ui="text" data-variant="body" data-tone="secondary">Recent-first runboard with detail inspection.</p>
        </div>
        <div data-ui="card" data-padding="md" data-variant="outlined" data-elevation="none">
          <span data-ui="text" data-variant="h3" data-tone="primary">/approvals</span>
          <p data-ui="text" data-variant="body" data-tone="secondary">Approval queue, evidence, and decision actions.</p>
        </div>
        <div data-ui="card" data-padding="md" data-variant="outlined" data-elevation="none">
          <span data-ui="text" data-variant="h3" data-tone="primary">/drafts</span>
          <p data-ui="text" data-variant="body" data-tone="secondary">Draft lineage, publishability, and compare.</p>
        </div>
        <div data-ui="card" data-padding="md" data-variant="outlined" data-elevation="none">
          <span data-ui="text" data-variant="h3" data-tone="primary">/studio</span>
          <p data-ui="text" data-variant="body" data-tone="secondary">Spec editor, intake, validation, publish, DAG preview.</p>
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

const routeTree = rootRoute.addChildren([
  homeRoute,
  runsRoute,
  runDetailRoute,
  approvalsRoute,
  approvalDetailRoute,
  draftsRoute,
  draftDetailRoute,
  studioRoute,
  studioDetailRoute,
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
