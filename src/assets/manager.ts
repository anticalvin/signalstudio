import * as THREE from 'three';
import { parseGlb, type ImportReport } from './importer';
import { getAsset, putAsset, listAssets, type AssetRecord } from './store';
import { uid } from '../doc/defaults';

/** Caches normalised templates by asset id; the world clones them per node. */
export class AssetManager {
  private templates = new Map<string, THREE.Object3D>();
  private pending = new Map<string, Promise<THREE.Object3D | null>>();
  private textures = new Map<string, { tex: THREE.Texture; aspect: number }>();
  readonly records = new Map<string, Pick<AssetRecord, 'id' | 'name' | 'type' | 'thumb'>>();
  onReady: () => void = () => {};

  template(id: string): THREE.Object3D | null { return this.templates.get(id) ?? null; }
  image(id: string) { return this.textures.get(id) ?? null; }

  /** Start loading an asset from IndexedDB if it is not cached. Fires onReady when done. */
  request(id: string, type: 'glb' | 'image'): void {
    if (this.templates.has(id) || this.textures.has(id) || this.pending.has(id)) return;
    const p = getAsset(id).then(async (rec) => {
      if (!rec) { console.warn(`[assets] missing data for ${id}`); return null; }
      return type === 'glb' ? (await this.addGlb(rec.data, id)).object : (await this.addImage(rec.data, id), null);
    }).catch((e) => { console.error('[assets]', e); return null; });
    this.pending.set(id, p);
    p.then(() => this.onReady());
  }

  async addGlb(data: ArrayBuffer, id: string): Promise<{ object: THREE.Object3D; report: ImportReport }> {
    const { object, report } = await parseGlb(data);
    this.templates.set(id, object);
    return { object, report };
  }

  async addImage(data: ArrayBuffer, id: string): Promise<void> {
    const bmp = await createImageBitmap(new Blob([data]), { premultiplyAlpha: 'none' });
    const tex = new THREE.Texture(bmp as unknown as HTMLImageElement);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.needsUpdate = true;
    this.textures.set(id, { tex, aspect: bmp.width / bmp.height });
  }

  async refreshList(): Promise<void> {
    for (const r of await listAssets()) this.records.set(r.id, { id: r.id, name: r.name, type: r.type, thumb: r.thumb });
  }

  /** Import a user file. Returns the new asset id and what was repaired. */
  async importFile(file: File, makeThumb: (o: THREE.Object3D) => string): Promise<{ id: string; name: string; type: 'glb' | 'image'; report?: ImportReport }> {
    const data = await file.arrayBuffer();
    const id = uid();
    const name = file.name.replace(/\.\w+$/, '');
    const isImg = /^image\//.test(file.type) || /\.(png|webp|jpe?g)$/i.test(file.name);
    if (isImg) {
      await this.addImage(data, id);
      await putAsset({ id, name, type: 'image', data });
      this.records.set(id, { id, name, type: 'image' });
      return { id, name, type: 'image' };
    }
    const { object, report } = await this.addGlb(data, id);
    const thumb = makeThumb(object);
    await putAsset({ id, name, type: 'glb', data, thumb });
    this.records.set(id, { id, name, type: 'glb', thumb });
    return { id, name, type: 'glb', report };
  }
}
