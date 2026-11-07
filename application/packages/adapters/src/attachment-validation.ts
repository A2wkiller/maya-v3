import sharp from 'sharp';
export class InvalidAttachmentError extends Error { readonly code='INVALID_MEDIA'; constructor(){super('Invalid or corrupt image attachment');this.name='InvalidAttachmentError';} }
/** Decode raster bytes before accepting them as an image, bounded against decompression bombs. */
export async function validateImageAttachment(bytes:Uint8Array,mimeType:string):Promise<void>{
 if(!['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(mimeType))return;
 try{await sharp(bytes,{failOn:'warning',limitInputPixels:16777216}).raw().toBuffer();}catch{throw new InvalidAttachmentError();}
}
