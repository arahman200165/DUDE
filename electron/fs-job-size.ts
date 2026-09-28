import { sanitizeWalkOptions } from '../src/shared-logic/fs/walk-filter';
import { SizeAggregator } from '../src/shared-logic/fs/size-aggregate';
import { registerFsJob } from './fs-jobs';
import { paramsOf } from './fs-job-walk';
import { walkTree } from './fs-walk';

/**
 * Folder Size Analyzer (Phase 29 item 1, Milestone 525): one streaming walk, aggregated in the fs
 * utility process so a whole-drive scan sends the renderer a pruned folder tree plus top-N lists,
 * never millions of entries.
 */
registerFsJob('folder-size', async (context) => {
  const params = paramsOf(context);
  const options = sanitizeWalkOptions(params['options']);
  const aggregator = new SizeAggregator();
  let scanned = 0;
  let bytes = 0;
  const stats = await walkTree(context.root, options, {
    signal: context.signal,
    includeDirs: true,
    onEntry: (entry) => {
      aggregator.add(entry);
      scanned++;
      bytes += entry.size;
      context.progress({ phase: 'Scanning', scanned, bytes, current: entry.path });
    },
    onIssue: (issue) => context.issue(issue),
  }, options.skipHidden ? context.attributes : null);
  context.progress({ phase: 'Summarizing', scanned, bytes });
  return { report: aggregator.finish(), stats, scannedAt: new Date().toISOString() };
});
