import React from 'react';
import { 
  Compass, Calendar, DollarSign, Users, Award, 
  ChevronRight, Activity, Clock, Bell, Settings,
  MapPin, Star
} from 'lucide-react';

export default function PremiumDemo() {
  return (
    <div 
      className="min-h-screen bg-[#f8fafc] text-slate-800"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Navbar Premium */}
      <nav className="bg-white/70 backdrop-blur-md border-b border-slate-200/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-turquoise-400 to-turquoise-600 flex items-center justify-center shadow-glow-turquoise">
              <Compass className="text-white w-6 h-6 z-10" />
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-azul-900 to-azul-700">
              Onyx Mahana
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors relative">
              <Bell className="w-5 h-5 text-slate-500" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-turquoise-500 rounded-full border border-white"></span>
            </button>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-200 to-slate-100 flex items-center justify-center border border-slate-200 cursor-pointer">
              <span className="font-semibold text-slate-600 text-sm">AD</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10">
        
        <header className="mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-azul-900 mb-2">
              Dashboard
            </h1>
            <p className="text-slate-500 font-medium">Un vistazo rápido al rendimiento de hoy.</p>
          </div>
          <button className="bg-turquoise-600 hover:bg-turquoise-500 text-white px-6 py-3 rounded-2xl font-semibold shadow-glow-turquoise transition-all flex items-center gap-2 transform hover:-translate-y-0.5">
            <Calendar className="w-5 h-5" />
            Nueva Reserva
          </button>
        </header>

        {/* Bento Box Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {[
            { title: "Ingresos del Mes", value: "$12,450", icon: DollarSign, color: "text-turquoise-500", bg: "bg-turquoise-50" },
            { title: "Nuevas Reservas", value: "34", icon: Calendar, color: "text-blue-500", bg: "bg-blue-50" },
            { title: "Tours Activos", value: "8", icon: Activity, color: "text-orange-500", bg: "bg-orange-50" },
            { title: "Clientes Atendidos", value: "1,248", icon: Users, color: "text-purple-500", bg: "bg-purple-50" },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-3xl p-6 shadow-premium border border-slate-100/50 hover:shadow-premium-lg transition-all duration-300">
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-2xl ${stat.bg}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
              <div>
                <p className="text-slate-400 font-semibold text-sm mb-1">{stat.title}</p>
                <p className="text-3xl font-bold text-azul-900">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main List */}
          <div className="lg:col-span-2 bg-white rounded-3xl p-8 shadow-premium border border-slate-100/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-turquoise-50 rounded-full blur-3xl opacity-50 -mr-20 -mt-20 pointer-events-none"></div>
            
            <div className="flex justify-between items-center mb-8 relative z-10">
              <h2 className="text-2xl font-bold text-azul-900">Reservas Recientes</h2>
              <button className="text-turquoise-600 font-medium text-sm flex items-center gap-1 hover:text-turquoise-700">
                Ver Todas <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 relative z-10">
              {[1, 2, 3].map((_, i) => (
                <div key={i} className="group p-5 rounded-2xl border border-slate-100 hover:border-turquoise-200 bg-slate-50/50 hover:bg-turquoise-50/30 transition-all cursor-pointer flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-600 font-bold border border-slate-100">
                      JS
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">John Smith</h3>
                      <p className="text-sm text-slate-500 flex items-center gap-2">
                        <MapPin className="w-3 h-3" /> Tour Panorámico
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                      Confirmada
                    </span>
                    <p className="text-sm font-semibold text-slate-600 mt-2">$250.00</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions / Side Panel */}
          <div className="bg-[#0f172a] rounded-3xl p-8 shadow-premium-lg text-white relative overflow-hidden">
             <div className="absolute top-0 right-0 w-40 h-40 bg-turquoise-500 rounded-full blur-[80px] opacity-20 pointer-events-none"></div>
             <h2 className="text-2xl font-bold mb-6">Vista Rápida</h2>
             
             <div className="space-y-6">
                <div className="bg-white/5 rounded-2xl p-5 border border-white/10 backdrop-blur-sm">
                  <div className="flex items-center gap-3 mb-2">
                     <Star className="text-yellow-400 w-5 h-5 fill-current" />
                     <h3 className="font-bold text-lg">Rating Promedio</h3>
                  </div>
                  <p className="text-3xl font-extrabold text-white">4.9<span className="text-slate-400 text-lg font-medium">/5</span></p>
                </div>

                <div className="bg-white/5 rounded-2xl p-5 border border-white/10 backdrop-blur-sm">
                  <div className="flex items-center gap-3 mb-3">
                     <Clock className="text-turquoise-400 w-5 h-5" />
                     <h3 className="font-bold text-lg">Próximo Tour</h3>
                  </div>
                  <p className="font-medium text-white">Isla Tortuga Exprés</p>
                  <p className="text-sm text-slate-400 mt-1">Hoy a las 14:00 hrs</p>
                  <button className="w-full mt-4 bg-white/10 hover:bg-white/20 text-white py-2 rounded-xl text-sm font-semibold transition-colors">
                    Ver Detalles
                  </button>
                </div>
             </div>
          </div>
        </div>

      </main>
    </div>
  );
}
