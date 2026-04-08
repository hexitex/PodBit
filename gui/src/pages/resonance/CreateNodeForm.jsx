import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { resonance } from '../../lib/api';
import TagSelector from '../../components/TagSelector';

/** Form to create a new node (content, type, domain) and submit via resonance API. */
export default function CreateNodeForm({ onClose, domains }) {
  const [content, setContent] = useState('');
  const [nodeType, setNodeType] = useState('seed');
  const [domain, setDomain] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: resonance.createNode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resonance'] });
      onClose();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate({ content, nodeType, domain: domain || undefined, contributor: 'gui:user' });
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg dark:shadow-gray-950/50 p-6">
      <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Create Node</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            placeholder="Enter node content..."
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Type</label>
            <select
              value={nodeType}
              onChange={(e) => setNodeType(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="seed">Seed</option>
              <option value="synthesis">Synthesis</option>
              <option value="voiced">Voiced</option>
              <option value="breakthrough">Breakthrough</option>
              <option value="possible">Possible</option>
              <option value="question">Question</option>
              <option value="raw">Raw</option>
            </select>
          </div>
          <div>
            <TagSelector
              items={domains}
              selected={domain}
              onChange={setDomain}
              label="Domain"
              placeholder="Search domains..."
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
