export interface GenerateMessage {
  type: 'generate';
  prompt: string;
  provider: string;
  aspectRatio: string;
  resolution?: string;
  providerQuality?: string;
  quality: number;
}

export interface EditMessage {
  type: 'edit';
  prompt: string;
  inputImage: string;
  provider: string;
  aspectRatio: string;
  providerQuality?: string;
  quality: number;
}

export interface InsertMessage {
  type: 'insert';
  markdownLink: string;
}

export interface RevealFileMessage {
  type: 'revealFile';
  absolutePath: string;
}

export interface OpenFileInEditorMessage {
  type: 'openFileInEditor';
  absolutePath: string;
}

export interface InspectMetadataMessage {
  type: 'inspectMetadata';
  absolutePath: string;
}

export interface SaveApiKeyMessage {
  type: 'saveApiKey';
  keyName: string;
  keyValue: string;
}

export interface AbortMessage {
  type: 'abort';
}

export type WebviewMessage =
  | GenerateMessage
  | EditMessage
  | InsertMessage
  | RevealFileMessage
  | OpenFileInEditorMessage
  | InspectMetadataMessage
  | SaveApiKeyMessage
  | AbortMessage;
