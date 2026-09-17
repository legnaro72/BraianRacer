const FOLDER_NAME = "Foto Matrimonio Irene Daniele";

function getOrCreateFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty("FOLDER_ID");

  if (savedId) {
    try {
      return DriveApp.getFolderById(savedId);
    } catch (err) {
      // The saved folder no longer exists: find or recreate it below.
    }
  }

  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(FOLDER_NAME);
  props.setProperty("FOLDER_ID", folder.getId());
  return folder;
}

function setup() {
  const props = PropertiesService.getScriptProperties();
  getOrCreateFolder_();

  if (!props.getProperty("API_TOKEN")) {
    const token =
      Utilities.getUuid().replace(/-/g, "") +
      Utilities.getUuid().replace(/-/g, "");
    props.setProperty("API_TOKEN", token);
  }
}

function doGet() {
  return json_({ok: true, service: "Foto Matrimonio Drive Backend"});
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const expectedToken = PropertiesService.getScriptProperties().getProperty("API_TOKEN");

    if (!expectedToken || body.token !== expectedToken) {
      return json_({ok: false, error: "Unauthorized"});
    }

    if (body.action === "upload") return uploadPhoto_(body);
    if (body.action === "get") return getPhoto_(body);
    if (body.action === "list") return listPhotos_();
    if (body.action === "delete") return deletePhoto_(body);

    return json_({ok: false, error: "Unknown action"});
  } catch (err) {
    return json_({ok: false, error: String(err)});
  }
}

function uploadPhoto_(body) {
  if (!body.filename || !body.data) throw new Error("filename e data sono obbligatori");

  const mimeType = body.mimeType || "application/octet-stream";
  if (!mimeType.startsWith("image/")) throw new Error("Sono consentite solo immagini");

  const filename = String(body.filename).replace(/[/\\]/g, "_").substring(0, 200);
  const bytes = Utilities.base64Decode(body.data);
  const blob = Utilities.newBlob(bytes, mimeType, filename);
  const file = getOrCreateFolder_().createFile(blob);

  return json_({ok: true, fileId: file.getId(), filename: file.getName()});
}

function getPhoto_(body) {
  const file = authorizedFile_(body.fileId);
  const blob = file.getBlob();

  return json_({
    ok: true,
    fileId: file.getId(),
    filename: file.getName(),
    mimeType: blob.getContentType(),
    data: Utilities.base64Encode(blob.getBytes())
  });
}

function listPhotos_() {
  const files = getOrCreateFolder_().getFiles();
  const result = [];

  while (files.hasNext()) {
    const file = files.next();
    result.push({
      fileId: file.getId(),
      filename: file.getName(),
      mimeType: file.getMimeType(),
      size: file.getSize(),
      created: file.getDateCreated().toISOString()
    });
  }

  return json_({ok: true, files: result});
}

function deletePhoto_(body) {
  const file = authorizedFile_(body.fileId);
  file.setTrashed(true);
  return json_({ok: true, fileId: file.getId()});
}

function authorizedFile_(fileId) {
  if (!fileId) throw new Error("fileId obbligatorio");

  const file = DriveApp.getFileById(fileId);
  if (!isFileInsideFolder_(file, getOrCreateFolder_())) {
    throw new Error("File non autorizzato");
  }
  return file;
}

function isFileInsideFolder_(file, folder) {
  const parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === folder.getId()) return true;
  }
  return false;
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
