import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicReview, submitPublicReview, ReviewData } from '../api/api'
import { Star, Send, ExternalLink, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'

const CATEGORIES = [
  { key: 'score_general', label: 'Experiencia General', emoji: '🌟' },
  { key: 'score_guia', label: 'Guía / Instructor', emoji: '🧑‍🏫' },
  { key: 'score_puntualidad', label: 'Puntualidad', emoji: '⏰' },
  { key: 'score_equipamiento', label: 'Equipamiento', emoji: '🛶' },
  { key: 'score_valor', label: 'Valor por Dinero', emoji: '💰' },
]

function StarRating({ value, onChange, size = 'lg' }: { value: number; onChange: (v: number) => void; size?: 'sm' | 'lg' }) {
  const [hover, setHover] = useState(0)
  const starSize = size === 'lg' ? 'w-10 h-10' : 'w-8 h-8'

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="transition-transform hover:scale-110 active:scale-95"
        >
          <Star
            className={`${starSize} transition-colors duration-150 ${
              star <= (hover || value)
                ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]'
                : 'text-gray-300'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

export default function ReviewPage() {
  const { codigo } = useParams<{ codigo: string }>()
  const [reviewData, setReviewData] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [redirectGoogle, setRedirectGoogle] = useState(false)
  const [googleUrl, setGoogleUrl] = useState<string | null>(null)

  const [scores, setScores] = useState<Record<string, number>>({
    score_general: 0,
    score_guia: 0,
    score_puntualidad: 0,
    score_equipamiento: 0,
    score_valor: 0,
  })
  const [comentario, setComentario] = useState('')

  useEffect(() => {
    if (!codigo) return
    loadReviewData()
  }, [codigo])

  async function loadReviewData() {
    setLoading(true)
    const res = await getPublicReview(codigo!)
    if (res.success) {
      setReviewData(res.data)
    } else {
      if (res.error?.code === 'ALREADY_REVIEWED') {
        setError('already')
      } else {
        setError(res.error?.message || 'Enlace no válido')
      }
    }
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (scores.score_general === 0) {
      setError('Por favor selecciona al menos la experiencia general')
      return
    }

    setSubmitting(true)
    setError('')

    const data: any = { score_general: scores.score_general }
    if (scores.score_guia > 0) data.score_guia = scores.score_guia
    if (scores.score_puntualidad > 0) data.score_puntualidad = scores.score_puntualidad
    if (scores.score_equipamiento > 0) data.score_equipamiento = scores.score_equipamiento
    if (scores.score_valor > 0) data.score_valor = scores.score_valor
    if (comentario.trim()) data.comentario = comentario.trim()

    const res = await submitPublicReview(codigo!, data)
    setSubmitting(false)

    if (res.success) {
      setSubmitted(true)
      setRedirectGoogle(res.data.redirect_google)
      setGoogleUrl(res.data.google_review_url)
    } else {
      setError(res.error?.message || 'Error al enviar reseña')
    }
  }

  function formatDate(fecha: string) {
    if (!fecha) return ''
    try {
      const d = new Date(fecha + 'T12:00:00')
      return d.toLocaleDateString('es-PA', { day: 'numeric', month: 'long', year: 'numeric' })
    } catch {
      return fecha
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-cyan-900 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
      </div>
    )
  }

  // Error / already reviewed
  if (error === 'already') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-cyan-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Ya enviaste tu reseña!</h2>
          <p className="text-gray-500">Gracias por tomarte el tiempo de compartir tu experiencia con nosotros. 🌴</p>
        </div>
      </div>
    )
  }

  if (error && !reviewData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-cyan-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Enlace no disponible</h2>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  // Thank you screen
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-cyan-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center space-y-6">
          {redirectGoogle ? (
            <>
              <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-amber-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-amber-400/30">
                <span className="text-4xl">🎉</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-800">¡Nos alegra que la pasaste bien!</h2>
              <p className="text-gray-600">
                ¿Te animarías a compartir tu experiencia en Google? Tu reseña nos ayuda a llegar a más personas. 🙏
              </p>
              {googleUrl && (
                <a
                  href={googleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white px-8 py-4 rounded-xl font-semibold text-lg shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 hover:scale-105 transition-all duration-200"
                >
                  <Star className="w-5 h-5 fill-white" />
                  Dejar reseña en Google
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <button
                onClick={() => window.close()}
                className="block w-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                No gracias, cerrar
              </button>
            </>
          ) : (
            <>
              <div className="w-20 h-20 bg-gradient-to-br from-cyan-400 to-cyan-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-cyan-400/30">
                <span className="text-4xl">🙏</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Gracias por tu feedback</h2>
              <p className="text-gray-600">
                Tu opinión es muy valiosa para nosotros. Trabajaremos en mejorar tu experiencia. 🌴
              </p>
            </>
          )}
          <div className="pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">Mahana Tours — Experiencias que transforman 🏄‍♂️</p>
          </div>
        </div>
      </div>
    )
  }

  // Review form
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-cyan-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 py-6 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L3N2Zz4=')] opacity-50"></div>
        <div className="relative">
          <h1 className="text-2xl font-bold text-blue-950">Mahana Tours</h1>
          <p className="text-blue-900/80 text-sm mt-1">Experiencias que transforman 🌴</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-6 -mt-2">
        {/* Tour card */}
        <div className="bg-white rounded-2xl shadow-xl p-5 mb-6 border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">Tu experiencia</p>
          <h2 className="text-xl font-bold text-gray-800">{reviewData?.actividad || 'Tour'}</h2>
          <div className="flex flex-wrap gap-3 mt-3 text-sm text-gray-500">
            {reviewData?.fecha && (
              <span className="bg-gray-50 px-3 py-1 rounded-full">📅 {formatDate(reviewData.fecha)}</span>
            )}
            {reviewData?.responsable && (
              <span className="bg-gray-50 px-3 py-1 rounded-full">🧑‍🏫 {reviewData.responsable}</span>
            )}
          </div>
          <p className="mt-2 text-sm text-gray-400">
            Hola <span className="font-medium text-gray-600">{reviewData?.cliente}</span>, cuéntanos cómo fue tu experiencia.
          </p>
        </div>

        {/* Title */}
        <h3 className="text-white text-lg font-semibold mb-4 text-center">¿Cómo fue tu experiencia?</h3>

        {/* Ratings */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {CATEGORIES.map((cat, idx) => (
            <div
              key={cat.key}
              className={`bg-white/95 backdrop-blur-sm rounded-xl p-4 shadow-md border border-white/20 transition-all duration-300 ${
                idx === 0 ? 'ring-2 ring-amber-400/50' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{cat.emoji}</span>
                  <span className="font-medium text-gray-700 text-sm">{cat.label}</span>
                  {idx === 0 && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Requerido</span>}
                </div>
              </div>
              <div className="mt-2 flex justify-center">
                <StarRating
                  value={scores[cat.key]}
                  onChange={(v) => setScores(prev => ({ ...prev, [cat.key]: v }))}
                  size={idx === 0 ? 'lg' : 'sm'}
                />
              </div>
            </div>
          ))}

          {/* Comment */}
          <div className="bg-white/95 backdrop-blur-sm rounded-xl p-4 shadow-md border border-white/20">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <span>💬</span> Cuéntanos más (opcional)
            </label>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none transition-all"
              rows={3}
              placeholder="¿Qué fue lo mejor? ¿Qué podríamos mejorar?"
              maxLength={500}
            />
            {comentario.length > 0 && (
              <p className="text-xs text-gray-400 text-right mt-1">{comentario.length}/500</p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={submitting || scores.score_general === 0}
            className={`w-full py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition-all duration-300 shadow-lg ${
              scores.score_general > 0
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:shadow-amber-500/40 hover:scale-[1.02] active:scale-[0.98]'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Send className="w-5 h-5" />
                Enviar Reseña
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="text-center mt-6 pb-8">
          <p className="text-white/40 text-xs">Gracias por ayudarnos a mejorar 🌴</p>
          <p className="text-white/30 text-[10px] mt-1">Mahana Tours © {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  )
}
