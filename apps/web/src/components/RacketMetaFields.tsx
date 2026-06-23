import { DEFAULT_STRUCTURES, type Racket, type RacketInput } from '@ttr/shared';

/** 球拍可編輯欄位的表單狀態（全部以字串表示，方便輸入） */
export interface RacketMeta {
  brand: string;
  structure: string;
  weight: string;
  tags: string;
  notes: string;
}

export const EMPTY_META: RacketMeta = {
  brand: '',
  structure: '',
  weight: '',
  tags: '',
  notes: '',
};

/** 表單狀態 → API 輸入 */
export function metaToInput(m: RacketMeta): RacketInput {
  return {
    brand: m.brand.trim() || null,
    structure: m.structure.trim() || null,
    weight: m.weight.trim() === '' ? null : Number(m.weight),
    tags: m.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    notes: m.notes.trim() || null,
  };
}

/** 既有球拍 → 表單狀態 */
export function racketToMeta(r: Racket): RacketMeta {
  return {
    brand: r.brand ?? '',
    structure: r.structure ?? '',
    weight: r.weight != null ? String(r.weight) : '',
    tags: (r.tags ?? []).join(', '),
    notes: r.notes ?? '',
  };
}

/** 合併預設結構與收藏中已用過的結構，作為下拉建議（仍可自由輸入新值） */
export function structureOptionsFrom(rackets: Racket[]): string[] {
  const set = new Set<string>(DEFAULT_STRUCTURES);
  for (const r of rackets) {
    const s = r.structure?.trim();
    if (s) set.add(s);
  }
  return [...set];
}

export function RacketMetaFields({
  meta,
  onChange,
  structureOptions = [...DEFAULT_STRUCTURES],
}: {
  meta: RacketMeta;
  onChange: (m: RacketMeta) => void;
  structureOptions?: string[];
}) {
  const set = (patch: Partial<RacketMeta>) => onChange({ ...meta, ...patch });
  return (
    <>
      <div>
        <label>品牌</label>
        <input
          placeholder="例如 Butterfly"
          value={meta.brand}
          onChange={(e) => set({ brand: e.target.value })}
        />
      </div>
      <div>
        <label>結構（可自由輸入新值）</label>
        <input
          list="structure-options"
          placeholder="外置 / 內置 / 純木…"
          value={meta.structure}
          onChange={(e) => set({ structure: e.target.value })}
        />
        <datalist id="structure-options">
          {structureOptions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <div>
        <label>重量 (g)</label>
        <input
          type="number"
          min={0}
          placeholder="例如 88"
          style={{ width: 90 }}
          value={meta.weight}
          onChange={(e) => set({ weight: e.target.value })}
        />
      </div>
      <div>
        <label>標籤（逗號分隔）</label>
        <input
          placeholder="進攻, 已貼皮"
          value={meta.tags}
          onChange={(e) => set({ tags: e.target.value })}
        />
      </div>
      <div style={{ flexBasis: '100%' }}>
        <label>備註</label>
        <textarea
          rows={2}
          style={{ width: '100%', resize: 'vertical' }}
          placeholder="任何想記錄的資訊…"
          value={meta.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
    </>
  );
}
