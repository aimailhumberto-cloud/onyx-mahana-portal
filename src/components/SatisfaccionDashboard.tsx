import { useState, useEffect } from 'react'
import { getSatisfaccion, getSatisfaccionRanking, SatisfaccionData } from '../api/api'
import { Star, Award, BarChart3, Users, Activity, ExternalLink } from 'lucide-react'

function Stars({ score, size = 'sm' }: { score: number | null; size?: 'sm' | 'lg' }) {
  if (!score) return <span className="text-gray-400 text-xs">Sin datos</span>
  const full = Math.floor(score)
  const half = score - full >= 0.5
  const starSize = size === 'lg' ? 'w-6 h-6' : 'w-4 h-4'

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`${starSize} ${
          i <= full ? 'fill-amber-400 text-amber-400' :
          (i === full + 1 && half) ? 'fill-amber-400/50 text-amber-400' :
          'text-gray-200'
        }`} />
      ))}
      <span className={`ml-1 font-bold ${size === 'lg' ? 'text-2xl' : 'text-sm'} text-gray-800`}>{score}</span>
    </div>
  )
}

function ScoreBar({ label, score }: { label: string; score: number | null }) {
  const val = score || 0
  const pct = (val / 5) * 100
  const color = val >= 4 ? 'bg-green-500' : val >= 3 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-28 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-gray-700 w-8 text-right">{score || '—'}</span>
    </div>
  )
}

export default function SatisfaccionDashboard() {
  const [data, setData] = useState<SatisfaccionData | null>(null)
  const [ranking, setRanking] = useState<any[]>([])
  const [rankingVendedor, setRankingVendedor] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'ranking' | 'reviews'>('overview')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [satRes, rankRes, rankVendRes] = await Promise.all([
      getSatisfaccion(),
      getSatisfaccionRanking('actividad'),
      getSatisfaccionRanking('vendedor')
    ])

    if (satRes.success) setData(satRes.data)
    if (rankRes.success) setRanking(rankRes.data)
    if (rankVendRes.success) setRankingVendedor(rankVendRes.data)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="text-center py-20 text-gray-400">Cargando datos de satisfacción...</div>
    )
  }

  const gen = data?.general

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">⭐ Satisfacción de Clientes</h1>
        <p className="text-sm text-gray-500">Métricas de calidad por tour, proveedor y tendencia</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { key: 'overview', label: 'Resumen', icon: BarChart3 },
          { key: 'ranking', label: 'Ranking', icon: Award },
          { key: 'reviews', label: 'Reseñas', icon: Star },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Score general */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm col-span-1 text-center">
              <p className="text-sm text-gray-500 mb-2">Score General</p>
              <div className="flex justify-center mb-2">
                <Stars score={gen?.avg_general || null} size="lg" />
              </div>
              <p className="text-sm text-gray-400">{gen?.total_resenas || 0} reseñas</p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm col-span-1">
              <p className="text-sm text-gray-500 mb-3">Desglose por Categoría</p>
              <div className="space-y-2.5">
                <ScoreBar label="🌟 General" score={gen?.avg_general || null} />
                <ScoreBar label="🧑‍🏫 Guía" score={gen?.avg_guia || null} />
                <ScoreBar label="⏰ Puntualidad" score={gen?.avg_puntualidad || null} />
                <ScoreBar label="🛶 Equipo" score={gen?.avg_equipamiento || null} />
                <ScoreBar label="💰 Valor" score={gen?.avg_valor || null} />
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm col-span-1">
              <p className="text-sm text-gray-500 mb-3">Distribución</p>
              <div className="space-y-2">
                {[5, 4, 3, 2, 1].map(score => {
                  const count = data?.distribucion.find(d => d.score === score)?.count || 0
                  const total = gen?.total_resenas || 1
                  const pct = Math.round((count / total) * 100)
                  return (
                    <div key={score} className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 w-12 flex items-center gap-1">
                        {score} <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      </span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            score >= 4 ? 'bg-green-500' : score === 3 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-16 text-right">{count} ({pct}%)</span>
                    </div>
                  )
                })}
              </div>
              {gen && gen.enviados_google > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-green-600">
                  <ExternalLink className="w-3 h-3" />
                  {gen.enviados_google} enviados a Google Reviews
                </div>
              )}
            </div>
          </div>

          {/* Trend */}
          {data?.tendencia && data.tendencia.length > 0 && (
            <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">📈 Tendencia Mensual</h3>
              <div className="flex items-end gap-2 h-40">
                {data.tendencia.map((t, i) => {
                  const height = ((t.avg_score || 0) / 5) * 100
                  const color = (t.avg_score || 0) >= 4 ? 'bg-green-500' : (t.avg_score || 0) >= 3 ? 'bg-yellow-500' : 'bg-red-500'
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-bold text-gray-700">{t.avg_score}</span>
                      <div className="w-full bg-gray-100 rounded-t-lg relative" style={{ height: '100%' }}>
                        <div className={`absolute bottom-0 left-0 right-0 ${color} rounded-t-lg transition-all duration-500`}
                          style={{ height: `${height}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400">{t.mes?.substring(5)}</span>
                      <span className="text-[10px] text-gray-300">{t.total}r</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ranking Tab */}
      {tab === 'ranking' && (
        <div className="space-y-6">
          {/* By tour */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <h3 className="font-semibold text-gray-700">Ranking por Tour</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {ranking.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">Sin datos de satisfacción aún</div>
              ) : (
                ranking.map((r, i) => (
                  <div key={i} className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      i === 0 ? 'bg-amber-100 text-amber-700' :
                      i === 1 ? 'bg-gray-200 text-gray-600' :
                      i === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 text-sm">{r.nombre}</p>
                      <p className="text-xs text-gray-400">{r.total_resenas} reseñas</p>
                    </div>
                    <Stars score={r.avg_general} />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* By vendor */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-600" />
              <h3 className="font-semibold text-gray-700">Ranking por Vendedor/Partner</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {rankingVendedor.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">Sin datos de satisfacción aún</div>
              ) : (
                rankingVendedor.map((r, i) => (
                  <div key={i} className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-700">
                      {r.nombre?.charAt(0) || '#'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 text-sm">{r.nombre}</p>
                      <div className="flex gap-3 text-xs text-gray-400">
                        <span>{r.total_resenas} reseñas</span>
                        <span>Guía: {r.avg_guia || '—'}</span>
                        <span>Puntualidad: {r.avg_puntualidad || '—'}</span>
                      </div>
                    </div>
                    <Stars score={r.avg_general} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reviews Tab */}
      {tab === 'reviews' && (
        <div className="space-y-3">
          {!data?.recientes || data.recientes.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
              <Star className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-600">Sin reseñas aún</h3>
              <p className="text-sm text-gray-400">Las reseñas de clientes aparecerán aquí</p>
            </div>
          ) : (
            data.recientes.map((r) => (
              <div key={r.id} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <Stars score={r.score_general} />
                    <p className="text-sm text-gray-800 font-medium mt-1">{r.cliente || 'Cliente anónimo'}</p>
                    <div className="flex gap-3 mt-1 text-xs text-gray-400">
                      {r.actividad && <span>🏄 {r.actividad}</span>}
                      {r.vendedor && <span>🏢 {r.vendedor}</span>}
                      {r.responsable && <span>🧑‍🏫 {r.responsable}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('es-PA')}</span>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {r.fuente === 'link_resena' && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Automática</span>}
                      {r.fuente === 'solicitada' && <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">📋 Solicitada</span>}
                      {r.fuente === 'manual' && <span className="text-[10px] bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded">Manual</span>}
                      {r.redirigido_google ? <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded">→ Google</span> : null}
                    </div>
                  </div>
                </div>
                {r.comentario && (
                  <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg p-3 italic">"{r.comentario}"</p>
                )}
                {r.score_guia && (
                  <div className="flex gap-4 mt-3 text-xs text-gray-400">
                    <span>Guía: <b className="text-gray-600">{r.score_guia}/5</b></span>
                    {r.score_puntualidad && <span>Puntualidad: <b className="text-gray-600">{r.score_puntualidad}/5</b></span>}
                    {r.score_equipamiento && <span>Equipo: <b className="text-gray-600">{r.score_equipamiento}/5</b></span>}
                    {r.score_valor && <span>Valor: <b className="text-gray-600">{r.score_valor}/5</b></span>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
