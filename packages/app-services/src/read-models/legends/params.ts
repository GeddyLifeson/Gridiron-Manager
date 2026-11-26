// Tuning constants of the legends read models (G-84, bible X3). Every value is a starting value an X3
// leaf states, or a named assumption. Real-world numbers (record minimums) live in facts.json.
import type { ParamFile } from '@gm/schema';

export const PARAMS: ParamFile = {
  "module": "app-services.legends",
  "version": "g84.1",
  "params": [
    {
      "name": "legends.chronicle.week_cap",
      "value": 12,
      "min": 1,
      "max": 100,
      "unit": "count",
      "belongsTo": "X3.2.1",
      "basis": "bible",
      "leaf": "X3.2.1",
      "constrainedBy": "test legends/chronicle: entries shown per week per level before \"More this week\"",
      "status": "starting"
    },
    {
      "name": "legends.chronicle.offseason_cap",
      "value": 40,
      "min": 1,
      "max": 500,
      "unit": "count",
      "belongsTo": "X3.2.1",
      "basis": "bible",
      "leaf": "X3.2.1",
      "constrainedBy": "test legends/chronicle: offseason entries per level",
      "status": "starting"
    },
    {
      "name": "legends.era.block_seasons",
      "value": 10,
      "min": 1,
      "max": 50,
      "unit": "count",
      "belongsTo": "X3.2.2",
      "basis": "bible",
      "leaf": "X3.2.2",
      "constrainedBy": "test legends/era: fixed blocks from the first season",
      "status": "starting"
    },
    {
      "name": "legends.era.dynasty_titles",
      "value": 3,
      "min": 1,
      "max": 10,
      "unit": "count",
      "belongsTo": "X3.2.2",
      "basis": "bible",
      "leaf": "X3.2.2",
      "constrainedBy": "test legends/era: titles in a block for the dynasty flag",
      "status": "starting"
    },
    {
      "name": "legends.era.dynasty_conference_titles",
      "value": 5,
      "min": 1,
      "max": 10,
      "unit": "count",
      "belongsTo": "X3.2.2",
      "basis": "bible",
      "leaf": "X3.2.2",
      "constrainedBy": "test legends/era: conference titles in a block for the dynasty flag",
      "status": "starting"
    },
    {
      "name": "legends.era.top_events",
      "value": 5,
      "min": 1,
      "max": 50,
      "unit": "count",
      "belongsTo": "X3.2.2",
      "basis": "assumption",
      "leaf": "X3.2.2",
      "constrainedBy": "test legends/era: top X4 events shown per block",
      "status": "starting"
    },
    {
      "name": "legends.tree.min_seasons",
      "value": 1,
      "min": 1,
      "max": 10,
      "unit": "count",
      "belongsTo": "X3.3.1",
      "basis": "bible",
      "leaf": "X3.3.1",
      "constrainedBy": "test legends/trees: full seasons on a staff before an assistant appears",
      "status": "starting"
    },
    {
      "name": "legends.tree.default_depth",
      "value": 2,
      "min": 1,
      "max": 10,
      "unit": "count",
      "belongsTo": "X3.3.1",
      "basis": "bible",
      "leaf": "X3.3.1",
      "constrainedBy": "test legends/trees: levels expanded by default",
      "status": "starting"
    },
    {
      "name": "legends.rivalry.top_games",
      "value": 5,
      "min": 1,
      "max": 50,
      "unit": "count",
      "belongsTo": "X3.3.2",
      "basis": "bible",
      "leaf": "X3.3.2",
      "constrainedBy": "test legends/rivalry: top games by notability",
      "status": "starting"
    },
    {
      "name": "legends.records.list_size",
      "value": 10,
      "min": 1,
      "max": 100,
      "unit": "count",
      "belongsTo": "X3.4.1",
      "basis": "bible",
      "leaf": "X3.4.1",
      "constrainedBy": "test legends/records: entries per list, ties share a rank",
      "status": "starting"
    },
    {
      "name": "legends.search.fuzzy_min_letters",
      "value": 5,
      "min": 1,
      "max": 20,
      "unit": "count",
      "belongsTo": "X3.5.1",
      "basis": "bible",
      "leaf": "X3.5.1",
      "constrainedBy": "test legends/search: token length that allows a one-edit match",
      "status": "starting"
    },
    {
      "name": "legends.search.fuzzy_edits",
      "value": 1,
      "min": 0,
      "max": 3,
      "unit": "count",
      "belongsTo": "X3.5.1",
      "basis": "bible",
      "leaf": "X3.5.1",
      "constrainedBy": "test legends/search: edits allowed in a fuzzy match",
      "status": "starting"
    },
    {
      "name": "legends.search.page_size",
      "value": 25,
      "min": 1,
      "max": 500,
      "unit": "count",
      "belongsTo": "X3.5.1",
      "basis": "assumption",
      "leaf": "X3.5.1",
      "constrainedBy": "test legends/search: rows on the first result page",
      "status": "starting"
    },
    {
      "name": "legends.nav.history",
      "value": 50,
      "min": 1,
      "max": 1000,
      "unit": "count",
      "belongsTo": "X3.1.1",
      "basis": "bible",
      "leaf": "X3.1.1",
      "constrainedBy": "test commands/legends: back and forward history length",
      "status": "starting"
    }
  ]
};

export function param(name: string): number {
  const p = PARAMS.params.find((x) => x.name === name);
  if (!p) throw new Error(`legends: unknown parameter ${name}`);
  return p.value;
}
