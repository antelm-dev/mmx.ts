import { useEffect, useState, type ReactNode } from "react";
import { chakra } from "@chakra-ui/react";
import type { DockviewPanelApi } from "dockview-react";
import {
  Download,
  FilePlus2,
  FolderKanban,
  FolderOpen,
  FolderClock,
  History,
  LayoutTemplate,
} from "lucide-react";
import { focusPanel } from "../app/dock.js";
import type { ProjectOpenResult } from "../app/EditorController.js";
import { editor, projectSession, useProjectSession } from "../app/useEditor.js";
import {
  readRecentProjects,
  removeRecentProject,
  type RecentProject,
} from "../settings/recentProjects.js";
import {
  setShowStartPageAtLaunch,
  showStartPageAtLaunch,
} from "../settings/studioClientSettings.js";
import { ActionButton } from "../ui/editor/action-button.js";
import { Checkbox } from "../ui/editor/checkbox.js";
import { ListRow } from "../ui/editor/list-row.js";
import { Panel, PanelNote, PanelScroll } from "../ui/editor/panel.js";
import { SectionTitle } from "../ui/editor/section-title.js";

const Column = chakra("section", { base: { minW: "0" } });
const Muted = chakra("span", {
  base: { display: "block", color: "studio.muted", fontSize: "11px", truncate: true },
});

/** Start tab over the level: project commands, a blank level and the recent projects. */
export function StartPage({ api }: { api: DockviewPanelApi }) {
  // Re-renders (and so re-reads the recent list) when a project opens from the File menu.
  const projectOpen = useProjectSession().open;
  const [failed, setFailed] = useState<{ rootPath: string; message: string } | null>(null);
  const [showAtLaunch, setShowAtLaunch] = useState(showStartPageAtLaunch);
  const [deleting, setDeleting] = useState<string | null>(null);
  const recents = readRecentProjects();
  const unsaved = projectSession.leftoverWorkProjects();
  useEffect(() => void projectSession.listWorkProjects(), []);

  /** A command that went through leaves the start page for the level. */
  const done = (result: ProjectOpenResult): void => {
    if (!result.opened) return;
    api.close();
    focusPanel("viewport");
  };

  const openRecent = async (project: RecentProject): Promise<void> => {
    setFailed(null);
    const result = await editor.openRecentProject(project.rootPath);
    if (result.error) setFailed({ rootPath: project.rootPath, message: result.error });
    done(result);
  };

  return (
    <Panel>
      <PanelScroll>
        <chakra.div
          display="grid"
          gridTemplateColumns="repeat(auto-fit, minmax(260px, 1fr))"
          gap="6"
          maxW="760px"
          mx="auto"
          px="4"
          py="6"
        >
          <Column aria-label="Start">
            <SectionTitle>Start</SectionTitle>
            <Command
              icon={<FolderKanban size={15} />}
              onClick={async () => done(await editor.createProject())}
            >
              New project…
            </Command>
            <Command
              icon={<LayoutTemplate size={15} />}
              onClick={async () => done(await editor.createFromStarter())}
            >
              New from MMX starter…
            </Command>
            <Command
              icon={<FolderOpen size={15} />}
              onClick={async () => done(await editor.openProject())}
            >
              Open project…
            </Command>
            <Command
              icon={<Download size={15} />}
              onClick={async () => done(await editor.importFromSteam())}
            >
              Import from Steam…
            </Command>
            <Command
              icon={<FilePlus2 size={15} />}
              onClick={() => done({ opened: editor.newLevel() })}
            >
              {projectOpen ? "Add blank level" : "Blank level"}
            </Command>
            <chakra.div px="3.5" pt="4">
              <Checkbox
                label="Show at launch"
                checked={showAtLaunch}
                onCheckedChange={(show) => {
                  setShowStartPageAtLaunch(show);
                  setShowAtLaunch(show);
                }}
              />
            </chakra.div>
          </Column>

          <Column aria-label="Recent projects">
            {unsaved.length > 0 && (
              <chakra.div role="region" aria-label="Unsaved projects" mb="4">
                <SectionTitle>Unsaved</SectionTitle>
                {unsaved.map((work) => (
                  <chakra.div key={work.rootPath}>
                    <ListRow
                      title="Restore unsaved project"
                      onClick={async () => done(await editor.restoreWorkProject(work.rootPath))}
                    >
                      <History size={15} />
                      <chakra.span minW="0">
                        {work.name}
                        <Muted>Restore unsaved project · {formatDate(work.modifiedAt)}</Muted>
                      </chakra.span>
                    </ListRow>
                    {deleting === work.rootPath ? (
                      <chakra.div role="alert" mx="4" mb="2" fontSize="11px">
                        Delete this unsaved project? This cannot be undone.
                        <chakra.div display="flex" gap="2" mt="1.5">
                          <ActionButton flex="1" onClick={() => setDeleting(null)}>
                            Cancel
                          </ActionButton>
                          <ActionButton
                            flex="1"
                            color="studio.dangerFg"
                            onClick={async () => {
                              setDeleting(null);
                              await editor.deleteWorkProject(work.rootPath);
                            }}
                          >
                            Delete
                          </ActionButton>
                        </chakra.div>
                      </chakra.div>
                    ) : (
                      <ActionButton mx="4" mb="2" onClick={() => setDeleting(work.rootPath)}>
                        Delete…
                      </ActionButton>
                    )}
                  </chakra.div>
                ))}
              </chakra.div>
            )}
            <SectionTitle>Recent</SectionTitle>
            {recents.length === 0 && <PanelNote>No recent projects yet.</PanelNote>}
            {recents.map((project) => (
              <chakra.div key={project.rootPath}>
                <ListRow title={project.rootPath} onClick={() => void openRecent(project)}>
                  <FolderClock size={15} />
                  <chakra.span minW="0">
                    {project.name}
                    <Muted>{project.rootPath}</Muted>
                  </chakra.span>
                </ListRow>
                {failed?.rootPath === project.rootPath && (
                  <chakra.div role="alert" mx="4" mb="2" color="studio.dangerFg" fontSize="11px">
                    {failed.message}
                    <ActionButton
                      mt="1.5"
                      w="full"
                      onClick={() => {
                        removeRecentProject(project.rootPath);
                        setFailed(null);
                      }}
                    >
                      Remove from list
                    </ActionButton>
                  </chakra.div>
                )}
              </chakra.div>
            ))}
          </Column>
        </chakra.div>
      </PanelScroll>
    </Panel>
  );
}

const formatDate = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Command({
  icon,
  onClick,
  children,
}: Readonly<{ icon: ReactNode; onClick: () => unknown; children: ReactNode }>) {
  return (
    <ListRow onClick={() => void onClick()}>
      {icon}
      {children}
    </ListRow>
  );
}
