import { Module, Provider } from '@nestjs/common';
import { MemoryStoreService } from './memory-store.service';
import { SqliteMemoryStoreService } from './sqlite-memory-store.service';
import { MemoryWriterService } from './memory-writer.service';
import { MemoryReaderService } from './memory-reader.service';
import { IMemoryStore, MEMORY_STORE } from './memory.types';

/**
 * Provider that resolves IMemoryStore based on MEMORY_DRIVER env var.
 *
 *   MEMORY_DRIVER=sqlite   → SqliteMemoryStoreService (persistent, SQLite)
 *   MEMORY_DRIVER=memory   → MemoryStoreService (in-memory Map, default)
 *   unset / any other      → MemoryStoreService (backward compatible)
 */
const memoryStoreProvider: Provider<IMemoryStore> = {
  provide: MEMORY_STORE,
  useFactory: () => {
    if (process.env.MEMORY_DRIVER === 'sqlite') {
      return new SqliteMemoryStoreService();
    }
    return new MemoryStoreService();
  },
};

@Module({
  providers: [
    memoryStoreProvider,
    MemoryStoreService,
    MemoryWriterService,
    MemoryReaderService,
  ],
  exports: [MEMORY_STORE, MemoryStoreService, MemoryWriterService, MemoryReaderService],
})
export class MemoryModule {}
