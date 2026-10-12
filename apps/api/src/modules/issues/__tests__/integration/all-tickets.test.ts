import { describe, it, expect, beforeEach } from 'bun:test';
import { authedApi, type Api } from '#tests/helpers/app';
import { signUpTestUser } from '#tests/helpers/auth';
import { resetDb } from '#tests/helpers/db';

// GET /issues: the cross-project list behind the global All tickets board. It
// returns the active issues of every project the session user is a member of —
// and only those — each row carrying its project (key/name/id) and the state
// group of its column. Read-only by design: there is no move or edit here, the
// per-project routes stay the write path.

interface Project {
  columnByState: Record<string, number>;
  issueIds: number[];
}

async function createProjectWithIssues(
  client: Api,
  key: string,
  titles: { title: string; stateType?: string }[],
): Promise<Project> {
  await client.projects.post({ key, name: `${key} name` });
  const view = await client.projects({ projectKey: key }).get();
  const columns = view.data!.columns;
  const columnByState: Record<string, number> = {};
  for (const c of columns) columnByState[c.stateType] = c.id;
  const issueIds: number[] = [];
  for (const { title, stateType } of titles) {
    const res = await client
      .projects({ projectKey: key })
      .issues.post({ title, columnId: columnByState[stateType ?? 'backlog'] });
    expect(res.status).toBe(201);
    issueIds.push(res.data!.id);
  }
  return { columnByState, issueIds };
}

describe('all tickets (GET /issues)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('returns the issues of every project the user is a member of', async () => {
    const owner = await signUpTestUser();
    const asOwner = authedApi(owner.cookie);
    await createProjectWithIssues(asOwner, 'MKT', [
      { title: 'Marketing task' },
      { title: 'Launch page' },
    ]);
    await createProjectWithIssues(asOwner, 'OPS', [{ title: 'Ops task' }]);

    const res = await asOwner.issues.get();
    expect(res.status).toBe(200);
    const titles = res.data!.issues.map((i) => i.title).sort();
    expect(titles).toEqual(['Launch page', 'Marketing task', 'Ops task']);
  });

  it('carries project, column and expanded references on each row', async () => {
    const owner = await signUpTestUser();
    const asOwner = authedApi(owner.cookie);
    await createProjectWithIssues(asOwner, 'MKT', [{ title: 'Assigned', stateType: 'started' }]);

    const res = await asOwner.issues.get();
    const hit = res.data!.issues.find((i) => i.title === 'Assigned')!;
    expect(hit).toMatchObject({
      projectId: hit.projectId,
      projectKey: 'MKT',
      projectName: 'MKT name',
      identifier: `MKT-${hit.sequenceNumber}`,
      stateType: 'started',
      columnName: hit.columnName,
      labels: [],
    });
    expect(hit.projectKey.length).toBeGreaterThan(0);
    expect(hit.columnName.length).toBeGreaterThan(0);
  });

  it('excludes projects in teams the user cannot see', async () => {
    // The first sign-up owns the instance workspace and sees every team; the two
    // users below are ordinary members of their own teams.
    await signUpTestUser();
    const alice = await signUpTestUser();
    const asAlice = authedApi(alice.cookie);
    await createProjectWithIssues(asAlice, 'MKT', [{ title: 'Mine' }]);
    const bob = await signUpTestUser();
    const asBob = authedApi(bob.cookie);
    await createProjectWithIssues(asBob, 'SEC', [{ title: 'Secret plan' }]);

    const res = await asAlice.issues.get();
    expect(res.data!.issues.map((i) => i.title)).toEqual(['Mine']);

    // Bob sees his own project, not Alice's.
    const other = await asBob.issues.get();
    expect(other.data!.issues.map((i) => i.title)).toEqual(['Secret plan']);
  });

  it('covers exactly the projects the project list shows', async () => {
    // The workspace owner sees every team's projects in the picker, so All
    // tickets shows their issues too, and each row names its project by ref.
    const owner = await signUpTestUser();
    const asOwner = authedApi(owner.cookie);
    await createProjectWithIssues(asOwner, 'MKT', [{ title: 'Mine' }]);
    const member = await signUpTestUser();
    await createProjectWithIssues(authedApi(member.cookie), 'SEC', [{ title: 'Theirs' }]);

    const projects = (await asOwner.projects.get()).data!;
    const res = await asOwner.issues.get();
    expect(new Set(res.data!.issues.map((i) => i.projectRef))).toEqual(
      new Set(projects.map((p) => p.ref)),
    );
  });

  it('groups by the column state group, not the per-project column', async () => {
    const owner = await signUpTestUser();
    const asOwner = authedApi(owner.cookie);
    // The same state group in two projects, under different column names.
    await createProjectWithIssues(asOwner, 'MKT', [
      { title: 'A started', stateType: 'started' },
      { title: 'A backlog', stateType: 'backlog' },
    ]);
    await createProjectWithIssues(asOwner, 'OPS', [{ title: 'B started', stateType: 'started' }]);

    const started = await asOwner.issues.get({ query: { stateType: 'started' } });
    expect(started.status).toBe(200);
    expect(started.data!.issues.map((i) => i.title).sort()).toEqual(['A started', 'B started']);
    for (const hit of started.data!.issues) expect(hit.stateType).toBe('started');

    const backlog = await asOwner.issues.get({ query: { stateType: 'backlog' } });
    expect(backlog.data!.issues.map((i) => i.title)).toEqual(['A backlog']);
  });

  it('filters by a case-insensitive title substring', async () => {
    const owner = await signUpTestUser();
    const asOwner = authedApi(owner.cookie);
    await createProjectWithIssues(asOwner, 'MKT', [
      { title: 'Rewrite onboarding' },
      { title: 'Water the plants' },
    ]);

    const res = await asOwner.issues.get({ query: { query: 'ONBOARDING' } });
    expect(res.data!.issues.map((i) => i.title)).toEqual(['Rewrite onboarding']);
  });

  it('requires a session', async () => {
    const res = await authedApi('').issues.get();
    expect(res.status).toBe(401);
  });
});
