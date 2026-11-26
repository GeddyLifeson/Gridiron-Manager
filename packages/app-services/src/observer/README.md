# Observer filter and read-model core (G-27)

Bible: P1.1.4, P1.3.2, P2.2.1, K9.1.1, K9.3.1, K9.3.2, Q1.4.1, Q1.4.2.

## What it does

- `filterValue(schema, value, observer)` returns the part of any contract value one observer may read. Public fields are kept, `own_team` and `observer_estimate` fields go to the owner of the row, truth fields go to nobody. It is a whitelist: unknown keys, unclassed fields and shapes it cannot read are dropped. No option releases truth.
- `ObservedWorld` is a world's tables as one observer may read them. Read-model builders and AI view code receive this object and never the save tables.
- `ReadModelRegistry`, `buildReadModel` and `ReadModelHub` are the read-model contract: key, version, permission, data, meta; subscriptions; a model is rebuilt only when a table its builder read was touched, and sent only when its content changed.
- `audit/` holds the checks: schema scan, planted-value search, rank test, paired worlds (`auditHidden`, `auditVisible`), the read-model crawler, and the static audit of AI and interface source.

## Writing a read model (screen packages)

```ts
export const depthChart: ReadModelSpec<{ teamId: number }, DepthChartData> = {
  name: 'depthChart',
  data: DepthChartData,            // zod schema; every field classed, none truth
  taskIds: ['depth_chart.set'],    // S3 tasks that decide Yours / Assigned / Suggest / Read
  build: (world, { teamId }) => ({ data: { /* from world.table(...) only */ } }),
};
```

Add the model to the crawler test of your package (`crawlReadModels`) with a parameter set. A builder that needs a field the filter withholds needs an owner rule (`registerOwnerRule`) or a contract change, never a way around the filter.

## Writing an AI decision (coach-ai, front-office)

A decision function takes a view (an `ObservedWorld`, or data built from one) and no world state. Test it with `auditHidden({ source, observer, run })`, where `run` goes from the raw world to the decisions: zero divergences is the pass mark. Add `auditVisible` facts for each kind of visible information the decision uses.

## Owner rules

`ownership.ts` says who owns the private fields of each shape. A shape with no rule releases no private field. Rules attach to schema objects, so they apply wherever the shape is nested.

## Named assumptions and open points

- `ASSUMED_DEFAULT_SEAT_POLICY` (which scopes a seat opens) is an assumption until the S3 packages supply a policy from `JobRecord.dutyIds`.
- Information gained by a logged violation (K9.1.1 edge case) is not modelled yet: it needs the G-28 event types.
- Film through the film filter (K9.1.1 item 3) and in-game sideline observation (item 4) are bridges other packages register with `registerBridge`.
- Q1.4.1 check 3 (decision rates) and the 500-game swap run need the coach AI (G-58, G-59); the harness here is what they run.
- The full-game and full-week message search of Q1.4.2 needs the engine and the world loop; `findSentinels` takes any recorded message list.
- Requests to the integrator are listed in the pull request (CR-G27-1 to CR-G27-4).
