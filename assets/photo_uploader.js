const DB_NAME = 'irene-daniele-photo-upload';
const STORE_NAME = 'pending-files';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, {keyPath: 'id'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(mode, operation) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = operation(store);
    tx.oncomplete = () => { db.close(); resolve(result?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

const allRecords = () => transaction('readonly', store => store.getAll());
const putRecord = record => transaction('readwrite', store => store.put(record));
const deleteRecord = id => transaction('readwrite', store => store.delete(id));
async function clearOwner(owner) {
  const rows = await allRecords();
  await Promise.all(rows.filter(row => row.owner === owner).map(row => deleteRecord(row.id)));
}

function fileAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

class PersistentPhotoUploader {
  constructor(parent, component) {
    this.parent = parent;
    this.component = component;
    this.root = parent.querySelector('#persistent-photo-uploader');
    this.owner = component.data.owner;
    this.ackKey = `irene-daniele-photo-ack:${this.owner}`;
    this.ackId = localStorage.getItem(this.ackKey) || '';
    this.sending = false;
    this.current = null;
    this.attempt = 0;
    this.total = 0;
    this.render();
    this.refresh();
    this.update(component);
  }

  update(component) {
    this.component = component;
    const ack = component.data.ack;
    if (ack?.request_id && ack.request_id !== this.ackId) {
      this.ackId = ack.request_id;
      localStorage.setItem(this.ackKey, this.ackId);
      this.handleAck(ack);
    }
  }

  render() {
    this.root.innerHTML = `<div class="upload-card">
      <label class="picker"><strong>📷 Scegli le foto</strong><span>Puoi restare nella galleria quanto vuoi</span>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple>
      </label>
      <div class="selection" role="status">Nessuna foto selezionata.</div>
      <button class="upload" disabled>Carica le foto</button>
      <button class="clear" disabled>Annulla selezione</button>
      <div class="progress-track" aria-hidden="true"><i></i></div>
      <div class="progress" aria-live="polite"></div>
    </div>`;
    this.input = this.root.querySelector('input');
    this.selection = this.root.querySelector('.selection');
    this.upload = this.root.querySelector('.upload');
    this.clear = this.root.querySelector('.clear');
    this.bar = this.root.querySelector('.progress-track i');
    this.progress = this.root.querySelector('.progress');
    this.input.addEventListener('change', event => this.choose([...event.target.files]));
    this.upload.addEventListener('click', () => { this.sending = true; this.sendNext(); });
    this.clear.addEventListener('click', async () => {
      if (this.sending) return;
      await clearOwner(this.owner); this.input.value = ''; this.total = 0; this.setProgress(0);
      this.progress.textContent = ''; await this.refresh();
    });
  }

  setProgress(value) { this.bar.style.width = `${Math.max(0, Math.min(100, value))}%`; }

  async choose(files) {
    const maxFiles = Number(this.component.data.max_files || 20);
    const maxBytes = Number(this.component.data.max_bytes || 10485760);
    if (!files.length) return;
    if (files.length > maxFiles) {
      this.progress.textContent = `Puoi scegliere al massimo ${maxFiles} foto.`; return;
    }
    const oversized = files.find(file => file.size > maxBytes);
    if (oversized) {
      this.progress.textContent = `${oversized.name} supera il limite di 10 MB.`; return;
    }
    await clearOwner(this.owner);
    this.total = 0;
    this.setProgress(0);
    const stamp = Date.now();
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      await putRecord({
        id: `${this.owner}:${stamp}:${index}`, owner: this.owner, name: file.name,
        mime: file.type || '', size: file.size, blob: file, order: index,
      });
    }
    this.progress.textContent = 'Selezione conservata sul telefono. Ora puoi caricarla.';
    await this.refresh();
  }

  async rows() {
    return (await allRecords()).filter(row => row.owner === this.owner).sort((a, b) => a.order - b.order);
  }

  async refresh() {
    const rows = await this.rows();
    const totalMb = rows.reduce((sum, row) => sum + row.size, 0) / 1048576;
    this.selection.textContent = rows.length
      ? `${rows.length} foto pronte · ${totalMb.toFixed(1)} MB`
      : 'Nessuna foto selezionata.';
    this.upload.disabled = !rows.length || this.sending;
    this.clear.disabled = !rows.length || this.sending;
  }

  async sendNext() {
    if (!this.sending || this.current) return;
    const rows = await this.rows();
    if (!rows.length) {
      this.sending = false;
      this.setProgress(100);
      this.progress.textContent = '✓ Tutte le foto sono state caricate.';
      await this.refresh();
      return;
    }
    if (!this.total) this.total = rows.length;
    this.current = rows[0];
    this.attempt += 1;
    const currentNumber = this.total - rows.length + 1;
    this.setProgress((currentNumber - 1) / this.total * 100);
    this.progress.textContent = `Foto ${currentNumber} di ${this.total} · caricamento in corso…`;
    await this.refresh();
    try {
      const data = await fileAsBase64(this.current.blob);
      const requestId = `${this.current.id}:${this.attempt}`;
      this.component.setStateValue('item', {
        request_id: requestId, local_id: this.current.id, name: this.current.name,
        mime: this.current.mime, data,
      });
    } catch (_) {
      this.sending = false; this.current = null;
      this.progress.textContent = 'Non riesco a leggere questa foto. Selezionala nuovamente.';
      await this.refresh();
    }
  }

  async handleAck(ack) {
    if (!ack.local_id) return;
    if (ack.ok) {
      await deleteRecord(ack.local_id);
      this.current = null;
      this.sending = true;
      await this.sendNext();
    } else {
      this.sending = false; this.current = null;
      this.progress.textContent = ack.message || 'Caricamento non riuscito. Premi Carica per riprovare.';
      await this.refresh();
    }
  }
}

export default function(component) {
  const parent = component.parentElement;
  if (!parent.__persistentPhotoUploader) {
    parent.__persistentPhotoUploader = new PersistentPhotoUploader(parent, component);
  } else {
    parent.__persistentPhotoUploader.update(component);
  }
}
