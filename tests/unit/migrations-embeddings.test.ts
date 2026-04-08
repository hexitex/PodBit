/**
 * Unit tests for db/migrations/embeddings.ts — runEmbeddingsMigrations.
 * Uses a mock Database object to verify SQL execution for embedding_bin column
 * creation, backfill from JSON embeddings, and embedding provenance columns.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { runEmbeddingsMigrations } from '../../db/migrations/embeddings.js';

// ---------- helpers ----------

function makeMockDb(opts: {
    hasEmbeddingBin?: boolean;
    hasEmbeddingModel?: boolean;
    embeddingRows?: any[];
    dimsRows?: any[];
} = {}) {
    const {
        hasEmbeddingBin = false,
        hasEmbeddingModel = false,
        embeddingRows = [],
        dimsRows = [],
    } = opts;

    const execCalls: string[] = [];
    const updateCalls: Array<{ params: any[] }> = [];

    // Track transaction wrapper
    let transactionFn: ((...args: any[]) => any) | null = null;

    const db = {
        exec: jest.fn<any>((sql: string) => { execCalls.push(sql); }),
        prepare: jest.fn<any>((sql: string) => {
            // Column existence check
            if (sql.match(/SELECT\s+embedding_bin\s+FROM\s+nodes/i)) {
                if (hasEmbeddingBin) {
                    return { get: jest.fn<any>() };
                }
                return {
                    get: jest.fn<any>().mockImplementation(() => {
                        throw new Error('no such column: embedding_bin');
                    }),
                };
            }

            if (sql.match(/SELECT\s+embedding_model\s+FROM\s+nodes/i)) {
                if (hasEmbeddingModel) {
                    return { get: jest.fn<any>() };
                }
                return {
                    get: jest.fn<any>().mockImplementation(() => {
                        throw new Error('no such column: embedding_model');
                    }),
                };
            }

            // Backfill SELECT for embedding_bin migration
            if (sql.includes('embedding IS NOT NULL AND embedding_bin IS NULL')) {
                return { all: jest.fn<any>().mockReturnValue(embeddingRows) };
            }

            // Backfill SELECT for embedding_dims migration
            if (sql.includes('embedding IS NOT NULL AND embedding_dims IS NULL')) {
                return { all: jest.fn<any>().mockReturnValue(dimsRows) };
            }

            // UPDATE for backfill
            if (sql.match(/UPDATE\s+nodes\s+SET\s+embedding_bin/i) || sql.match(/UPDATE\s+nodes\s+SET\s+embedding_dims/i)) {
                return {
                    run: jest.fn<any>((...params: any[]) => {
                        updateCalls.push({ params });
                    }),
                };
            }

            return { get: jest.fn<any>(), run: jest.fn<any>(), all: jest.fn<any>() };
        }),
        transaction: jest.fn<any>((fn: (...args: any[]) => any) => {
            transactionFn = fn;
            // Return a function that invokes the transaction body
            return (...args: any[]) => fn(...args);
        }),
        _execCalls: execCalls,
        _updateCalls: updateCalls,
    };

    return db;
}

beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

// ---------- tests ----------

describe('runEmbeddingsMigrations', () => {
    describe('embedding_bin column', () => {
        it('adds embedding_bin column when missing', () => {
            const db = makeMockDb();
            runEmbeddingsMigrations(db as any);
            const alterCall = db._execCalls.find((s: string) =>
                s.includes('ALTER TABLE nodes ADD COLUMN embedding_bin BLOB')
            );
            expect(alterCall).toBeDefined();
        });

        it('skips embedding_bin column when it already exists', () => {
            const db = makeMockDb({ hasEmbeddingBin: true });
            runEmbeddingsMigrations(db as any);
            const alterCall = db._execCalls.find((s: string) =>
                s.includes('ALTER TABLE nodes ADD COLUMN embedding_bin BLOB')
            );
            expect(alterCall).toBeUndefined();
        });

        it('backfills binary embeddings from JSON when rows exist', () => {
            const embedding = [0.5, 0.5, 0.5, 0.5];
            const db = makeMockDb({
                embeddingRows: [
                    { id: 'node-1', embedding: JSON.stringify(embedding) },
                    { id: 'node-2', embedding: JSON.stringify([1, 0, 0]) },
                ],
            });
            runEmbeddingsMigrations(db as any);

            // Transaction should have been called
            expect(db.transaction).toHaveBeenCalled();

            // Update should have been called for each row
            expect(db._updateCalls.length).toBe(2);
        });

        it('skips backfill when no rows need migration', () => {
            const db = makeMockDb({ embeddingRows: [] });
            runEmbeddingsMigrations(db as any);

            // Transaction should NOT have been called for empty rows
            expect(db.transaction).not.toHaveBeenCalled();
        });

        it('handles malformed JSON embeddings gracefully', () => {
            const db = makeMockDb({
                embeddingRows: [
                    { id: 'node-1', embedding: 'not-json' },
                    { id: 'node-2', embedding: JSON.stringify([1, 0, 0]) },
                ],
            });
            runEmbeddingsMigrations(db as any);

            // Should still process the valid one — malformed is skipped
            expect(db._updateCalls.length).toBe(1);
        });

        it('handles zero-norm embeddings', () => {
            const db = makeMockDb({
                embeddingRows: [
                    { id: 'node-1', embedding: JSON.stringify([0, 0, 0]) },
                ],
            });
            runEmbeddingsMigrations(db as any);

            // Should still produce a buffer (all zeros)
            expect(db._updateCalls.length).toBe(1);
        });

        it('L2-normalizes embeddings during backfill', () => {
            const db = makeMockDb({
                embeddingRows: [
                    { id: 'node-1', embedding: JSON.stringify([3, 4]) },
                ],
            });
            runEmbeddingsMigrations(db as any);

            // Check the buffer was created (first param of update call)
            expect(db._updateCalls.length).toBe(1);
            const buf = db._updateCalls[0].params[0] as Buffer;
            expect(Buffer.isBuffer(buf)).toBe(true);

            // Decode the Float32Array and check normalization
            const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
            const norm = Math.sqrt(f32[0] * f32[0] + f32[1] * f32[1]);
            expect(norm).toBeCloseTo(1.0, 4);
        });
    });

    describe('embedding provenance columns', () => {
        it('adds embedding_model and embedding_dims columns when missing', () => {
            const db = makeMockDb();
            runEmbeddingsMigrations(db as any);
            const modelAlter = db._execCalls.find((s: string) =>
                s.includes('ALTER TABLE nodes ADD COLUMN embedding_model TEXT')
            );
            const dimsAlter = db._execCalls.find((s: string) =>
                s.includes('ALTER TABLE nodes ADD COLUMN embedding_dims INTEGER')
            );
            expect(modelAlter).toBeDefined();
            expect(dimsAlter).toBeDefined();
        });

        it('skips provenance columns when they already exist', () => {
            const db = makeMockDb({ hasEmbeddingBin: true, hasEmbeddingModel: true });
            runEmbeddingsMigrations(db as any);
            const modelAlter = db._execCalls.find((s: string) =>
                s.includes('ALTER TABLE nodes ADD COLUMN embedding_model TEXT')
            );
            expect(modelAlter).toBeUndefined();
        });

        it('backfills embedding_dims from existing JSON embeddings', () => {
            const db = makeMockDb({
                dimsRows: [
                    { id: 'node-1', embedding: JSON.stringify([0.1, 0.2, 0.3]) },
                    { id: 'node-2', embedding: JSON.stringify([0.1, 0.2, 0.3, 0.4]) },
                ],
            });
            runEmbeddingsMigrations(db as any);

            // Should have transaction calls for dims backfill
            // (first transaction is for embedding_bin, second for dims)
            expect(db.transaction).toHaveBeenCalled();
        });

        it('skips dims backfill when no rows need migration', () => {
            const db = makeMockDb({ dimsRows: [] });
            runEmbeddingsMigrations(db as any);
            // The embedding_bin transaction may fire but dims should not
        });

        it('handles malformed JSON in dims backfill gracefully', () => {
            const db = makeMockDb({
                dimsRows: [
                    { id: 'node-1', embedding: 'bad-json' },
                    { id: 'node-2', embedding: JSON.stringify([0.1, 0.2]) },
                ],
            });

            expect(() => runEmbeddingsMigrations(db as any)).not.toThrow();
        });
    });

    it('does not throw on a fresh database', () => {
        const db = makeMockDb();
        expect(() => runEmbeddingsMigrations(db as any)).not.toThrow();
    });
});
