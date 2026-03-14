import {
  EmptyPanel,
  ErrorPanel,
  JsonPreview,
  LoadingPanel,
  PanelCard,
  SummaryGrid,
  formatDateTime,
} from '../components';
import { useArtifactDetailQuery } from '../query';

export function ArtifactWorkspace(props: { artifactId?: string }) {
  const detailQuery = useArtifactDetailQuery(props.artifactId, Boolean(props.artifactId));

  return (
    <div data-ui="stack" data-direction="col" data-gap="4" className="console-route-layout">
      <PanelCard
        title="Artifacts"
        description="Deep-link detail for artifact payloads and lineage without leaving the operator console."
      >
        {!props.artifactId ? (
          <EmptyPanel title="No artifact selected" body="Open an artifact detail route to inspect its payload and lineage." />
        ) : null}
        {props.artifactId && detailQuery.isLoading ? <LoadingPanel label="Loading artifact detail" /> : null}
        {detailQuery.error ? <ErrorPanel error={detailQuery.error} /> : null}
        {detailQuery.data ? (
          <div data-ui="stack" data-direction="col" data-gap="4">
            <SummaryGrid
              items={[
                { label: 'Artifact', value: detailQuery.data.artifact.artifactType, helper: detailQuery.data.artifact.artifactId },
                { label: 'State', value: detailQuery.data.artifact.state },
                { label: 'Run', value: detailQuery.data.artifact.runId },
                { label: 'Updated', value: formatDateTime(detailQuery.data.artifact.updatedAt) },
              ]}
            />
            <JsonPreview label="Typed payload" value={detailQuery.data.typedPayload} />
            <JsonPreview label="Lineage" value={detailQuery.data.lineage} />
          </div>
        ) : null}
      </PanelCard>
    </div>
  );
}
