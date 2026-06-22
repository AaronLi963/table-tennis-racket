import { useEffect, useRef, useState } from 'react';
import { analyzeForViz, scoreWithPopulation, type VizResult } from '@ttr/dsp';
import type { PopulationStats, Racket, Scores } from '@ttr/shared';
import { api } from '../api.ts';
import { MicRecorder, decodeAudioFile } from '../audio/webAudioSource.ts';
import { SpectrumChart, DecayChart } from '../components/Charts.tsx';
import { ScoreCards, FeatureTable, QualityWarnings } from '../components/Report.tsx';

export function MeasurePage() {
  const [rackets, setRackets] = useState<Racket[]>([]);
  const [racketId, setRacketId] = useState('');
  const [newName, setNewName] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [recording, setRecording] = useState(false);
  const [viz, setViz] = useState<VizResult | null>(null);
  const [population, setPopulation] = useState<PopulationStats | null>(null);
  const [scores, setScores] = useState<Scores | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const recorder = useRef(new MicRecorder());

  useEffect(() => {
    void refresh();
    void loadPopulation();
  }, []);

  async function refresh() {
    const list = await api.listRackets();
    setRackets(list);
    if (!racketId && list[0]) setRacketId(list[0].id);
  }

  async function loadPopulation() {
    const { stats } = await api.getPopulation();
    setPopulation(stats);
    return stats;
  }

  function runAnalysis(pcm: Float32Array, sampleRate: number) {
    const result = analyzeForViz({ pcm, sampleRate });
    setViz(result);
    setScores(population ? scoreWithPopulation(population, result.features) : null);
    setMsg('');
  }

  async function startRec() {
    try {
      await recorder.current.start();
      setRecording(true);
      setMsg('錄音中…請對著麥克風敲擊球拍面材中心 2–3 下，然後按停止。');
    } catch {
      setMsg('無法取得麥克風權限。');
    }
  }

  async function stopRec() {
    const audio = await recorder.current.stop();
    setRecording(false);
    if (audio.pcm.length === 0) {
      setMsg('沒有錄到聲音。');
      return;
    }
    runAnalysis(audio.pcm, audio.sampleRate);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg('解析檔案中…');
    try {
      const audio = await decodeAudioFile(file);
      runAnalysis(audio.pcm, audio.sampleRate);
    } catch {
      setMsg('無法解析此音訊檔。');
    }
  }

  async function createRacket() {
    if (!newName.trim()) return;
    const r = await api.createRacket({
      name: newName.trim(),
      brand: newBrand.trim() || undefined,
    });
    setNewName('');
    setNewBrand('');
    await refresh();
    setRacketId(r.id);
  }

  async function save() {
    if (!viz || !racketId) return;
    setBusy(true);
    try {
      await api.createMeasurement({
        racketId,
        features: viz.features,
        quality: viz.quality,
      });
      // 新量測會改變收藏分布 → 重新載入母體統計並更新相對分數
      const stats = await loadPopulation();
      setScores(stats ? scoreWithPopulation(stats, viz.features) : null);
      setMsg('✅ 已儲存量測。相對分數已依最新收藏更新。');
    } catch (err) {
      setMsg(`儲存失敗：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card">
        <h2>1. 選擇球拍</h2>
        <div className="row">
          <div>
            <label>已建立的球拍</label>
            <select value={racketId} onChange={(e) => setRacketId(e.target.value)}>
              {rackets.length === 0 && <option value="">（尚無球拍）</option>}
              {rackets.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.brand ? ` · ${r.brand}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>或新增一支</label>
            <input
              placeholder="球拍名稱"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div>
            <label>品牌（選填）</label>
            <input
              placeholder="例如 Butterfly"
              value={newBrand}
              onChange={(e) => setNewBrand(e.target.value)}
            />
          </div>
          <button className="secondary" onClick={createRacket} disabled={!newName.trim()}>
            新增
          </button>
        </div>
      </div>

      <div className="card">
        <h2>2. 擷取敲擊聲</h2>
        <div className="row">
          {!recording ? (
            <button onClick={startRec}>🎙️ 開始錄音</button>
          ) : (
            <button className="danger" onClick={stopRec}>
              ⏹️ 停止並分析
            </button>
          )}
          <div>
            <label>或上傳音訊檔（wav / mp3）</label>
            <input type="file" accept="audio/*" onChange={onFile} />
          </div>
        </div>
        {msg && <p className="muted" style={{ marginTop: 10 }}>{msg}</p>}
        <p className="muted">
          提示：敲擊「面材中心」、避免握住面材（會抑制振動），在安靜環境連敲 2–3 下取最強者分析。
        </p>
      </div>

      {viz && (
        <>
          <div className="card">
            <h2>3. 分析結果</h2>
            <QualityWarnings quality={viz.quality} />
            <ScoreCards scores={scores} />
            <div style={{ marginTop: 16 }}>
              <button onClick={save} disabled={busy || !racketId}>
                {busy ? '儲存中…' : '💾 儲存此次量測'}
              </button>
            </div>
          </div>

          <div className="card">
            <h2>頻譜（峰值 = 主共振 f0 ≈ {viz.features.f0.toFixed(0)} Hz）</h2>
            <SpectrumChart data={viz.spectrum} />
          </div>

          <div className="card">
            <h2>衰減包絡（餘音越長 → 越彈，擬合 R² = {viz.decayR2.toFixed(2)}）</h2>
            <DecayChart data={viz.envelope} />
          </div>

          <div className="card">
            <h2>原始物理特徵</h2>
            <FeatureTable features={viz.features} />
          </div>
        </>
      )}
    </div>
  );
}
