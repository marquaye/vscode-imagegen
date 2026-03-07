import { describe, expect, it } from 'bun:test';
import { embedPromptMetadataInWebp, extractXmpMetadata, parsePromptMetadataXml } from './webpMetadata';

describe('embedPromptMetadataInWebp', () => {
  it('adds an XMP chunk and VP8X header for simple WebP files', () => {
    const input = createFakeWebp([
      {
        fourCC: 'VP8 ',
        data: Uint8Array.from([1, 2, 3, 4]),
      },
    ]);

    const output = embedPromptMetadataInWebp(input, {
      prompt: 'studio portrait & rim light <test>',
      filePrefix: 'imagegen',
      providerId: 'gpt-image-1.5',
      aspectRatio: '16:9',
      width: 640,
      height: 360,
      hasAlpha: false,
      generatedAt: '2026-03-07T12:00:00.000Z',
    });

    expect(readChunkOrder(output)).toEqual(['VP8X', 'VP8 ', 'XMP ']);

    const xmp = extractXmpMetadata(output);
    expect(xmp).toContain('<imagegen:providerId>gpt-image-1.5</imagegen:providerId>');
    expect(xmp).toContain('<imagegen:aspectRatio>16:9</imagegen:aspectRatio>');
    expect(xmp).toContain('studio portrait &amp; rim light &lt;test&gt;');
  });

  it('preserves existing VP8X flags and replaces prior XMP metadata', () => {
    const vp8xData = new Uint8Array(10);
    vp8xData[0] = 0x10;
    vp8xData[4] = 0x7f;
    vp8xData[7] = 0x7f;

    const input = createFakeWebp([
      {
        fourCC: 'VP8X',
        data: vp8xData,
      },
      {
        fourCC: 'VP8 ',
        data: Uint8Array.from([9, 8, 7, 6]),
      },
      {
        fourCC: 'XMP ',
        data: new TextEncoder().encode('old'),
      },
    ]);

    const output = embedPromptMetadataInWebp(input, {
      prompt: 'replacement prompt',
      filePrefix: 'imageedit',
      providerId: 'gemini-3.1-flash-image-preview',
      aspectRatio: '1:1',
      width: 128,
      height: 128,
      hasAlpha: true,
      generatedAt: '2026-03-07T12:00:00.000Z',
    });

    expect(readChunkOrder(output)).toEqual(['VP8X', 'VP8 ', 'XMP ']);

    const vp8x = readChunkData(output, 'VP8X');
    expect(vp8x?.[0]).toBe(0x14);

    const xmp = extractXmpMetadata(output);
    expect(xmp).toContain('<imagegen:operation>imageedit</imagegen:operation>');
    expect(xmp).not.toContain('old');
  });

  it('parses structured values back out of the XMP payload', () => {
    const input = createFakeWebp([
      {
        fourCC: 'VP8 ',
        data: Uint8Array.from([1, 2, 3, 4]),
      },
    ]);

    const output = embedPromptMetadataInWebp(input, {
      prompt: 'cinematic skyline & clouds',
      filePrefix: 'imagegen',
      providerId: 'flux-2-max',
      aspectRatio: '21:9',
      width: 2100,
      height: 900,
      hasAlpha: false,
      generatedAt: '2026-03-07T15:45:00.000Z',
    });

    const parsed = parsePromptMetadataXml(extractXmpMetadata(output)!);
    expect(parsed.prompt).toBe('cinematic skyline & clouds');
    expect(parsed.providerId).toBe('flux-2-max');
    expect(parsed.aspectRatio).toBe('21:9');
    expect(parsed.operation).toBe('imagegen');
    expect(parsed.createdAt).toBe('2026-03-07T15:45:00.000Z');
    expect(parsed.creatorTool).toBe('ImageGen for VS Code');
  });
});

function createFakeWebp(chunks: Array<{ fourCC: string; data: Uint8Array }>): Uint8Array {
  const totalSize = 12 + chunks.reduce((sum, chunk) => {
    return sum + 8 + chunk.data.byteLength + (chunk.data.byteLength % 2);
  }, 0);

  const output = new Uint8Array(totalSize);
  writeAscii(output, 0, 'RIFF');
  writeUint32LE(output, 4, totalSize - 8);
  writeAscii(output, 8, 'WEBP');

  let offset = 12;
  for (const chunk of chunks) {
    writeAscii(output, offset, chunk.fourCC);
    writeUint32LE(output, offset + 4, chunk.data.byteLength);
    output.set(chunk.data, offset + 8);
    offset += 8 + chunk.data.byteLength;

    if (chunk.data.byteLength % 2 !== 0) {
      output[offset] = 0;
      offset += 1;
    }
  }

  return output;
}

function readChunkOrder(webp: Uint8Array): string[] {
  const order: string[] = [];
  let offset = 12;

  while (offset + 8 <= webp.byteLength) {
    const fourCC = readAscii(webp, offset, offset + 4);
    const chunkSize = readUint32LE(webp, offset + 4);
    order.push(fourCC);
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  return order;
}

function readChunkData(webp: Uint8Array, targetFourCC: string): Uint8Array | undefined {
  let offset = 12;

  while (offset + 8 <= webp.byteLength) {
    const fourCC = readAscii(webp, offset, offset + 4);
    const chunkSize = readUint32LE(webp, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkSize;

    if (fourCC === targetFourCC) {
      return webp.slice(dataStart, dataEnd);
    }

    offset = dataEnd + (chunkSize % 2);
  }

  return undefined;
}

function readAscii(buffer: Uint8Array, start: number, end: number): string {
  return Buffer.from(buffer.buffer, buffer.byteOffset + start, end - start).toString('ascii');
}

function writeAscii(buffer: Uint8Array, offset: number, value: string): void {
  Buffer.from(buffer.buffer, buffer.byteOffset + offset, value.length).write(value, 'ascii');
}

function readUint32LE(buffer: Uint8Array, offset: number): number {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return view.getUint32(offset, true);
}

function writeUint32LE(buffer: Uint8Array, offset: number, value: number): void {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  view.setUint32(offset, value, true);
}