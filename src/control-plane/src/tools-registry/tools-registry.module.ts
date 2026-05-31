import { Module } from '@nestjs/common';
import { ToolsRegistryService } from './tools-registry.service';

@Module({
  providers: [ToolsRegistryService],
  exports: [ToolsRegistryService],
})
export class ToolsRegistryModule {}
