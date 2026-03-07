import type { ProviderId } from '../providers';

const RIFF_HEADER_SIZE = 12;
const CHUNK_HEADER_SIZE = 8;
const VP8X_CHUNK_DATA_SIZE = 10;
const VP8X_FLAG_ALPHA = 0x10;
const VP8X_FLAG_XMP = 0x04;

interface WebpChunk {
  fourCC: string;
  data: Uint8Array;
}

export interface PromptMetadataPayload {
  prompt: string;
  filePrefix: 'imagegen' | 'imageedit';
  providerId: ProviderId;
  aspectRatio: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  generatedAt: string;
}

export interface ParsedPromptMetadata {
  prompt?: string;
  providerId?: string;
  aspectRatio?: string;
  operation?: string;
  createdAt?: string;
  creatorTool?: string;
  rawXmp: string;
}

export function embedPromptMetadataInWebp(
  webpBuffer: Uint8Array,
  metadata: PromptMetadataPayload,
): Uint8Array {
  assertValidCanvasSize(metadata.width, metadata.height);

  const chunks = parseWebpChunks(webpBuffer);
  const existingVp8x = chunks.find((chunk) => chunk.fourCC === 'VP8X');

  const vp8xChunk = existingVp8x
    ? updateVp8xChunk(existingVp8x, metadata.hasAlpha)
    : createVp8xChunk(metadata.width, metadata.height, metadata.hasAlpha);

  const iccpChunks = chunks.filter((chunk) => chunk.fourCC === 'ICCP');
  const animChunks = chunks.filter((chunk) => chunk.fourCC === 'ANIM');
  const imageChunks = chunks.filter((chunk) => isImageChunk(chunk.fourCC));
  const exifChunks = chunks.filter((chunk) => chunk.fourCC === 'EXIF');
  const otherChunks = chunks.filter((chunk) => !isReorderedChunk(chunk.fourCC));

  const orderedChunks: WebpChunk[] = [
    vp8xChunk,
    ...iccpChunks,
    ...animChunks,
    ...imageChunks,
    ...exifChunks,
    createChunk('XMP ', new TextEncoder().encode(buildPromptMetadataXml(metadata))),
    ...otherChunks,
  ];

  return serializeWebp(orderedChunks);
}

export function extractXmpMetadata(webpBuffer: Uint8Array): string | undefined {
  const chunks = parseWebpChunks(webpBuffer);
  const xmpChunk = chunks.find((chunk) => chunk.fourCC === 'XMP ');

  if (!xmpChunk) {
    return undefined;
  }

  return new TextDecoder().decode(xmpChunk.data);
}

export function parsePromptMetadataXml(xmp: string): ParsedPromptMetadata {
  return {
    prompt: firstDefined(
      readXmlTag(xmp, 'imagegen:prompt'),
      readAltDefaultValue(xmp),
    ),
    providerId: readXmlTag(xmp, 'imagegen:providerId'),
    aspectRatio: readXmlTag(xmp, 'imagegen:aspectRatio'),
    operation: readXmlTag(xmp, 'imagegen:operation'),
    createdAt: readXmlTag(xmp, 'xmp:CreateDate'),
    creatorTool: readXmlTag(xmp, 'xmp:CreatorTool'),
    rawXmp: xmp,
  };
}

function parseWebpChunks(webpBuffer: Uint8Array): WebpChunk[] {
  const buffer = asUint8Array(webpBuffer);

  if (buffer.byteLength < RIFF_HEADER_SIZE) {
    throw new Error('ImageGen: Invalid WebP file.');
  }

  if (readAscii(buffer, 0, 4) !== 'RIFF' || readAscii(buffer, 8, 12) !== 'WEBP') {
    throw new Error('ImageGen: Invalid WebP RIFF container.');
  }

  const chunks: WebpChunk[] = [];
  let offset = RIFF_HEADER_SIZE;

  while (offset + CHUNK_HEADER_SIZE <= buffer.byteLength) {
    const fourCC = readAscii(buffer, offset, offset + 4);
    const chunkSize = readUint32LE(buffer, offset + 4);
    const dataStart = offset + CHUNK_HEADER_SIZE;
    const dataEnd = dataStart + chunkSize;

    if (dataEnd > buffer.byteLength) {
      throw new Error('ImageGen: Invalid WebP chunk size.');
    }

    chunks.push({
      fourCC,
      data: buffer.slice(dataStart, dataEnd),
    });

    offset = dataEnd + (chunkSize % 2);
  }

  return chunks;
}

function serializeWebp(chunks: WebpChunk[]): Uint8Array {
  const totalSize = RIFF_HEADER_SIZE + chunks.reduce((sum, chunk) => {
    return sum + CHUNK_HEADER_SIZE + chunk.data.byteLength + (chunk.data.byteLength % 2);
  }, 0);

  const output = new Uint8Array(totalSize);
  writeAscii(output, 0, 'RIFF');
  writeUint32LE(output, 4, totalSize - 8);
  writeAscii(output, 8, 'WEBP');

  let offset = RIFF_HEADER_SIZE;
  for (const chunk of chunks) {
    writeAscii(output, offset, chunk.fourCC);
    writeUint32LE(output, offset + 4, chunk.data.byteLength);
    output.set(chunk.data, offset + CHUNK_HEADER_SIZE);
    offset += CHUNK_HEADER_SIZE + chunk.data.byteLength;

    if (chunk.data.byteLength % 2 !== 0) {
      output[offset] = 0;
      offset += 1;
    }
  }

  return output;
}

function createVp8xChunk(width: number, height: number, hasAlpha: boolean): WebpChunk {
  const data = new Uint8Array(VP8X_CHUNK_DATA_SIZE);
  data[0] = VP8X_FLAG_XMP | (hasAlpha ? VP8X_FLAG_ALPHA : 0);
  writeUint24LE(data, 4, width - 1);
  writeUint24LE(data, 7, height - 1);
  return createChunk('VP8X', data);
}

function updateVp8xChunk(existingChunk: WebpChunk, hasAlpha: boolean): WebpChunk {
  if (existingChunk.data.byteLength < VP8X_CHUNK_DATA_SIZE) {
    throw new Error('ImageGen: Invalid VP8X chunk.');
  }

  const data = existingChunk.data.slice();
  data[0] |= VP8X_FLAG_XMP;

  if (hasAlpha) {
    data[0] |= VP8X_FLAG_ALPHA;
  }

  return createChunk('VP8X', data);
}

function createChunk(fourCC: string, data: Uint8Array): WebpChunk {
  return { fourCC, data };
}

function isImageChunk(fourCC: string): boolean {
  return fourCC === 'ALPH' || fourCC === 'VP8 ' || fourCC === 'VP8L' || fourCC === 'ANMF';
}

function isReorderedChunk(fourCC: string): boolean {
  return fourCC === 'VP8X'
    || fourCC === 'ICCP'
    || fourCC === 'ANIM'
    || fourCC === 'EXIF'
    || fourCC === 'XMP '
    || isImageChunk(fourCC);
}

function buildPromptMetadataXml(metadata: PromptMetadataPayload): string {
  const prompt = escapeXml(metadata.prompt);
  const providerId = escapeXml(metadata.providerId);
  const aspectRatio = escapeXml(metadata.aspectRatio);
  const operation = escapeXml(metadata.filePrefix);
  const createdAt = escapeXml(metadata.generatedAt);

  return [
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '    <rdf:Description rdf:about=""',
    '      xmlns:dc="http://purl.org/dc/elements/1.1/"',
    '      xmlns:xmp="http://ns.adobe.com/xap/1.0/"',
    '      xmlns:imagegen="https://github.com/marquaye/vscode-imagegen/ns/1.0/">',
    '      <xmp:CreatorTool>ImageGen for VS Code</xmp:CreatorTool>',
    `      <xmp:CreateDate>${createdAt}</xmp:CreateDate>`,
    '      <dc:description>',
    '        <rdf:Alt>',
    `          <rdf:li xml:lang="x-default">${prompt}</rdf:li>`,
    '        </rdf:Alt>',
    '      </dc:description>',
    `      <imagegen:prompt>${prompt}</imagegen:prompt>`,
    `      <imagegen:providerId>${providerId}</imagegen:providerId>`,
    `      <imagegen:aspectRatio>${aspectRatio}</imagegen:aspectRatio>`,
    `      <imagegen:operation>${operation}</imagegen:operation>`,
    '    </rdf:Description>',
    '  </rdf:RDF>',
    '</x:xmpmeta>',
  ].join('\n');
}

function escapeXml(value: string): string {
  return sanitizeXmlText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function sanitizeXmlText(value: string): string {
  return Array.from(value).filter((character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      return false;
    }

    return codePoint === 0x9
      || codePoint === 0xa
      || codePoint === 0xd
      || (codePoint >= 0x20 && codePoint <= 0xd7ff)
      || (codePoint >= 0xe000 && codePoint <= 0xfffd)
      || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
  }).join('');
}

function assertValidCanvasSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('ImageGen: Invalid WebP canvas size for metadata embedding.');
  }

  const maxDimension = 2 ** 24;
  if (width > maxDimension || height > maxDimension) {
    throw new Error('ImageGen: WebP canvas size exceeds container limits.');
  }
}

function asUint8Array(value: Uint8Array): Uint8Array {
  return value instanceof Uint8Array
    ? value
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
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

function writeUint24LE(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
  buffer[offset + 2] = (value >> 16) & 0xff;
}

function readXmlTag(xml: string, tagName: string): string | undefined {
  const escapedTagName = escapeRegExp(tagName);
  const match = new RegExp(`<${escapedTagName}>([\\s\\S]*?)</${escapedTagName}>`, 'i').exec(xml);
  return match ? decodeXml(match[1].trim()) : undefined;
}

function readAltDefaultValue(xml: string): string | undefined {
  const match = /<rdf:li\s+xml:lang="x-default">([\s\S]*?)<\/rdf:li>/i.exec(xml);
  return match ? decodeXml(match[1].trim()) : undefined;
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined);
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}