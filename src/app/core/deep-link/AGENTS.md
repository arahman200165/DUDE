# Deep-link routing

The main process forwards only a length-capped `dude://` string. This directory owns strict parsing, lookup through existing registries/stores, and renderer navigation. Opening a link never directly executes a pipeline or Quick Run; run variants navigate to their owning page, where the shared `PipelineConfirmationService` requires an explicit Run click. No specific tool id belongs here.
