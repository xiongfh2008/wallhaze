import type {ValidatedGeneration} from '../modules/generation/generation.validators.js';
import type {FalProvider} from '../modules/generation/fal.provider.js';
import {FAL_ENDPOINT,FAL_EDIT_ENDPOINT} from '../modules/generation/fal.endpoints.js';
import {downloadImage,type StoredImage} from './storage.js';
import {createMockPng} from './mock-image.js';
export interface JobProvider {generate(input:ValidatedGeneration,signal:AbortSignal):Promise<StoredImage>}
export class FalJobProvider implements JobProvider{
 constructor(private provider:FalProvider,private fetcher:typeof fetch=fetch){}
 async generate(input:ValidatedGeneration,signal:AbortSignal){const payload:Record<string,unknown>={prompt:input.finalPrompt,image_size:input.imageSize,num_images:1,enable_safety_checker:true,output_format:'png'};if(input.refDataUri)payload.image_urls=[input.refDataUri];const result=await this.provider.generate({endpoint:input.refDataUri?FAL_EDIT_ENDPOINT:FAL_ENDPOINT,payload,signal});return downloadImage(result.imageUrl,this.fetcher);}
}
export class MockJobProvider implements JobProvider {
  async generate(_input: ValidatedGeneration, signal: AbortSignal) {
    signal.throwIfAborted();
    return { bytes: createMockPng(), mime: 'image/png' };
  }
}
