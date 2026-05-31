import { Module } from '@nestjs/common';
import { MemoryStoreService } from './memory-store.service';
import { MemoryWriterService } from './memory-writer.service';
import { MemoryReaderService } from './memory-reader.service';

@Module({
  providers: [MemoryStoreService, MemoryWriterService, MemoryReaderService],
  exports: [MemoryStoreService, MemoryWriterService, MemoryReaderService],
})
export class MemoryModule {}
