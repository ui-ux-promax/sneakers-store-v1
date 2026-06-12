'use client';

import * as React from 'react';
import { ImageUploader } from './image-uploader';
import type { UploadedImage } from '@/lib/cloudinary/types';

/** Temporary harness for Phase 3.1 manual verification. Replaced by real forms in 3.2/3.3. */
export function UploaderDemo() {
  const [images, setImages] = React.useState<UploadedImage[]>([]);
  return (
    <div className="space-y-4">
      <ImageUploader value={images} onChange={setImages} folder="stride/uploads" max={8} />
      <pre className="bg-admin-surface border border-admin-outline-variant rounded-xl p-4 text-xs text-admin-on-surface-variant overflow-auto">
        {JSON.stringify(images, null, 2)}
      </pre>
    </div>
  );
}
