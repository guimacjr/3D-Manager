import fs from "node:fs";
import path from "node:path";

type MediaType = "photo" | "video" | "3mf";

const folderByType: Record<MediaType, string> = {
  photo: "photos",
  video: "videos",
  "3mf": "models",
};

const defaultExtByType: Record<MediaType, string> = {
  photo: ".jpg",
  video: ".mp4",
  "3mf": ".3mf",
};

function fileUriToPath(input: string): string {
  if (!input.startsWith("file://")) {
    return input;
  }

  const decoded = decodeURIComponent(input.replace("file://", ""));

  // Handles file:///C:/... produced on Windows.
  if (/^\/[a-zA-Z]:\//.test(decoded)) {
    return decoded.slice(1);
  }

  return decoded;
}

function toAbsolutePath(filePathOrUri: string): string {
  const parsed = fileUriToPath(filePathOrUri);
  return path.isAbsolute(parsed) ? parsed : path.resolve(process.cwd(), parsed);
}

function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName).trim();
  const normalized = base.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
  return normalized || "arquivo";
}

function buildOwnerFolder(mediaRoot: string, ownerType: string, ownerId: string, mediaType: MediaType): string {
  return path.join(mediaRoot, ownerType, ownerId, folderByType[mediaType]);
}

export function ensureMediaStorage(mediaRoot: string) {
  fs.mkdirSync(path.join(mediaRoot, "quotes"), { recursive: true });
}

export function persistMediaFile(params: {
  mediaRoot: string;
  mediaType: MediaType;
  localUri: string;
  backendRoot: string;
  ownerType: "quotes";
  ownerId: string;
}) {
  const { mediaRoot, mediaType, localUri, backendRoot, ownerType, ownerId } = params;

  if (localUri.startsWith("storage/media/")) {
    const absolute = path.join(backendRoot, localUri);
    if (fs.existsSync(absolute)) {
      return {
        relativePath: localUri,
        absolutePath: absolute,
      };
    }
  }

  const sourcePath = toAbsolutePath(localUri);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Arquivo de midia nao encontrado: ${sourcePath}`);
  }

  const sourceStat = fs.statSync(sourcePath);
  if (!sourceStat.isFile()) {
    throw new Error(`Midia informada nao e arquivo: ${sourcePath}`);
  }

  const sourceBaseName = sanitizeFileName(path.basename(sourcePath));
  const sourceExt = path.extname(sourceBaseName).toLowerCase();
  const finalName = sourceExt ? sourceBaseName : `${sourceBaseName}${defaultExtByType[mediaType]}`;
  const destFolder = buildOwnerFolder(mediaRoot, ownerType, ownerId, mediaType);
  const destAbsolute = path.join(destFolder, finalName);
  fs.mkdirSync(destFolder, { recursive: true });

  fs.copyFileSync(sourcePath, destAbsolute);

  return {
    relativePath: path.posix.join("storage", "media", ownerType, ownerId, folderByType[mediaType], finalName),
    absolutePath: destAbsolute,
  };
}

export function persistUploadedBuffer(params: {
  mediaRoot: string;
  mediaType: MediaType;
  originalName?: string;
  buffer: Buffer;
  ownerType: "quotes";
  ownerId: string;
}) {
  const { mediaRoot, mediaType, originalName, buffer, ownerType, ownerId } = params;
  const originalBaseName = sanitizeFileName(originalName || "arquivo");
  const originalExt = path.extname(originalBaseName).toLowerCase();
  const finalName = originalExt
    ? originalBaseName
    : `${originalBaseName}${defaultExtByType[mediaType]}`;
  const destFolder = buildOwnerFolder(mediaRoot, ownerType, ownerId, mediaType);
  const destAbsolute = path.join(destFolder, finalName);
  fs.mkdirSync(destFolder, { recursive: true });

  if (fs.existsSync(destAbsolute)) {
    throw new Error(
      `Ja existe um arquivo com este nome para este orcamento: ${finalName}. Renomeie o arquivo e tente novamente.`
    );
  }

  fs.writeFileSync(destAbsolute, buffer);

  return {
    relativePath: path.posix.join("storage", "media", ownerType, ownerId, folderByType[mediaType], finalName),
    absolutePath: destAbsolute,
  };
}
