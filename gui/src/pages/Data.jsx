import PartitionManagement from './config/PartitionManagement';
import DatabaseManagement from './config/DatabaseManagement';
import NumberVariables from './config/NumberVariables';
import JournalTimeline from './config/JournalTimeline';

/** Data page: partition management, number variables, journal timeline, and database management. */
export default function Data() {
  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Data</h1>
      </div>

      <div className="space-y-6">
        <PartitionManagement />
        <NumberVariables />
        <JournalTimeline />
        <DatabaseManagement />
      </div>
    </div>
  );
}
