import { FolderOpen } from 'lucide-react';
import ProjectManagement from './config/ProjectManagement';

/** Projects page: load, save, create projects via ProjectManagement. */
export default function Projects() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <FolderOpen size={24} className="text-podbit-400" />
        <h1 className="text-2xl font-bold">Projects</h1>
      </div>
      <ProjectManagement />
    </div>
  );
}
